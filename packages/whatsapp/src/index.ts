import dns from 'node:dns';
import { createLogger } from '@whatsapp-platform/shared';
import { getConfig } from '@whatsapp-platform/config';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore if unsupported in environment
}

export type WhatsAppMessageType =
  | 'text'
  | 'template'
  | 'interactive'
  | 'media'
  | 'product'
  | 'product_list'
  | 'list';

export interface WhatsAppButtonAction {
  id: string;
  title: string;
}

export interface WhatsAppInteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppInteractiveListSection {
  title: string;
  rows: WhatsAppInteractiveListRow[];
}

export interface WhatsAppInteractiveListMessage {
  type: 'list';
  to: string;
  body: string;
  buttonText: string;
  title?: string;
  header?: string;
  footer?: string;
  sections: WhatsAppInteractiveListSection[];
}

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

export interface WhatsAppInteractiveMessage {
  type: 'interactive';
  to: string;
  body: string;
  buttons: WhatsAppButtonAction[];
  header?: string;
  footer?: string;
}

export interface WhatsAppProductMessage {
  type: 'product';
  to: string;
  catalogId: string;
  productRetailerId: string;
  body?: string;
  footer?: string;
}

export interface WhatsAppProductListSection {
  title: string;
  productRetailerIds: string[];
}

export interface WhatsAppProductListMessage {
  type: 'product_list';
  to: string;
  catalogId: string;
  headerText: string;
  body: string;
  sections: WhatsAppProductListSection[];
  footer?: string;
}

export type OutboundWhatsAppMessage =
  | WhatsAppTextMessage
  | WhatsAppTemplateMessage
  | WhatsAppInteractiveMessage
  | WhatsAppProductMessage
  | WhatsAppProductListMessage
  | WhatsAppInteractiveListMessage;

export interface WhatsAppSendResult {
  messageId: string;
  status: 'sent' | 'queued' | 'simulated';
  recipient: string;
  timestamp: string;
}

