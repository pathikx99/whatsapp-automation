import { createLogger } from '@whatsapp-platform/shared';
import { getConfig } from '@whatsapp-platform/config';

export type WhatsAppMessageType = 'text' | 'template' | 'interactive' | 'media';

export interface WhatsAppTextMessage {
  type: 'text';
  to: string;
  body: string;
}

export interface WhatsAppTemplateMessage {
  type: 'template';
  to: string;
  templateName: string;
  languageCode: string;
  parameters?: Array<{ type: string; text?: string }>;
}

export type OutboundWhatsAppMessage = WhatsAppTextMessage | WhatsAppTemplateMessage;

export interface WhatsAppSendResult {
  messageId: string;
  status: 'sent' | 'queued' | 'simulated';
  recipient: string;
  timestamp: string;
}

export interface WhatsAppProvider {
  isConfigured(): boolean;
  sendMessage(message: OutboundWhatsAppMessage): Promise<WhatsAppSendResult>;
  verifyWebhook(mode: string, token: string): boolean;
}

export function createWhatsAppProvider(): WhatsAppProvider {
  const logger = createLogger({ name: 'whatsapp-provider' });
  const config = getConfig();

  const isConfigured = Boolean(config.WHATSAPP_API_KEY && config.WHATSAPP_PHONE_NUMBER_ID);

  return {
    isConfigured(): boolean {
      return isConfigured;
    },

    async sendMessage(message: OutboundWhatsAppMessage): Promise<WhatsAppSendResult> {
      if (!isConfigured) {
        logger.info({ recipient: message.to }, 'WhatsApp provider mock: message logged (unconfigured provider)');
        return {
          messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          status: 'simulated',
          recipient: message.to,
          timestamp: new Date().toISOString(),
        };
      }

      logger.info({ recipient: message.to, type: message.type }, 'Sending WhatsApp message');
      // Integration with official Cloud API or selected provider will be implemented in future milestone
      return {
        messageId: `wa_${Date.now()}`,
        status: 'queued',
        recipient: message.to,
        timestamp: new Date().toISOString(),
      };
    },

    verifyWebhook(mode: string, token: string): boolean {
      if (!config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) return false;
      return mode === 'subscribe' && token === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    },
  };
}
