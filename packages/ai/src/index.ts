import { createLogger } from '@whatsapp-platform/shared';
import { getConfig } from '@whatsapp-platform/config';

export type AiRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
  role: AiRole;
  content: string;
}

export interface AiCompletionRequest {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface AiCompletionResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AiProvider {
  isConfigured(): boolean;
  generateResponse(request: AiCompletionRequest): Promise<AiCompletionResponse>;
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
      if (!isConfigured) {
        logger.debug('AI provider mock: returning stub response (unconfigured provider)');
        return {
          content: 'This is a mock AI response. Configure AI_API_KEY to enable live completions.',
          model: config.AI_MODEL || 'mock-model',
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        };
      }

      logger.info({ model: config.AI_MODEL }, 'Generating AI completion');
      // Live integration with OpenAI / Anthropic / Gemini will be implemented in future milestone
      return {
        content: `Response generated using ${config.AI_PROVIDER}`,
        model: config.AI_MODEL || 'default-model',
      };
    },
  };
}
