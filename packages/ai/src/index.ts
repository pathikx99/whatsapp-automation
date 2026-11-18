import { createLogger } from '@whatsapp-platform/shared';
import { getConfig } from '@whatsapp-platform/config';

export type AiRole = 'system' | 'user' | 'assistant';

export interface AiMediaPart {
  mimeType: string;
  data: string; // base64 encoded
}

export interface AiChatMessage {
  role: AiRole;
  content: string;
  media?: AiMediaPart[];
}

export interface AiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface AiToolDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface AiCompletionRequest {
  messages: AiChatMessage[];
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  model?: string;
  timeoutMs?: number;
  tools?: AiToolDeclaration[];
  toolChoice?: 'AUTO' | 'ANY' | 'NONE' | string;
  responseMimeType?: 'application/json' | 'text/plain' | string;
  responseSchema?: Record<string, unknown>;
}

export interface AiCompletionResponse {
  content: string;
  model: string;
  functionCalls?: AiFunctionCall[];
  json?: unknown;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

export interface AiProvider {
  isConfigured(): boolean;
  generateResponse(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}

/**
 * Calculates exponential backoff delay with random jitter to prevent thundering herd.
 */
function calculateBackoffDelay(attempt: number, baseMs = 1000, maxMs = 10000): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * (baseMs * 0.5));
  return Math.min(exponential + jitter, maxMs);
}

