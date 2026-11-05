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

      const model = request.model || config.AI_MODEL || 'gemini-3.5-flash-lite';
      logger.info({ model }, 'Generating AI completion via Gemini');

      try {
        // Separate system instructions from conversation contents
        const systemMessages = request.messages.filter((m) => m.role === 'system');
        const chatMessages = request.messages.filter((m) => m.role !== 'system');

        const systemInstruction = systemMessages.length > 0
          ? { parts: systemMessages.map((m) => ({ text: m.content })) }
          : undefined;

        const contents = chatMessages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

        const payload: Record<string, unknown> = { contents };
        if (systemInstruction) {
          payload.systemInstruction = systemInstruction;
        }
        if (request.temperature !== undefined) {
          payload.generationConfig = { temperature: request.temperature };
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.AI_API_KEY}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          logger.error({ status: response.status, body: errText, model }, 'Gemini API call failed');
          throw new Error(`Gemini API error (${response.status}): ${errText}`);
        }

        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        };

        const replyContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return {
          content: replyContent,
          model,
          usage: {
            promptTokens: data.usageMetadata?.promptTokenCount || 0,
            completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: data.usageMetadata?.totalTokenCount || 0,
          },
        };
      } catch (err) {
        logger.error({ err, model }, 'Failed generating AI completion');
        throw err;
      }
    },
  };
}
