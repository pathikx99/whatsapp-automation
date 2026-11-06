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
  | 'product_list';

export interface WhatsAppButtonAction {
  id: string;
  title: string;
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
  | WhatsAppProductListMessage;

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

    verifyWebhook(mode: string, token: string): boolean {
      if (!config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) return false;
      return mode === 'subscribe' && token === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    },
  };
}