export function createAiProvider(): AiProvider {
  const logger = createLogger({ name: 'ai-provider' });
  const config = getConfig();

  const isConfigured = Boolean(config.AI_API_KEY && config.AI_PROVIDER !== 'mock');

  return {
    isConfigured(): boolean {
      return isConfigured;
    },

    async generateResponse(request: AiCompletionRequest): Promise<AiCompletionResponse> {
      const startTime = Date.now();

      if (!isConfigured) {
        logger.debug('AI provider mock: returning stub response (unconfigured provider)');
        let mockJson: unknown;
        if (request.responseMimeType === 'application/json') {
          mockJson = { status: 'mock_response', message: 'Mock AI JSON response' };
        }
        return {
          content: 'This is a mock AI response. Configure AI_API_KEY to enable live completions.',
          model: config.AI_MODEL || 'mock-model',
          json: mockJson,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          latencyMs: Date.now() - startTime,
        };
      }

      const model = request.model || config.AI_MODEL || 'gemini-2.5-flash';
      const maxRetries = config.AI_MAX_RETRIES ?? 3;
      const defaultTimeout = config.AI_TIMEOUT_MS ?? 30000;
      const timeoutMs = request.timeoutMs || defaultTimeout;

      logger.info({ model, messageCount: request.messages.length }, 'Generating AI completion via Gemini');

      try {
        // 1. Separate system instructions from conversation contents
        const explicitSystemMessages = request.messages.filter((m) => m.role === 'system');
        const chatMessages = request.messages.filter((m) => m.role !== 'system');

        let systemInstructionText = request.systemInstruction || '';
        if (explicitSystemMessages.length > 0) {
          const joinedSystem = explicitSystemMessages.map((m) => m.content).join('\n\n');
          systemInstructionText = systemInstructionText
            ? `${systemInstructionText}\n\n${joinedSystem}`
            : joinedSystem;
        }

        const contents = chatMessages.map((m) => {
          const parts: Array<Record<string, unknown>> = [{ text: m.content }];
          if (m.media && m.media.length > 0) {
            for (const item of m.media) {
              parts.push({
                inlineData: {
                  mimeType: item.mimeType,
                  data: item.data,
                },
              });
            }
          }
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts,
          };
        });

        const payload: Record<string, unknown> = { contents };

        if (systemInstructionText.trim().length > 0) {
          payload.systemInstruction = {
            parts: [{ text: systemInstructionText.trim() }],
          };
        }

        // 2. Generation Config
        const generationConfig: Record<string, unknown> = {};
        if (request.temperature !== undefined) {
          generationConfig.temperature = request.temperature;
        } else if (config.AI_TEMPERATURE !== undefined) {
          generationConfig.temperature = config.AI_TEMPERATURE;
        }
        if (request.maxTokens !== undefined) {
          generationConfig.maxOutputTokens = request.maxTokens;
        } else if (config.AI_MAX_OUTPUT_TOKENS !== undefined) {
          generationConfig.maxOutputTokens = config.AI_MAX_OUTPUT_TOKENS;
        }
        if (request.topP !== undefined) {
          generationConfig.topP = request.topP;
        }
        if (request.topK !== undefined) {
          generationConfig.topK = request.topK;
        }
        if (request.responseMimeType) {
          generationConfig.responseMimeType = request.responseMimeType;
        }
        if (request.responseSchema) {
          generationConfig.responseSchema = request.responseSchema;
        }
        if (Object.keys(generationConfig).length > 0) {
          payload.generationConfig = generationConfig;
        }

        // 3. Tools & Function Declarations (Backend-driven only; NO arbitrary SQL execution)
        if (request.tools && request.tools.length > 0) {
          payload.tools = [
            {
              functionDeclarations: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters || { type: 'object', properties: {} },
              })),
            },
          ];

          if (request.toolChoice) {
            payload.toolConfig = {
              functionCallingConfig: {
                mode: request.toolChoice,
              },
            };
          }
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.AI_API_KEY}`;

        // 4. Bounded Retries with Exponential Backoff and Jitter
        let response: Response | null = null;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(timeoutMs),
            });

            // If rate-limited (429) or transient server errors (500, 502, 503, 504)
            if (
              response.status === 429 ||
              response.status === 500 ||
              response.status === 502 ||
              response.status === 503 ||
              response.status === 504
            ) {
              if (attempt < maxRetries) {
                const delay = calculateBackoffDelay(attempt);
                logger.warn(
                  { status: response.status, attempt, delayMs: delay, model },
                  'Transient Gemini error/rate-limit; waiting before backoff retry',
                );
                await new Promise((r) => setTimeout(r, delay));
                continue;
              }
            }

            break; // Success or non-retryable status
          } catch (fetchErr) {
            lastError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
            if (attempt < maxRetries) {
              const delay = calculateBackoffDelay(attempt);
              logger.warn(
                { err: lastError.message, attempt, delayMs: delay, model },
                'Gemini fetch error / timeout; waiting before retry',
              );
              await new Promise((r) => setTimeout(r, delay));
            } else {
              throw lastError;
            }
          }
        }

        if (!response) {
          throw lastError || new Error('Failed to obtain response from Gemini API after retries');
        }

        if (!response.ok) {
          const errText = await response.text();
          logger.error({ status: response.status, body: errText, model }, 'Gemini API call failed');
          throw new Error(`Gemini API error (${response.status}): ${errText}`);
        }

        interface GeminiCandidatePart {
          text?: string;
          functionCall?: {
            name: string;
            args?: Record<string, unknown>;
          };
        }

        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: GeminiCandidatePart[] } }>;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
          };
        };

        const parts = data.candidates?.[0]?.content?.parts || [];
        let replyContent = '';
        const functionCalls: AiFunctionCall[] = [];

        for (const part of parts) {
          if (part.text) {
            replyContent += part.text;
          }
          if (part.functionCall) {
            functionCalls.push({
              name: part.functionCall.name,
              args: part.functionCall.args || {},
            });
          }
        }

        let parsedJson: unknown;
        if (request.responseMimeType === 'application/json' && replyContent) {
          try {
            parsedJson = JSON.parse(replyContent);
          } catch {
            logger.warn({ replyContent }, 'Could not parse Gemini JSON response as valid JSON');
          }
        }

        const latencyMs = Date.now() - startTime;

        return {
          content: replyContent,
          model,
          functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
          json: parsedJson,
          usage: {
            promptTokens: data.usageMetadata?.promptTokenCount || 0,
            completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: data.usageMetadata?.totalTokenCount || 0,
          },
          latencyMs,
        };
      } catch (err) {
        logger.error({ err, model }, 'Failed generating AI completion');
        throw err;
      }
    },
  };
}

export * from './business-synthesizer.js';
export * from './tool-registry.js';
export * from './specialized-agents.js';
export * from './ai-orchestrator.js';
