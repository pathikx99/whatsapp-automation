import dns from 'node:dns';
import crypto from 'node:crypto';
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
  | 'image'
  | 'audio'
  | 'document'
  | 'video'
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
  previewUrl?: boolean;
}

export interface WhatsAppMediaMessage {
  type: 'media' | 'image' | 'audio' | 'document' | 'video';
  to: string;
  mediaType?: 'image' | 'audio' | 'document' | 'video';
  url?: string;
  id?: string;
  caption?: string;
  filename?: string;
}

export interface WhatsAppTemplateMessage {
  type: 'template';
  to: string;
  templateName: string;
  languageCode: string;
  parameters?: Array<{ type: string; text?: string; image?: { link: string } }>;
  headerParameters?: Array<{ type: string; text?: string; image?: { link: string } }>;
  buttonParameters?: Array<{ type: string; sub_type?: string; index?: string; parameters: Array<{ type: string; text?: string }> }>;
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
  | WhatsAppMediaMessage
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

/**
 * Normalizes phone numbers for WhatsApp Cloud API compliance.
 * Handles Indian numbers with or without +91 / 0 prefix, as well as international numbers.
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');

  // 10-digit Indian number starting with 6, 7, 8, 9
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }

  // 11-digit Indian number starting with 0 followed by 6, 7, 8, 9
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }

  // 12-digit Indian number already starting with 91
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }

  // Default clean international digits
  return digits;
}

/**
 * Formats a clean E.164 / normalized phone number for friendly UI display.
 */
export function formatDisplayPhoneNumber(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (normalized.startsWith('91') && normalized.length === 12) {
    return `+91 ${normalized.slice(2, 7)} ${normalized.slice(7)}`;
  }
  return `+${normalized}`;
}

/**
 * Validates Meta WhatsApp Webhook HMAC-SHA256 signature using timingSafeEqual.
 */
export function verifyWebhookSignature(
  payload: Buffer | string,
  signatureHeader?: string,
  secret?: string,
): boolean {
  if (!secret) return false;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  try {
    const signature = signatureHeader.slice(7);
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    if (signatureBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(signatureBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Opt-Out and Opt-In keywords according to Meta & TRAI compliance.
 * Handles exact keywords as well as common phrases (e.g., "stop please", "unsubscribe me").
 */
export function isOptOutKeyword(text: string): boolean {
  if (!text) return false;
  return /\b(stop|unsubscribe|optout|opt-out|halt|cancel|quit|end|roko)\b/i.test(text.trim());
}

export function isOptInKeyword(text: string): boolean {
  if (!text) return false;
  return /\b(start|unstop|optin|opt-in|resume|shuru)\b/i.test(text.trim());
}

export interface ParsedWebhookStatus {
  wamid: string;
  recipient: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  error?: string;
}

export interface ParsedWebhookMessage {
  wamid: string;
  from: string;
  timestamp: string;
  type: string;
  body?: string;
  interactiveButtonId?: string;
  interactiveListId?: string;
  mediaId?: string;
  mediaType?: string;
  senderName?: string;
}

export interface ParsedWebhookResult {
  statuses: ParsedWebhookStatus[];
  messages: ParsedWebhookMessage[];
}

export function parseWhatsAppWebhookPayload(body: unknown): ParsedWebhookResult {
  const result: ParsedWebhookResult = { statuses: [], messages: [] };
  if (!body || typeof body !== 'object') return result;

  const entry = (body as any).entry;
  if (!Array.isArray(entry)) return result;

  for (const item of entry) {
    const changes = item.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      // 1. Process status updates
      if (Array.isArray(value.statuses)) {
        for (const s of value.statuses) {
          result.statuses.push({
            wamid: s.id,
            recipient: s.recipient_id,
            status: s.status,
            timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString(),
            error: s.errors?.[0]?.message,
          });
        }
      }

      // 2. Process incoming messages
      if (Array.isArray(value.messages)) {
        const profile = value.contacts?.[0]?.profile;
        const senderName = profile?.name;

        for (const m of value.messages) {
          let textBody = m.text?.body;
          let buttonId: string | undefined;
          let listId: string | undefined;

          if (m.type === 'interactive') {
            buttonId = m.interactive?.button_reply?.id;
            listId = m.interactive?.list_reply?.id;
            textBody = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || textBody;
          } else if (m.type === 'button') {
            buttonId = m.button?.payload || m.button?.text;
            textBody = m.button?.text || textBody;
          }

          let mediaId: string | undefined;
          let mediaType: string | undefined;
          if (m.type === 'image' || m.type === 'audio' || m.type === 'video' || m.type === 'document' || m.type === 'voice') {
            mediaType = m.type;
            mediaId = m[m.type]?.id;
            textBody = m[m.type]?.caption || textBody;
          }

          result.messages.push({
            wamid: m.id,
            from: m.from,
            timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
            type: m.type,
            body: textBody,
            interactiveButtonId: buttonId,
            interactiveListId: listId,
            mediaId,
            mediaType,
            senderName,
          });
        }
      }
    }
  }

  return result;
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
      const isTestEnv =
        (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) &&
        process.env.LIVE_WHATSAPP_TEST !== 'true';

      if (!isConfigured || isTestEnv) {
        logger.info(
          { recipient: message.to, isTestEnv },
          'WhatsApp provider mock: message logged (unconfigured or test mode)',
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
        const cleanTo = normalizePhoneNumber(message.to);
        const payload: Record<string, unknown> = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
        };

        if (message.type === 'text') {
          payload.type = 'text';
          const shouldPreview =
            message.previewUrl !== undefined
              ? Boolean(message.previewUrl)
              : /https?:\/\//i.test(message.body);

          payload.text = {
            preview_url: shouldPreview,
            body: message.body,
          };
        } else if (
          message.type === 'media' ||
          message.type === 'image' ||
          message.type === 'audio' ||
          message.type === 'document' ||
          message.type === 'video'
        ) {
          const mediaMsg = message as WhatsAppMediaMessage;
          const mediaType = mediaMsg.mediaType || (mediaMsg.type === 'media' ? 'image' : mediaMsg.type);
          payload.type = mediaType;
          const mediaObject: Record<string, unknown> = {};
          if (mediaMsg.url) {
            mediaObject.link = mediaMsg.url;
          }
          if (mediaMsg.id) {
            mediaObject.id = mediaMsg.id;
          }
          if (mediaMsg.caption) {
            mediaObject.caption = mediaMsg.caption;
          }
          if (mediaMsg.filename) {
            mediaObject.filename = mediaMsg.filename;
          }
          payload[mediaType] = mediaObject;
        } else if (message.type === 'interactive') {
          payload.type = 'interactive';
          const interactiveBody =
            message.body.length > 1024 ? message.body.slice(0, 1020) + '...' : message.body;
          payload.interactive = {
            type: 'button',
            body: { text: interactiveBody },
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
          const listBody =
            message.body.length > 1024 ? message.body.slice(0, 1020) + '...' : message.body;
          payload.interactive = {
            type: 'list',
            header: message.header ? { type: 'text', text: message.header } : undefined,
            body: { text: listBody },
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
          signal: AbortSignal.timeout(8000),
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
      const isTestEnv =
        (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) &&
        process.env.LIVE_WHATSAPP_TEST !== 'true';

      if (
        !isConfigured ||
        isTestEnv ||
        messageId.startsWith('mock_') ||
        messageId.startsWith('wamid_test')
      ) {
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
          signal: AbortSignal.timeout(8000),
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
        signal: AbortSignal.timeout(10000),
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
        const silentWavBase64 = 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
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
        signal: AbortSignal.timeout(10000),
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

export * from './email-provider.js';
export * from './voice-provider.js';
