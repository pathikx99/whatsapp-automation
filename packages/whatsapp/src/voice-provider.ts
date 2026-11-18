import { createLogger } from '@whatsapp-platform/shared';
import { normalizePhoneNumber } from './index.js';

const logger = createLogger({ name: 'voice-provider' });

export interface OutboundCallRequest {
  phoneNumber: string;
  callerIdentity?: string; // Default: 'Mintara Bites Manager'
  purpose: string;
  supplierName?: string;
  language?: 'gu-IN' | 'hi-IN' | 'en-IN' | string;
  initialScriptPrompt?: string;
  metadata?: Record<string, unknown>;
}

export interface CallStatusUpdate {
  callId: string;
  status: 'initiated' | 'ringing' | 'in_progress' | 'completed' | 'busy' | 'no_answer' | 'failed' | 'refused';
  durationSeconds?: number;
  transcript?: string;
  recordingUrl?: string;
  tentativeTerms?: Record<string, unknown>;
}

export interface CallInitiationResult {
  callId: string;
  status: 'initiated' | 'mocked' | 'failed';
  provider: 'exotel' | 'sarvam' | 'twilio' | 'mock';
  normalizedPhone: string;
  error?: string;
}

export interface VoiceProvider {
  isConfigured(): boolean;
  initiateCall(request: OutboundCallRequest): Promise<CallInitiationResult>;
  getCallStatus(callId: string): Promise<CallStatusUpdate | null>;
}

export function createVoiceProvider(): VoiceProvider {
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const exotelSid = process.env.EXOTEL_ACCOUNT_SID;
  const exotelToken = process.env.EXOTEL_API_TOKEN;
  const isConfigured = Boolean(exotelSid && exotelToken && !isTest);

  // In-memory simulated call state for development/testing
  const activeCalls = new Map<string, CallStatusUpdate>();

  return {
    isConfigured(): boolean {
      return isConfigured;
    },

    async initiateCall(request: OutboundCallRequest): Promise<CallInitiationResult> {
      const cleanPhone = normalizePhoneNumber(request.phoneNumber);
      const callerRole = request.callerIdentity || 'Mintara Bites Manager';
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      if (!isConfigured) {
        logger.info(
          { callId, to: cleanPhone, callerRole, purpose: request.purpose, isTest },
          'Voice provider mock: initiated simulated call (unconfigured or test mode)',
        );

        activeCalls.set(callId, {
          callId,
          status: 'completed',
          durationSeconds: 45,
          transcript: `[Mintara Bites Manager]: Namaste, I am calling from Mintara Bites regarding raw material quotations for sweet fennel and dhanadal.\n[Recipient]: Yes, current rates are ₹180/kg for 50kg MOQ.\n[Mintara Bites Manager]: Thank you, I have recorded ₹180/kg for 50kg tentatively. Our owner will review and confirm.`,
          tentativeTerms: {
            material: 'Sweet Fennel Seeds',
            ratePerKg: 180,
            moqKg: 50,
            status: 'tentative_pending_owner_approval',
          },
        });

        return {
          callId,
          status: 'mocked',
          provider: 'mock',
          normalizedPhone: cleanPhone,
        };
      }

      // Live Telephony Integration (Exotel / Sarvam Voice API)
      try {
        const apiKey = process.env.EXOTEL_API_KEY || exotelSid;
        const apiSubdomain = process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com';
        const url = `https://${apiSubdomain}/v1/Accounts/${exotelSid}/Calls/connect.json`;

        const formData = new URLSearchParams();
        formData.append('From', process.env.EXOTEL_CALLER_ID || '07490095115');
        formData.append('To', cleanPhone);
        formData.append('CallerId', process.env.EXOTEL_CALLER_ID || '07490095115');
        formData.append('CustomField', JSON.stringify({ role: callerRole, purpose: request.purpose }));

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${apiKey}:${exotelToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        if (!res.ok) {
          const errText = await res.text();
          logger.error({ status: res.status, body: errText }, 'Exotel call initiation failed');
          return {
            callId: '',
            status: 'failed',
            provider: 'exotel',
            normalizedPhone: cleanPhone,
            error: `Exotel HTTP ${res.status}: ${errText}`,
          };
        }

        const data = (await res.json()) as any;
        const liveCallId = data?.Call?.Sid || callId;

        return {
          callId: liveCallId,
          status: 'initiated',
          provider: 'exotel',
          normalizedPhone: cleanPhone,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errMsg }, 'Voice call exception during provider dispatch');
        return {
          callId: '',
          status: 'failed',
          provider: 'exotel',
          normalizedPhone: cleanPhone,
          error: errMsg,
        };
      }
    },

    async getCallStatus(callId: string): Promise<CallStatusUpdate | null> {
      return activeCalls.get(callId) || null;
    },
  };
}
