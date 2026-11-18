import { createLogger } from '@whatsapp-platform/shared';
import { getPlatformRepository, PlatformRepository } from '@whatsapp-platform/database';
import {
  AiProvider,
  createAiProvider,
  AiChatMessage,
  AiCompletionResponse,
} from './index.js';
import {
  ToolRegistry,
  getToolRegistry,
  ToolExecutionResult,
  createTrustedToolContext,
} from './tool-registry.js';
import { AgentRoleType, AgentFactory, SpecializedAgent } from './specialized-agents.js';

const logger = createLogger({ name: 'ai-orchestrator' });

export interface OrchestratorRequest {
  agentRole: AgentRoleType;
  prompt: string;
  conversationHistory?: AiChatMessage[];
  context?: {
    tenantId?: string;
    phoneNumber?: string;
    customerId?: string;
    conversationId?: string;
    userName?: string;
    initiatingUser?: string;
    userEmail?: string;
    isPlatformActor?: boolean;
    [key: string]: unknown;
  };
  temperature?: number;
  maxToolLoops?: number;
}

export interface OrchestratorResponse {
  agentRole: AgentRoleType;
  content: string;
  toolExecutions: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result: ToolExecutionResult;
  }>;
  requiresApproval: boolean;
  approvalRequestId?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  model: string;
}

export class AiOrchestrator {
  private aiProvider: AiProvider;
  private toolRegistry: ToolRegistry;
  private platformRepo: PlatformRepository;

  constructor(options?: {
    aiProvider?: AiProvider;
    toolRegistry?: ToolRegistry;
    platformRepo?: PlatformRepository;
  }) {
    this.aiProvider = options?.aiProvider || createAiProvider();
    this.toolRegistry = options?.toolRegistry || getToolRegistry();
    this.platformRepo = options?.platformRepo || getPlatformRepository();
  }

  public getAgent(role: AgentRoleType): SpecializedAgent {
    return AgentFactory.getAgent(role, this.toolRegistry);
  }

  public async execute(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now();
    const agent = this.getAgent(request.agentRole);
    const maxLoops = request.maxToolLoops ?? 4;

    logger.info(
      { agentRole: agent.role, promptLength: request.prompt.length },
      'Executing AI Orchestrator request',
    );

    // 1. Build messages with agent system prompt
    const messages: AiChatMessage[] = [];
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      messages.push(...request.conversationHistory);
    }
    messages.push({ role: 'user', content: request.prompt });

    const toolDeclarations = agent.getToolDeclarations();
    const executedTools: OrchestratorResponse['toolExecutions'] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let currentModel = 'gemini-2.5-flash';
    let finalContent = '';
    let requiresApproval = false;
    let approvalRequestId: string | undefined;

    // 2. Multi-turn Agentic Execution Loop
    for (let loop = 0; loop < maxLoops; loop++) {
      let completion: AiCompletionResponse;

      try {
        completion = await this.aiProvider.generateResponse({
          messages,
          systemInstruction: agent.systemInstruction,
          tools: toolDeclarations.length > 0 ? toolDeclarations : undefined,
          temperature: request.temperature,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errMsg, loop, agentRole: agent.role }, 'AI completion generation failed in orchestrator');
        throw err;
      }

      totalPromptTokens += completion.usage.promptTokens;
      totalCompletionTokens += completion.usage.completionTokens;
      currentModel = completion.model;

      // Check if function calls were requested
      if (completion.functionCalls && completion.functionCalls.length > 0) {
        for (const call of completion.functionCalls) {
          // Verify agent permission
          if (!agent.isToolPermitted(call.name)) {
            logger.warn(
              { toolName: call.name, agentRole: agent.role },
              'Permission denied: Agent attempted to use restricted tool',
            );
            executedTools.push({
              toolName: call.name,
              args: call.args,
              result: {
                toolName: call.name,
                success: false,
                error: `Agent '${agent.displayName}' does not have permission to execute '${call.name}'.`,
              },
            });
            continue;
          }

          // Execute authorized tool with sealed context
          const trustedContext = createTrustedToolContext({
            agentRole: agent.role,
            tenantId: request.context?.tenantId,
            initiatingUser: request.context?.userName || 'system',
            conversationId: request.context?.conversationId,
            isPlatformActor: agent.role === 'platform_owner_assistant',
          });

          const toolResult = await this.toolRegistry.executeTool(
            call.name,
            call.args,
            trustedContext,
          );

          if (toolResult.requiresApproval) {
            requiresApproval = true;
            approvalRequestId = toolResult.approvalRequestId;
          }

          executedTools.push({
            toolName: call.name,
            args: call.args,
            result: toolResult,
          });

          // Feed result back into conversation history as user context for next model step
          messages.push({
            role: 'user',
            content: `Tool Result for ${call.name}:\n${JSON.stringify(toolResult.data || toolResult.error)}`,
          });
        }

        // If the tool execution created an approval request, we don't need further loops
        if (requiresApproval) {
          finalContent = `Action has been submitted for owner approval (Request ID: ${approvalRequestId}). Commercial commitment will not proceed without authorization.`;
          break;
        }

        // If completion also provided direct text
        if (completion.content && completion.content.trim().length > 0) {
          finalContent = completion.content;
          break;
        }
      } else {
        // Direct answer without tools
        finalContent = completion.content;
        break;
      }
    }

    const latencyMs = Date.now() - startTime;

    // 3. Log AI Activity Event for Reporting and Audit
    void this.platformRepo
      .logActivityEvent({
        eventType: 'ai_orchestration',
        phoneNumber: request.context?.phoneNumber,
        customerName: request.context?.userName,
        conversationId: request.context?.conversationId,
        aiModel: currentModel,
        tokensUsed: totalPromptTokens + totalCompletionTokens,
        latencyMs,
        details: {
          agentRole: agent.role,
          toolCallsCount: executedTools.length,
          toolsUsed: executedTools.map((t) => t.toolName),
          requiresApproval,
        },
      })
      .catch((err) => {
        logger.warn({ err }, 'Failed logging AI activity event');
      });

    return {
      agentRole: agent.role,
      content: finalContent,
      toolExecutions: executedTools,
      requiresApproval,
      approvalRequestId,
      usage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
      latencyMs,
      model: currentModel,
    };
  }
}

let orchestratorInstance: AiOrchestrator | null = null;

export function getAiOrchestrator(): AiOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AiOrchestrator();
  }
  return orchestratorInstance;
}