export interface WhatsAppProvider {
  isConfigured(): boolean;
  sendMessage(message: OutboundWhatsAppMessage): Promise<WhatsAppSendResult>;
  sendInteractiveButtons(
    to: string,
    body: string,
    buttons: WhatsAppButtonAction[],
    footer?: string,
  ): Promise<WhatsAppSendResult>;
  sendInteractiveList(
    to: string,
    body: string,
    buttonText: string,
    sections: WhatsAppInteractiveListSection[],
    options?: { header?: string; footer?: string },
  ): Promise<WhatsAppSendResult>;
  sendProduct(
    to: string,
    catalogId: string,
    productRetailerId: string,
    body?: string,
    footer?: string,
  ): Promise<WhatsAppSendResult>;
  sendProductList(
    to: string,
    catalogId: string,
    headerText: string,
    body: string,
    sections: WhatsAppProductListSection[],
    footer?: string,
  ): Promise<WhatsAppSendResult>;
  markMessageAsRead(messageId: string): Promise<boolean>;
  sendTypingIndicator(to: string): Promise<boolean>;
  getMediaUrl(mediaId: string): Promise<string>;
  downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }>;
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
        logger.info(
          { recipient: message.to },
          'WhatsApp provider mock: message logged (unconfigured provider)',
        );
        return {
          messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          status: 'simulated',
          recipient: message.to,
          timestamp: new Date().toISOString(),
        };
      }

      logger.info(
        { recipient: message.to, type: message.type },
        'Sending WhatsApp message via Cloud API',
      );

      try {
        const cleanTo = message.to.replace(/\D/g, '');
        const payload: Record<string, unknown> = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
        };

        if (message.type === 'text') {
          payload.type = 'text';
          payload.text = {
            preview_url: false,
            body: message.body,
          };
        } else if (message.type === 'interactive') {
          payload.type = 'interactive';
          payload.interactive = {
            type: 'button',
            body: { text: message.body },
            action: {
              buttons: message.buttons.slice(0, 3).map((btn) => ({
                type: 'reply',
                reply: {
                  id: btn.id,
                  title: btn.title.slice(0, 20),
                },
              })),
            },
            header: message.header ? { type: 'text', text: message.header } : undefined,
            footer: message.footer ? { text: message.footer } : undefined,
          };
        } else if (message.type === 'template') {
          payload.type = 'template';
          payload.template = {
            name: message.templateName,
            language: { code: message.languageCode || 'en' },
            components:
              message.parameters && message.parameters.length > 0
                ? [
                    {
                      type: 'body',
                      parameters: message.parameters,
                    },
                  ]
                : undefined,
          };
        } else if (message.type === 'product') {
          payload.type = 'interactive';
          payload.interactive = {
            type: 'product',
            body: message.body ? { text: message.body } : undefined,
            footer: message.footer ? { text: message.footer } : undefined,
            action: {
              catalog_id: message.catalogId,
              product_retailer_id: message.productRetailerId,
            },
          };
        } else if (message.type === 'product_list') {
          payload.type = 'interactive';
          payload.interactive = {
            type: 'product_list',
            header: {
              type: 'text',
              text: message.headerText,
            },
            body: { text: message.body },
            footer: message.footer ? { text: message.footer } : undefined,
            action: {
              catalog_id: message.catalogId,
              sections: message.sections.map((section) => ({
                title: section.title,
                product_items: section.productRetailerIds.map((retailerId) => ({
                  product_retailer_id: retailerId,
                })),
              })),
            },
          };
        } else if (message.type === 'list') {
          payload.type = 'interactive';
          payload.interactive = {
            type: 'list',
            header: message.header ? { type: 'text', text: message.header } : undefined,
            body: { text: message.body },
            footer: message.footer ? { text: message.footer } : undefined,
            action: {
              button: (message.buttonText || 'View Options').slice(0, 20),
              sections: message.sections.map((section) => ({
                title: section.title.slice(0, 24),
                rows: section.rows.slice(0, 10).map((row) => ({
                  id: row.id.slice(0, 200),
                  title: row.title.slice(0, 24),
                  description: row.description ? row.description.slice(0, 72) : undefined,
                })),
              })),
            },
          };
        }

        const endpoint = `https://graph.facebook.com/v26.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.WHATSAPP_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errBody = await response.text();
          logger.error(
            { status: response.status, body: errBody, recipient: cleanTo },
            'WhatsApp API dispatch failed',
          );
          throw new Error(`WhatsApp API error (${response.status}): ${errBody}`);
        }

        const data = (await response.json()) as { messages?: Array<{ id: string }> };
        const messageId = data.messages?.[0]?.id || `wa_${Date.now()}`;

        logger.info({ messageId, recipient: cleanTo }, 'WhatsApp message successfully dispatched');
        return {
          messageId,
          status: 'sent',
          recipient: cleanTo,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        logger.error({ err, recipient: message.to }, 'Failed to dispatch WhatsApp message');
        throw err;
      }
    },

    async sendInteractiveButtons(
      to: string,
      body: string,
      buttons: WhatsAppButtonAction[],
      footer?: string,
    ): Promise<WhatsAppSendResult> {
      return this.sendMessage({
        type: 'interactive',
        to,
        body,
        buttons,
        footer,
      });
    },

    async sendProduct(
      to: string,
      catalogId: string,
      productRetailerId: string,
      body?: string,
      footer?: string,
    ): Promise<WhatsAppSendResult> {
      return this.sendMessage({
        type: 'product',
        to,
        catalogId,
        productRetailerId,
        body,
        footer,
      });
    },

    async sendProductList(
      to: string,
      catalogId: string,
      headerText: string,
      body: string,
      sections: WhatsAppProductListSection[],
      footer?: string,
    ): Promise<WhatsAppSendResult> {
      return this.sendMessage({
        type: 'product_list',
        to,
        catalogId,
        headerText,
        body,
        sections,
        footer,
      });
    },

    async sendInteractiveList(
      to: string,
      body: string,
      buttonText: string,
      sections: WhatsAppInteractiveListSection[],
      options?: { header?: string; footer?: string },
    ): Promise<WhatsAppSendResult> {
      return this.sendMessage({
        type: 'list',
        to,
        body,
        buttonText,
        sections,
        header: options?.header,
        footer: options?.footer,
      });
    },

    async markMessageAsRead(messageId: string): Promise<boolean> {
      if (!isConfigured || messageId.startsWith('mock_') || messageId.startsWith('wamid_test')) {
        logger.debug({ messageId }, 'WhatsApp provider mock: marked message as read');
        return true;
      }

      try {
        const endpoint = `https://graph.facebook.com/v26.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.WHATSAPP_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
          }),
        });
        return response.ok;
      } catch (err) {
        logger.warn({ err, messageId }, 'Failed sending read receipt to WhatsApp API');
        return false;
      }
    },

    async sendTypingIndicator(to: string): Promise<boolean> {
      if (!isConfigured) {
        logger.debug({ to }, 'WhatsApp provider mock: typing indicator simulated');
        return true;
      }
      return true;
    },

    async getMediaUrl(mediaId: string): Promise<string> {
      if (!isConfigured) {
        return `https://mock.whatsapp.media/${mediaId}`;
      }

      const endpoint = `https://graph.facebook.com/v26.0/${mediaId}`;
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch WhatsApp media metadata (${response.status})`);
      }

      const data = (await response.json()) as { url?: string };
      if (!data.url) {
        throw new Error(`No media URL returned for media ID ${mediaId}`);
      }

      return data.url;
    },

    async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
      if (
        !isConfigured ||
        mediaId.startsWith('mock_') ||
        mediaId.startsWith('media_audio_test') ||
        mediaId.startsWith('media_test')
      ) {
        // Return a valid silent 44-byte WAV header for testing
        const silentWavBase64 =
          'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
        return {
          buffer: Buffer.from(silentWavBase64, 'base64'),
          mimeType: 'audio/wav',
        };
      }

      const endpoint = `https://graph.facebook.com/v26.0/${mediaId}`;
      const metaRes = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_API_KEY}`,
        },
      });

      if (!metaRes.ok) {
        throw new Error(`Failed fetching media metadata for ID ${mediaId}`);
      }

      const meta = (await metaRes.json()) as { url: string; mime_type: string };
      const mediaRes = await fetch(meta.url, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_API_KEY}`,
        },
      });

      if (!mediaRes.ok) {
        throw new Error(`Failed downloading media binary from ${meta.url}`);
      }

      const arrayBuffer = await mediaRes.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: meta.mime_type || 'application/octet-stream',
      };
    },

    verifyWebhook(mode: string, token: string): boolean {
      if (!config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) return false;
      return mode === 'subscribe' && token === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    },
  };
}
