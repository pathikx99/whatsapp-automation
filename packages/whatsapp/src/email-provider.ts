import { createLogger } from '@whatsapp-platform/shared';

const logger = createLogger({ name: 'email-provider' });

export interface OutboundEmailMessage {
  to: string | string[];
  from?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64 or plain
    contentType?: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface EmailSendResult {
  id: string;
  status: 'sent' | 'queued' | 'mocked' | 'failed';
  provider: string;
  error?: string;
}

export interface EmailProvider {
  isConfigured(): boolean;
  sendEmail(message: OutboundEmailMessage): Promise<EmailSendResult>;
}

export function createEmailProvider(): EmailProvider {
  const apiKey = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY;
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const isConfigured = Boolean(apiKey && !isTest);

  return {
    isConfigured(): boolean {
      return isConfigured;
    },

    async sendEmail(message: OutboundEmailMessage): Promise<EmailSendResult> {
      const from = message.from || process.env.EMAIL_FROM || 'Mintara Bites <orders@mintarabites.com>';
      const recipients = Array.isArray(message.to) ? message.to : [message.to];

      if (!isConfigured) {
        logger.info(
          { recipients, subject: message.subject, isTest },
          'Email provider mock: email logged (unconfigured or test mode)',
        );
        return {
          id: `email_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          status: 'mocked',
          provider: 'mock',
        };
      }

      // Live Provider (e.g. Resend / Postmark / SendGrid REST API)
      try {
        const endpoint = process.env.EMAIL_ENDPOINT || 'https://api.resend.com/emails';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from,
            to: recipients,
            subject: message.subject,
            text: message.text,
            html: message.html,
            reply_to: message.replyTo,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          logger.error({ status: res.status, body: errText }, 'Email provider dispatch failed');
          return {
            id: '',
            status: 'failed',
            provider: 'resend',
            error: `HTTP ${res.status}: ${errText}`,
          };
        }

        const data = (await res.json()) as { id?: string };
        return {
          id: data.id || `email_${Date.now()}`,
          status: 'sent',
          provider: 'resend',
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errMsg }, 'Email delivery network exception');
        return {
          id: '',
          status: 'failed',
          provider: 'resend',
          error: errMsg,
        };
      }
    },
  };
}
