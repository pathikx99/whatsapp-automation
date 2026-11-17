import { SupabaseClient } from '@supabase/supabase-js';
import { createLocalSupabaseClient } from './local-client.js';
import { createEcommerceSupabaseClient } from './ecommerce-client.js';
import { createLogger } from '@whatsapp-platform/shared';
import {
  BusinessProfile,
  businessProfileSchema,
  saveBusinessProfileToDisk,
  updateCachedBusinessKnowledge,
} from '@whatsapp-platform/config';

const logger = createLogger({ name: 'platform-repository' });

export type ConversationStatus = 'active' | 'escalated' | 'closed';
export type MessageRole = 'customer' | 'assistant' | 'human_agent' | 'system';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export interface CompanySettingsRecord {
  id: string;
  profile: BusinessProfile;
  customMarkdown?: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface CustomerEngagementStats {
  phoneNumber: string;
  totalInbound: number;
  totalOutbound: number;
  totalMessages: number;
  messagesToday: number;
  lastMessageAt: string | null;
}

export interface OwnerCustomerMetric {
  phoneNumber: string;
  customerName: string;
  totalMessages: number;
  messagesToday: number;
  lastActiveAt: string;
  status: string;
  ordersCount: number;
  totalSpend: number;
}

export interface OwnerCartMetric {
  id: string;
  customerId?: string;
  email?: string;
  phone?: string;
  cartItemsSummary: string;
  cartValue: number;
  status: string;
  createdAt: string;
}

export interface EngagementSummary {
  totalConversations: number;
  activeConversations: number;
  escalatedConversations: number;
  totalMessagesToday: number;
  openTickets: number;
  abandonedCartsTotal: number;
}

export interface PlatformConversation {
  id: string;
  phoneNumber: string;
  customerName: string;
  status: ConversationStatus;
  metadata?: Record<string, unknown>;
  escalatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformConversationListItem extends PlatformConversation {
  lastMessage?: PlatformMessage;
  openTicket?: PlatformTicket;
}

export interface PlatformMessage {
  id: string;
  conversationId: string;
  phoneNumber: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface PlatformTicket {
  id: string;
  conversationId?: string;
  phoneNumber: string;
  customerName?: string;
  reason: string;
  status: TicketStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface PlatformWorkerJob {
  id: string;
  jobType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  retries: number;
  maxRetries: number;
  error?: string;
  lockedAt?: string;
  lockedBy?: string;
  scheduledFor: string;
  createdAt: string;
}

export interface PlatformActivityLog {
  id: string;
  eventType: string;
  phoneNumber?: string;
  customerName?: string;
  conversationId?: string;
  status: 'success' | 'failure' | 'pending' | 'escalated' | 'blocked';
  details: Record<string, unknown>;
  aiModel?: string;
  tokensUsed: number;
  latencyMs: number;
  errorMessage?: string;
  createdAt: string;
}

export interface PlatformTaskExecution {
  id: string;
  taskType: string;
  status: 'started' | 'completed' | 'failed' | 'retrying';
  targetId?: string;
  inputPayload?: Record<string, unknown>;
  outputPayload?: Record<string, unknown>;
  errorDetails?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface PlatformDailyReportMetrics {
  incomingMessages: number;
  outgoingMessages: number;
  supportInteractions: number;
  resolvedIssues: number;
  unresolvedIssues: number;
  orderEnquiries: number;
  productEnquiries: number;
  retentionFollowups: number;
  supplierInteractions: number;
  meetingsScheduled: number;
  humanEscalations: number;
  failedActions: number;
  aiUsage: {
    totalTokens: number;
    totalCalls: number;
    totalErrors: number;
    avgLatencyMs: number;
  };
}

export interface PlatformDailyReportData {
  reportDate: string; // YYYY-MM-DD (Asia/Kolkata)
  summary: string;
  metrics: PlatformDailyReportMetrics;
  categories: Record<string, unknown>;
  unresolvedItems: Array<{ id: string; description: string; phone?: string; severity: string }>;
  recommendations: string[];
  status?: 'draft' | 'compiled' | 'delivered' | 'failed';
}

export interface PlatformDailyReportRecord extends PlatformDailyReportData {
  id: string;
  generatedAt: string;
  updatedAt: string;
}

export interface PlatformReportDeliveryRecord {
  id: string;
  reportId: string;
  channel: 'whatsapp' | 'dashboard' | 'email';
  recipient: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  metaWamid?: string;
  errorMessage?: string;
  deliveredAt?: string;
  createdAt: string;
}

export interface PlatformReportSettings {
  id: string;
  scheduledTime: string;
  timezone: string;
  detailLevel: 'summary' | 'standard' | 'detailed';
  immediateAlerts: boolean;
  whatsappDeliveryEnabled: boolean;
  dashboardDeliveryEnabled: boolean;
  recipientPhoneNumbers: string[];
  updatedAt: string;
  updatedBy: string;
}

export interface PlatformAuditLog {
  id: string;
  action: string;
  actorType: 'system' | 'ai' | 'admin' | 'customer';
  actorId?: string;
  resourceType: string;
  resourceId?: string;
  status: 'success' | 'failure' | 'rejected' | 'authorized';
  changes: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface AdReferralData {
  phoneNumber: string;
  sourceId?: string;
  adId?: string;
  headline?: string;
  body?: string;
  sourceType?: string;
  sourceUrl?: string;
  mediaType?: string;
  imageUrl?: string;
  videoUrl?: string;
  ctwaClid?: string;
  customerId?: string;
  rawReferral?: Record<string, unknown>;
}

export interface AdReferralRecord extends AdReferralData {
  id: string;
  createdAt: string;
}

export interface ROASReport {
  adId: string;
  leadsCount: number;
  ordersCount: number;
  totalRevenue: number;
  adSpend: number;
  roas: number;
  conversionRate: number;
}

export interface PromoCodeRecord {
  id: string;
  code: string;
  type: 'percent' | 'flat' | 'free_delivery';
  value: number;
  minSubtotal?: number;
  maxDiscount?: number;
  expiresAt?: string;
  usageLimit?: number;
  used: number;
  createdAt: string;
}

export type ReviewPlatform = 'website' | 'google' | 'whatsapp' | 'amazon' | 'trustpilot' | 'other';

export interface CustomerReviewRecord {
  id: string;
  platform?: ReviewPlatform;
  customerPhone?: string;
  customerName?: string;
  orderNumber?: string;
  externalReviewId?: string;
  rating: number;
  title?: string;
  comment?: string;
  status: 'submitted' | 'escalated' | 'resolved' | 'published';
  verified?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface UnifiedReviewSummary {
  averageRating: number;
  totalReviews: number;
  platformBreakdown: Record<string, { count: number; averageRating: number }>;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface NdrInstructionRecord {
  id: string;
  customerPhone: string;
  orderNumber?: string;
  instructions: string;
  courier?: string;
  status: 'submitted' | 'forwarded_to_courier' | 'resolved';
  createdAt: string;
}

export class PlatformRepository {
  private client: SupabaseClient;
  private adReferralsCache: AdReferralRecord[] = [];
  private promoCodesCache: Map<string, PromoCodeRecord> = new Map();
  private customerReviewsCache: CustomerReviewRecord[] = [];
  private ndrInstructionsCache: NdrInstructionRecord[] = [];
  private companySettingsCache: CompanySettingsRecord | null = null;
  private activityLogsCache: PlatformActivityLog[] = [];
  private dailyReportsCache: Map<string, PlatformDailyReportRecord> = new Map();
  private reportDeliveriesCache: PlatformReportDeliveryRecord[] = [];
  private reportSettingsCache: PlatformReportSettings = {
    id: 'current',
    scheduledTime: '22:00',
    timezone: 'Asia/Kolkata',
    detailLevel: 'detailed',
    immediateAlerts: true,
    whatsappDeliveryEnabled: true,
    dashboardDeliveryEnabled: true,
    recipientPhoneNumbers: [],
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
  private taskExecutionsCache: Map<string, PlatformTaskExecution> = new Map();
  private auditLogsCache: PlatformAuditLog[] = [];
  private optedOutPhones: Set<string> = new Set();

  constructor(customClient?: SupabaseClient) {
    this.client = customClient || createLocalSupabaseClient();
  }

  // ---------------------------------------------------------------------------
  // 1. CONVERSATIONS
  // ---------------------------------------------------------------------------
  public async getOrCreateConversation(
    phoneNumber: string,
    customerName = 'Customer',
  ): Promise<PlatformConversation> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    const { data, error } = await this.client
      .from('support_conversations')
      .select('*')
      .eq('phone_number', cleanPhone)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, phoneNumber: cleanPhone }, 'Failed querying support_conversations');
      throw new Error(`Database error querying conversation: ${error.message}`);
    }

    if (data) {
      return {
        id: data.id,
        phoneNumber: data.phone_number,
        customerName: data.customer_name,
        status: data.status,
        metadata: data.metadata,
        escalatedAt: data.escalated_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    // Insert new conversation directly into Supabase
    const { data: created, error: insertError } = await this.client
      .from('support_conversations')
      .insert({
        phone_number: cleanPhone,
        customer_name: customerName,
        status: 'active',
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing } = await this.client
          .from('support_conversations')
          .select('*')
          .eq('phone_number', cleanPhone)
          .maybeSingle();

        if (existing) {
          return {
            id: existing.id,
            phoneNumber: existing.phone_number,
            customerName: existing.customer_name,
            status: existing.status,
            metadata: existing.metadata,
            escalatedAt: existing.escalated_at,
            createdAt: existing.created_at,
            updatedAt: existing.updated_at,
          };
        }
      }
      logger.error(
        { insertError, phoneNumber: cleanPhone },
        'Failed creating support_conversations row',
      );
      throw new Error(`Database error creating conversation: ${insertError.message}`);
    }

    return {
      id: created.id,
      phoneNumber: created.phone_number,
      customerName: created.customer_name,
      status: created.status,
      metadata: created.metadata,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  }

  public async updateConversationStatus(
    phoneNumber: string,
    status: ConversationStatus,
  ): Promise<void> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const now = new Date().toISOString();

    const { error } = await this.client
      .from('support_conversations')
      .update({
        status,
        updated_at: now,
        escalated_at: status === 'escalated' ? now : null,
      })
      .eq('phone_number', cleanPhone);

    if (error) {
      logger.error(
        { error, phoneNumber: cleanPhone, status },
        'Failed updating support_conversations status',
      );
      throw new Error(`Database error updating conversation status: ${error.message}`);
    }
  }

  public async updateConversationMetadata(
    phoneNumber: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const now = new Date().toISOString();

    const { error } = await this.client
      .from('support_conversations')
      .update({
        metadata,
        updated_at: now,
      })
      .eq('phone_number', cleanPhone);

    if (error) {
      logger.error(
        { error, phoneNumber: cleanPhone },
        'Failed updating support_conversations metadata',
      );
      throw new Error(`Database error updating conversation metadata: ${error.message}`);
    }
  }

  public async setCustomerOptOut(phoneNumber: string, optedOut: boolean): Promise<void> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (optedOut) {
      this.optedOutPhones.add(cleanPhone);
    } else {
      this.optedOutPhones.delete(cleanPhone);
    }

    try {
      const conv = await this.getOrCreateConversation(cleanPhone);
      const existingMeta = (conv.metadata || {}) as Record<string, unknown>;
      const updatedMeta: Record<string, unknown> = {
        ...existingMeta,
        optedOut,
        optedOutAt: optedOut ? new Date().toISOString() : undefined,
      };

      await this.client
        .from('support_conversations')
        .update({
          metadata: updatedMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);
    } catch (err) {
      logger.warn({ err, phoneNumber: cleanPhone, optedOut }, 'Failed persisting customer opt-out state to database');
    }

    void this.logActivityEvent({
      eventType: optedOut ? 'customer_opt_out' : 'customer_opt_in',
      phoneNumber: cleanPhone,
      status: 'success',
      details: { optedOut },
    }).catch(() => {});
  }

  public async isCustomerOptedOut(phoneNumber: string): Promise<boolean> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (this.optedOutPhones.has(cleanPhone)) {
      return true;
    }

    try {
      const { data, error } = await this.client
        .from('support_conversations')
        .select('status, metadata')
        .eq('phone_number', cleanPhone)
        .maybeSingle();

      if (!error && data) {
        if ((data.status as string) === 'opted_out') {
          this.optedOutPhones.add(cleanPhone);
          return true;
        }
        const meta = (data.metadata || {}) as Record<string, unknown>;
        if (meta.optedOut === true) {
          this.optedOutPhones.add(cleanPhone);
          return true;
        }
      }
    } catch {}

    return false;
  }

  public async getConversationById(id: string): Promise<PlatformConversation | null> {
    const { data, error } = await this.client
      .from('support_conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, id }, 'Failed querying support_conversations by id');
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      phoneNumber: data.phone_number,
      customerName: data.customer_name,
      status: data.status,
      metadata: data.metadata,
      escalatedAt: data.escalated_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  public async getConversationsList(options: {
    status?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<PlatformConversationListItem[]> {
    const limit = options.limit || 50;
    let query = this.client
      .from('support_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (options.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }

    const { data: convs, error } = await query;
    if (error || !convs) {
      logger.error({ error }, 'Failed fetching support_conversations list');
      return [];
    }

    let filtered = convs;
    if (options.search) {
      const s = options.search.toLowerCase().trim();
      filtered = filtered.filter(
        (c: any) =>
          (c.phone_number && c.phone_number.toLowerCase().includes(s)) ||
          (c.customer_name && c.customer_name.toLowerCase().includes(s)),
      );
    }

    const result = await Promise.all(
      filtered.map(async (c: any) => {
        const recent = await this.getRecentMessages(c.phone_number, 1).catch(() => []);
        return {
          id: c.id,
          phoneNumber: c.phone_number,
          customerName: c.customer_name,
          status: c.status,
          metadata: c.metadata,
          escalatedAt: c.escalated_at,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          lastMessage: recent && recent.length > 0 ? recent[recent.length - 1] : undefined,
        };
      }),
    );

    return result;
  }

  // ---------------------------------------------------------------------------
  // 2. MESSAGES (MULTI-TURN CHAT HISTORY)
  // ---------------------------------------------------------------------------
  public async appendMessage(
    conversationId: string,
    phoneNumber: string,
    role: MessageRole,
    content: string,
  ): Promise<PlatformMessage> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const now = new Date().toISOString();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      conversationId,
    );

    const { data, error } = await this.client
      .from('support_messages')
      .insert({
        conversation_id: isUuid ? conversationId : null,
        phone_number: cleanPhone,
        role,
        content,
        created_at: now,
      })
      .select()
      .single();

    if (error) {
      logger.error(
        { error, conversationId, phoneNumber: cleanPhone },
        'Failed inserting support_messages row',
      );
      throw new Error(`Database error appending message: ${error.message}`);
    }

    return {
      id: data.id,
      conversationId: data.conversation_id,
      phoneNumber: data.phone_number,
      role: data.role,
      content: data.content,
      createdAt: data.created_at,
    };
  }

  public async getRecentMessages(phoneNumber: string, limit = 6): Promise<PlatformMessage[]> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    const { data, error } = await this.client
      .from('support_messages')
      .select('*')
      .eq('phone_number', cleanPhone)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, phoneNumber: cleanPhone }, 'Failed fetching recent support_messages');
      throw new Error(`Database error fetching recent messages: ${error.message}`);
    }

    const rows = (data || []).reverse();
    return rows.map((r: any) => ({
      id: r.id,
      conversationId: r.conversation_id,
      phoneNumber: r.phone_number,
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    }));
  }

  // ---------------------------------------------------------------------------
  // 3. ESCALATION TICKETS
  // ---------------------------------------------------------------------------
  public async createEscalationTicket(
    conversationId: string,
    phoneNumber: string,
    customerName: string,
    reason: string,
  ): Promise<PlatformTicket> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const now = new Date().toISOString();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      conversationId,
    );

    const { data, error } = await this.client
      .from('support_tickets')
      .insert({
        conversation_id: isUuid ? conversationId : null,
        phone_number: cleanPhone,
        customer_name: customerName,
        reason,
        status: 'open',
        created_at: now,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, phoneNumber: cleanPhone }, 'Failed inserting support_tickets row');
      throw new Error(`Database error creating escalation ticket: ${error.message}`);
    }

    return {
      id: data.id,
      conversationId: data.conversation_id,
      phoneNumber: data.phone_number,
      customerName: data.customer_name,
      reason: data.reason,
      status: data.status,
      createdAt: data.created_at,
    };
  }

  public async getEscalationTickets(status?: TicketStatus): Promise<PlatformTicket[]> {
    let query = this.client
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      logger.error({ error, status }, 'Failed fetching support_tickets');
      throw new Error(`Database error fetching tickets: ${error.message}`);
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      conversationId: t.conversation_id,
      phoneNumber: t.phone_number,
      customerName: t.customer_name,
      reason: t.reason,
      status: t.status,
      createdAt: t.created_at,
      resolvedAt: t.resolved_at,
    }));
  }

  public async getTicketById(ticketId: string): Promise<PlatformTicket | null> {
    const { data, error } = await this.client
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      conversationId: data.conversation_id,
      phoneNumber: data.phone_number,
      customerName: data.customer_name,
      reason: data.reason,
      status: data.status,
      createdAt: data.created_at,
      resolvedAt: data.resolved_at,
    };
  }

  public async resolveTicket(ticketId: string): Promise<PlatformTicket | null> {
    const now = new Date().toISOString();

    let data: any = null;
    let error: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.client
        .from('support_tickets')
        .update({ status: 'resolved', resolved_at: now })
        .eq('id', ticketId)
        .select()
        .single();
      data = res.data;
      error = res.error;
      if (!error) break;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    if (error) {
      logger.error({ error, ticketId }, 'Failed resolving support_tickets row');
      throw new Error(`Database error resolving ticket: ${error.message}`);
    }

    if (data?.phone_number) {
      await this.updateConversationStatus(data.phone_number, 'active');
    }

    return {
      id: data.id,
      conversationId: data.conversation_id,
      phoneNumber: data.phone_number,
      customerName: data.customer_name,
      reason: data.reason,
      status: data.status,
      createdAt: data.created_at,
      resolvedAt: data.resolved_at,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. MARKETING DISPATCH PERSISTENCE (14-DAY FATIGUE TRACKER)
  // ---------------------------------------------------------------------------
  public async logMarketingDispatch(
    phoneNumber: string,
    segmentType: string,
    messagePreview: string,
    status: 'sent' | 'skipped' | 'failed',
  ): Promise<void> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const now = new Date().toISOString();

    const { error } = await this.client.from('marketing_dispatches').insert({
      phone_number: cleanPhone,
      segment_type: segmentType,
      message_preview: messagePreview,
      status,
      dispatched_at: now,
    });

    if (error) {
      logger.error({ error, phoneNumber: cleanPhone }, 'Failed inserting marketing_dispatches row');
      throw new Error(`Database error logging marketing dispatch: ${error.message}`);
    }
  }

  public async getLastMarketingDispatchTime(phoneNumber: string): Promise<number | null> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    const { data, error } = await this.client
      .from('marketing_dispatches')
      .select('dispatched_at')
      .eq('phone_number', cleanPhone)
      .eq('status', 'sent')
      .order('dispatched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, phoneNumber: cleanPhone }, 'Failed fetching last marketing dispatch');
      throw new Error(`Database error fetching marketing dispatch: ${error.message}`);
    }

    return data ? new Date(data.dispatched_at).getTime() : null;
  }

  // ---------------------------------------------------------------------------
  // 5. MESSAGING RECEIPTS
  // ---------------------------------------------------------------------------
  public async logMessagingReceipt(
    wamid: string,
    recipient: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
  ): Promise<void> {
    const cleanPhone = recipient.replace(/\D/g, '');
    const now = new Date().toISOString();

    const { error } = await this.client.from('messaging_receipts').upsert(
      {
        wamid,
        recipient: cleanPhone,
        status,
        timestamp: now,
      },
      { onConflict: 'wamid' },
    );

    if (error) {
      logger.error({ error, wamid, recipient: cleanPhone }, 'Failed logging messaging receipt');
      throw new Error(`Database error logging messaging receipt: ${error.message}`);
    }

    // Update corresponding report delivery status if this receipt corresponds to a daily report dispatch
    for (const d of this.reportDeliveriesCache) {
      if (d.metaWamid === wamid) {
        d.status = status;
        if (status === 'delivered' || status === 'read') {
          d.deliveredAt = now;
        }
      }
    }

    try {
      await this.client
        .from('ai_report_deliveries')
        .update({
          status,
          delivered_at: status === 'delivered' || status === 'read' ? now : null,
        })
        .eq('meta_wamid', wamid);
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // 6. WORKER QUEUE JOBS
  // ---------------------------------------------------------------------------
  public async enqueueJob(
    jobType: string,
    payload: Record<string, unknown>,
    scheduledFor = new Date().toISOString(),
  ): Promise<PlatformWorkerJob> {
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('worker_jobs')
      .insert({
        job_type: jobType,
        payload,
        status: 'pending',
        retries: 0,
        scheduled_for: scheduledFor,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, jobType }, 'Failed inserting worker_jobs row');
      throw new Error(`Database error enqueueing job: ${error.message}`);
    }

    return {
      id: data.id,
      jobType: data.job_type,
      payload: data.payload,
      status: data.status,
      retries: data.retries,
      maxRetries: data.max_retries,
      scheduledFor: data.scheduled_for,
      createdAt: data.created_at,
    };
  }

  public async fetchPendingJobs(limit = 10): Promise<PlatformWorkerJob[]> {
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('worker_jobs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error({ error }, 'Failed fetching pending worker_jobs');
      throw new Error(`Database error fetching pending jobs: ${error.message}`);
    }

    return (data || []).map((j: any) => ({
      id: j.id,
      jobType: j.job_type,
      payload: j.payload,
      status: j.status,
      retries: j.retries,
      maxRetries: j.max_retries,
      error: j.error,
      scheduledFor: j.scheduled_for,
      createdAt: j.created_at,
    }));
  }

  public async fetchScheduledJobs(jobType?: string, limit = 50): Promise<PlatformWorkerJob[]> {
    let query = this.client
      .from('worker_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (jobType) {
      query = query.eq('job_type', jobType);
    }

    const { data, error } = await query;
    if (error) {
      logger.error({ error }, 'Failed fetching scheduled worker_jobs');
      throw new Error(`Database error fetching scheduled jobs: ${error.message}`);
    }

    return (data || []).map((j: any) => ({
      id: j.id,
      jobType: j.job_type,
      payload: j.payload,
      status: j.status,
      retries: j.retries,
      maxRetries: j.max_retries,
      error: j.error,
      scheduledFor: j.scheduled_for,
      createdAt: j.created_at,
    }));
  }

  public async updateJobStatus(
    jobId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter',
    errorMsg?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status,
      error: errorMsg || null,
      updated_at: now,
    };
    if (status === 'completed' || status === 'failed' || status === 'dead_letter') {
      updateData.locked_at = null;
      updateData.locked_by = null;
    }

    const { error } = await this.client
      .from('worker_jobs')
      .update(updateData)
      .eq('id', jobId);

    if (error) {
      logger.error({ error, jobId, status }, 'Failed updating worker_jobs status');
      throw new Error(`Database error updating job status: ${error.message}`);
    }
  }

  public async claimPendingJobs(
    workerId: string,
    limit = 10,
    lockTimeoutSec = 300,
  ): Promise<PlatformWorkerJob[]> {
    const now = new Date();
    const nowIso = now.toISOString();
    const expiredLockIso = new Date(now.getTime() - lockTimeoutSec * 1000).toISOString();

    let candidates: any[] | null = null;
    let hasLockColumns = true;

    // Try fetching with lock condition
    const { data, error } = await this.client
      .from('worker_jobs')
      .select('*')
      .or(`status.eq.pending,and(status.eq.processing,locked_at.lt.${expiredLockIso})`)
      .lte('scheduled_for', nowIso)
      .order('scheduled_for', { ascending: true })
      .limit(limit);

    if (error) {
      hasLockColumns = false;
      // Fallback if locked_at column does not exist yet in DB schema
      const fallbackRes = await this.client
        .from('worker_jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_for', nowIso)
        .order('scheduled_for', { ascending: true })
        .limit(limit);

      if (fallbackRes.error) {
        logger.error({ error: fallbackRes.error }, 'Failed fetching candidates for job claim');
        return [];
      }
      candidates = fallbackRes.data;
    } else {
      candidates = data;
    }

    const claimed: PlatformWorkerJob[] = [];

    for (const j of candidates || []) {
      const updatePayload: Record<string, unknown> = {
        status: 'processing',
        updated_at: nowIso,
      };
      if (hasLockColumns) {
        updatePayload.locked_at = nowIso;
        updatePayload.locked_by = workerId;
      }

      const { data: updated, error: updateError } = await this.client
        .from('worker_jobs')
        .update(updatePayload)
        .eq('id', j.id)
        .select()
        .single();

      if (!updateError && updated) {
        claimed.push({
          id: updated.id,
          jobType: updated.job_type,
          payload: updated.payload,
          status: updated.status,
          retries: updated.retries,
          maxRetries: updated.max_retries,
          error: updated.error,
          lockedAt: updated.locked_at,
          lockedBy: updated.locked_by || workerId,
          scheduledFor: updated.scheduled_for,
          createdAt: updated.created_at,
        });
      }
    }

    return claimed;
  }

  public async markJobFailedOrRetry(
    jobId: string,
    errorMsg: string,
    baseBackoffMs = 60000,
  ): Promise<{ status: 'retrying' | 'dead_letter'; retries: number; scheduledFor?: string }> {
    const now = new Date();
    const { data: job, error: fetchErr } = await this.client
      .from('worker_jobs')
      .select('retries, max_retries')
      .eq('id', jobId)
      .single();

    if (fetchErr || !job) {
      await this.updateJobStatus(jobId, 'failed', errorMsg);
      return { status: 'dead_letter', retries: 0 };
    }

    const nextRetries = (job.retries || 0) + 1;
    const maxRetries = job.max_retries || 3;

    if (nextRetries >= maxRetries) {
      const res = await this.client
        .from('worker_jobs')
        .update({
          status: 'dead_letter',
          retries: nextRetries,
          error: errorMsg,
          locked_at: null,
          locked_by: null,
          updated_at: now.toISOString(),
        })
        .eq('id', jobId);

      if (res.error) {
        await this.client
          .from('worker_jobs')
          .update({
            status: 'failed',
            retries: nextRetries,
            error: errorMsg,
            updated_at: now.toISOString(),
          })
          .eq('id', jobId);
      }

      logger.warn({ jobId, retries: nextRetries, maxRetries }, 'Worker job exceeded max retries, moved to dead_letter');
      return { status: 'dead_letter', retries: nextRetries };
    } else {
      const exponentialDelay = baseBackoffMs * Math.pow(2, nextRetries - 1);
      const jitter = Math.floor(Math.random() * (baseBackoffMs * 0.5));
      const delayMs = exponentialDelay + jitter;
      const scheduledFor = new Date(now.getTime() + delayMs).toISOString();

      const res = await this.client
        .from('worker_jobs')
        .update({
          status: 'pending',
          retries: nextRetries,
          error: errorMsg,
          scheduled_for: scheduledFor,
          locked_at: null,
          locked_by: null,
          updated_at: now.toISOString(),
        })
        .eq('id', jobId);

      if (res.error) {
        await this.client
          .from('worker_jobs')
          .update({
            status: 'pending',
            retries: nextRetries,
            error: errorMsg,
            scheduled_for: scheduledFor,
            updated_at: now.toISOString(),
          })
          .eq('id', jobId);
      }

      logger.info({ jobId, nextRetries, scheduledFor, delayMs }, 'Scheduled job retry with exponential backoff');
      return { status: 'retrying', retries: nextRetries, scheduledFor };
    }
  }

  public async markJobCompleted(jobId: string): Promise<void> {
    const now = new Date().toISOString();
    const res = await this.client
      .from('worker_jobs')
      .update({
        status: 'completed',
        locked_at: null,
        locked_by: null,
        updated_at: now,
      })
      .eq('id', jobId);

    if (res.error) {
      await this.client
        .from('worker_jobs')
        .update({
          status: 'completed',
          updated_at: now,
        })
        .eq('id', jobId);
    }
  }

  // ---------------------------------------------------------------------------
  // 6.5 AI ACTIVITY LOGS, TASK EXECUTIONS & AUDIT
  // ---------------------------------------------------------------------------
  public async logActivityEvent(input: {
    eventType: string;
    phoneNumber?: string;
    customerName?: string;
    conversationId?: string;
    status?: 'success' | 'failure' | 'pending' | 'escalated' | 'blocked';
    details?: Record<string, unknown>;
    aiModel?: string;
    tokensUsed?: number;
    latencyMs?: number;
    errorMessage?: string;
  }): Promise<PlatformActivityLog> {
    const fallbackRecord: PlatformActivityLog = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      eventType: input.eventType,
      phoneNumber: input.phoneNumber,
      customerName: input.customerName,
      conversationId: input.conversationId,
      status: input.status || 'success',
      details: input.details || {},
      aiModel: input.aiModel,
      tokensUsed: input.tokensUsed || 0,
      latencyMs: input.latencyMs || 0,
      errorMessage: input.errorMessage,
      createdAt: new Date().toISOString(),
    };

    this.activityLogsCache.unshift(fallbackRecord);

    try {
      const { data, error } = await this.client
        .from('ai_activity_logs')
        .insert({
          event_type: input.eventType,
          phone_number: input.phoneNumber || null,
          customer_name: input.customerName || null,
          conversation_id: input.conversationId || null,
          status: input.status || 'success',
          details: input.details || {},
          ai_model: input.aiModel || null,
          tokens_used: input.tokensUsed || 0,
          latency_ms: input.latencyMs || 0,
          error_message: input.errorMessage || null,
        })
        .select()
        .single();

      if (!error && data) {
        fallbackRecord.id = data.id;
        return {
          id: data.id,
          eventType: data.event_type,
          phoneNumber: data.phone_number,
          customerName: data.customer_name,
          conversationId: data.conversation_id,
          status: data.status,
          details: data.details,
          aiModel: data.ai_model,
          tokensUsed: data.tokens_used,
          latencyMs: data.latency_ms,
          errorMessage: data.error_message,
          createdAt: data.created_at,
        };
      }
    } catch {
      // Return memory fallback
    }

    return fallbackRecord;
  }

  public async getActivityLogs(filters?: {
    eventType?: string;
    phoneNumber?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PlatformActivityLog[]> {
    let logs: PlatformActivityLog[] = [];
    try {
      let query = this.client
        .from('ai_activity_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.eventType) query = query.eq('event_type', filters.eventType);
      if (filters?.phoneNumber) query = query.eq('phone_number', filters.phoneNumber);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.limit) query = query.limit(filters.limit);
      if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        logs = data.map((d: any) => ({
          id: d.id,
          eventType: d.event_type,
          phoneNumber: d.phone_number,
          customerName: d.customer_name,
          conversationId: d.conversation_id,
          status: d.status,
          details: d.details,
          aiModel: d.ai_model,
          tokensUsed: d.tokens_used,
          latencyMs: d.latency_ms,
          errorMessage: d.error_message,
          createdAt: d.created_at,
        }));
      }
    } catch {}

    if (logs.length === 0 && this.activityLogsCache.length > 0) {
      let cached = [...this.activityLogsCache];
      if (filters?.eventType) cached = cached.filter((l) => l.eventType === filters.eventType);
      if (filters?.phoneNumber) cached = cached.filter((l) => l.phoneNumber === filters.phoneNumber);
      if (filters?.status) cached = cached.filter((l) => l.status === filters.status);
      const offset = filters?.offset || 0;
      const limit = filters?.limit || 50;
      return cached.slice(offset, offset + limit);
    }

    return logs;
  }

  public async startTaskExecution(
    taskType: string,
    targetId?: string,
    inputPayload?: Record<string, unknown>,
  ): Promise<string> {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const record: PlatformTaskExecution = {
      id,
      taskType,
      targetId,
      inputPayload,
      status: 'started',
      startedAt: new Date().toISOString(),
    };
    this.taskExecutionsCache.set(id, record);

    try {
      const { data, error } = await this.client
        .from('ai_task_executions')
        .insert({
          task_type: taskType,
          target_id: targetId || null,
          input_payload: inputPayload || {},
          status: 'started',
        })
        .select('id')
        .single();

      if (!error && data) {
        record.id = data.id;
        this.taskExecutionsCache.set(data.id, record);
        return data.id;
      }
    } catch {}

    return id;
  }

  public async completeTaskExecution(
    executionId: string,
    outputPayload?: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.taskExecutionsCache.get(executionId);
    if (existing) {
      existing.status = 'completed';
      existing.outputPayload = outputPayload;
      existing.completedAt = now;
      existing.durationMs = Date.now() - new Date(existing.startedAt).getTime();
    }

    try {
      await this.client
        .from('ai_task_executions')
        .update({
          status: 'completed',
          output_payload: outputPayload || {},
          completed_at: now,
        })
        .eq('id', executionId);
    } catch {}
  }

  public async failTaskExecution(executionId: string, errorDetails: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.taskExecutionsCache.get(executionId);
    if (existing) {
      existing.status = 'failed';
      existing.errorDetails = errorDetails;
      existing.completedAt = now;
      existing.durationMs = Date.now() - new Date(existing.startedAt).getTime();
    }

    try {
      await this.client
        .from('ai_task_executions')
        .update({
          status: 'failed',
          error_details: errorDetails,
          completed_at: now,
        })
        .eq('id', executionId);
    } catch {}
  }

  public async logAuditEvent(input: {
    action: string;
    actorType: 'system' | 'ai' | 'admin' | 'customer';
    actorId?: string;
    resourceType: string;
    resourceId?: string;
    status?: 'success' | 'failure' | 'rejected' | 'authorized';
    changes?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    const record: PlatformAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      action: input.action,
      actorType: input.actorType,
      actorId: input.actorId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      status: input.status || 'success',
      changes: input.changes || {},
      ipAddress: input.ipAddress,
      createdAt: new Date().toISOString(),
    };
    this.auditLogsCache.unshift(record);

    try {
      const { data, error } = await this.client
        .from('ai_audit_logs')
        .insert({
          action: input.action,
          actor_type: input.actorType,
          actor_id: input.actorId || null,
          resource_type: input.resourceType,
          resource_id: input.resourceId || null,
          status: input.status || 'success',
          changes: input.changes || {},
          ip_address: input.ipAddress || null,
        })
        .select()
        .single();

      if (!error && data) {
        record.id = data.id;
      }
    } catch {}
  }

  public async getAuditLogs(limit = 50): Promise<PlatformAuditLog[]> {
    try {
      const { data, error } = await this.client
        .from('ai_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          action: d.action,
          actorType: d.actor_type,
          actorId: d.actor_id,
          resourceType: d.resource_type,
          resourceId: d.resource_id,
          status: d.status,
          changes: d.changes,
          ipAddress: d.ip_address,
          createdAt: d.created_at,
        }));
      }
    } catch {}

    return this.auditLogsCache.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // 6.6 DAILY REPORTING FOUNDATION (22:00 IST)
  // ---------------------------------------------------------------------------
  public async getDailyReportSettings(): Promise<PlatformReportSettings> {
    try {
      const { data, error } = await this.client
        .from('ai_report_settings')
        .select('*')
        .eq('id', 'current')
        .single();

      if (!error && data) {
        this.reportSettingsCache = {
          id: data.id,
          scheduledTime: data.scheduled_time,
          timezone: data.timezone,
          detailLevel: data.detail_level,
          immediateAlerts: data.immediate_alerts,
          whatsappDeliveryEnabled: data.whatsapp_delivery_enabled,
          dashboardDeliveryEnabled: data.dashboard_delivery_enabled,
          recipientPhoneNumbers: Array.isArray(data.recipient_phone_numbers) ? data.recipient_phone_numbers : [],
          updatedAt: data.updated_at,
          updatedBy: data.updated_by,
        };
      }
    } catch {}

    return this.reportSettingsCache;
  }

  public async updateDailyReportSettings(
    settings: Partial<PlatformReportSettings>,
  ): Promise<PlatformReportSettings> {
    this.reportSettingsCache = {
      ...this.reportSettingsCache,
      ...settings,
      updatedAt: new Date().toISOString(),
    };

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (settings.scheduledTime !== undefined) updatePayload.scheduled_time = settings.scheduledTime;
    if (settings.timezone !== undefined) updatePayload.timezone = settings.timezone;
    if (settings.detailLevel !== undefined) updatePayload.detail_level = settings.detailLevel;
    if (settings.immediateAlerts !== undefined) updatePayload.immediate_alerts = settings.immediateAlerts;
    if (settings.whatsappDeliveryEnabled !== undefined) updatePayload.whatsapp_delivery_enabled = settings.whatsappDeliveryEnabled;
    if (settings.dashboardDeliveryEnabled !== undefined) updatePayload.dashboard_delivery_enabled = settings.dashboardDeliveryEnabled;
    if (settings.recipientPhoneNumbers !== undefined) updatePayload.recipient_phone_numbers = settings.recipientPhoneNumbers;
    if (settings.updatedBy !== undefined) updatePayload.updated_by = settings.updatedBy;

    try {
      const { data, error } = await this.client
        .from('ai_report_settings')
        .upsert({ id: 'current', ...updatePayload })
        .select()
        .single();

      if (!error && data) {
        this.reportSettingsCache = {
          id: data.id,
          scheduledTime: data.scheduled_time,
          timezone: data.timezone,
          detailLevel: data.detail_level,
          immediateAlerts: data.immediate_alerts,
          whatsappDeliveryEnabled: data.whatsapp_delivery_enabled,
          dashboardDeliveryEnabled: data.dashboard_delivery_enabled,
          recipientPhoneNumbers: data.recipient_phone_numbers || [],
          updatedAt: data.updated_at,
          updatedBy: data.updated_by,
        };
      }
    } catch {}

    return this.reportSettingsCache;
  }

  public async compileDailyReport(
    dateIST?: string,
    options: { cutoffTime?: string; reconcileLateEvents?: boolean } = {},
  ): Promise<PlatformDailyReportData> {
    let targetDate = dateIST;
    if (!targetDate) {
      const now = new Date();
      const istFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      targetDate = istFormatter.format(now);
    }

    const parts = targetDate.split('-').map(Number);
    const year = parts[0] || new Date().getFullYear();
    const month = parts[1] || (new Date().getMonth() + 1);
    const day = parts[2] || new Date().getDate();

    // Start of reporting day: 00:00:00.000 IST (UTC+5:30)
    const startUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000).toISOString();
    
    // Scheduled daily report cutoff: 22:00:00.000 IST (UTC+5:30)
    const [cutoffHour, cutoffMinute] = (options.cutoffTime || '22:00').split(':').map(Number);
    const cutoffUtc = new Date(Date.UTC(year, month - 1, day, cutoffHour ?? 22, cutoffMinute ?? 0, 0, 0) - (5 * 60 + 30) * 60 * 1000).toISOString();

    // End of full IST day: 23:59:59.999 IST
    const endOfDayUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - (5 * 60 + 30) * 60 * 1000).toISOString();

    let dbLogs: any[] = [];
    try {
      const { data: logs, error: logsError } = await this.client
        .from('ai_activity_logs')
        .select('*')
        .gte('created_at', startUtc)
        .lte('created_at', endOfDayUtc);

      if (!logsError && logs) {
        dbLogs = logs;
      }
    } catch {}

    const cacheLogs = this.activityLogsCache.filter(
      (l) => l.createdAt >= startUtc && l.createdAt <= endOfDayUtc,
    );
    const seenIds = new Set<string>();
    const allLogs: PlatformActivityLog[] = [];

    for (const l of [...dbLogs, ...cacheLogs]) {
      const id = l.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allLogs.push({
          id: l.id,
          eventType: l.event_type || l.eventType,
          phoneNumber: l.phone_number || l.phoneNumber,
          customerName: l.customer_name || l.customerName,
          conversationId: l.conversation_id || l.conversationId,
          status: l.status,
          details: l.details || {},
          aiModel: l.ai_model || l.aiModel,
          tokensUsed: l.tokens_used ?? l.tokensUsed ?? 0,
          latencyMs: l.latency_ms ?? l.latencyMs ?? 0,
          errorMessage: l.error_message || l.errorMessage,
          createdAt: l.created_at || l.createdAt,
        });
      }
    }

    // Partition events: Core reporting window (<= 22:00 IST) vs late-arriving events (> 22:00 IST)
    const activityLogs = allLogs.filter((l) => (options.reconcileLateEvents ? true : l.createdAt <= cutoffUtc));
    const lateArrivingLogs = allLogs.filter((l) => l.createdAt > cutoffUtc && l.createdAt <= endOfDayUtc);

    let tickets: any[] = [];
    try {
      const { data: ticketData } = await this.client
        .from('support_tickets')
        .select('*');
      if (ticketData) tickets = ticketData;
    } catch {}

    const openTicketsCount = (tickets || []).filter((t: any) => t.status === 'open' || t.status === 'in_progress').length;
    const resolvedTodayCount = (tickets || []).filter((t: any) => {
      if (t.status !== 'resolved' || !t.resolved_at) return false;
      return t.resolved_at >= startUtc && t.resolved_at <= endOfDayUtc;
    }).length;

    let incomingMessages = 0;
    let outgoingMessages = 0;
    let supportInteractions = 0;
    let orderEnquiries = 0;
    let productEnquiries = 0;
    let retentionFollowups = 0;
    let supplierInteractions = 0;
    let meetingsScheduled = 0;
    let humanEscalations = 0;
    let failedActions = 0;
    let totalTokens = 0;
    let totalAiCalls = 0;
    let totalAiErrors = 0;
    let totalLatencyMs = 0;

    const unresolvedItems: Array<{ id: string; description: string; phone?: string; severity: string }> = [];

    for (const log of activityLogs) {
      if (log.tokensUsed) {
        totalTokens += Number(log.tokensUsed);
        totalAiCalls += 1;
        totalLatencyMs += Number(log.latencyMs || 0);
      }
      if (log.status === 'failure' || log.errorMessage) {
        totalAiErrors += 1;
        failedActions += 1;
        unresolvedItems.push({
          id: log.id,
          description: log.errorMessage || `Failure during ${log.eventType}`,
          phone: log.phoneNumber || undefined,
          severity: 'medium',
        });
      }

      switch (log.eventType) {
        case 'incoming_message':
          incomingMessages++;
          break;
        case 'outgoing_message':
          outgoingMessages++;
          break;
        case 'support_interaction':
          supportInteractions++;
          break;
        case 'order_enquiry':
          orderEnquiries++;
          break;
        case 'product_enquiry':
          productEnquiries++;
          break;
        case 'retention_followup':
          retentionFollowups++;
          break;
        case 'supplier_interaction':
          supplierInteractions++;
          break;
        case 'meeting_scheduled':
          meetingsScheduled++;
          break;
        case 'human_escalation':
          humanEscalations++;
          break;
        case 'failed_action':
          failedActions++;
          break;
      }
    }

    for (const ticket of tickets || []) {
      if (ticket.status === 'open' || ticket.status === 'in_progress') {
        unresolvedItems.push({
          id: ticket.id,
          description: `Customer Escalation: ${ticket.reason || 'Human agent assistance requested'}`,
          phone: ticket.phone_number,
          severity: 'high',
        });
      }
    }

    const avgLatencyMs = totalAiCalls > 0 ? Math.round(totalLatencyMs / totalAiCalls) : 0;

    const metrics: PlatformDailyReportMetrics = {
      incomingMessages,
      outgoingMessages,
      supportInteractions,
      resolvedIssues: resolvedTodayCount,
      unresolvedIssues: openTicketsCount,
      orderEnquiries,
      productEnquiries,
      retentionFollowups,
      supplierInteractions,
      meetingsScheduled,
      humanEscalations,
      failedActions,
      aiUsage: {
        totalTokens,
        totalCalls: totalAiCalls,
        totalErrors: totalAiErrors,
        avgLatencyMs,
      },
    };

    const categories = {
      reportingWindow: {
        timezone: 'Asia/Kolkata',
        scheduledCutoff: options.cutoffTime || '22:00',
        startUtc,
        cutoffUtc,
        endOfDayUtc,
        reconciled: Boolean(options.reconcileLateEvents),
      },
      lateArrivingCount: lateArrivingLogs.length,
      lateArrivingEvents: lateArrivingLogs.map((l) => ({
        id: l.id,
        eventType: l.eventType,
        phoneNumber: l.phoneNumber,
        createdAt: l.createdAt,
      })),
      customerSupport: {
        interactions: supportInteractions,
        orderEnquiries,
        productEnquiries,
        escalations: humanEscalations,
        resolvedToday: resolvedTodayCount,
        openEscalations: openTicketsCount,
      },
      marketingAndRetention: {
        retentionFollowups,
      },
      operations: {
        supplierInteractions,
        meetingsScheduled,
        failedActions,
      },
      aiPerformance: {
        totalAiCalls,
        totalTokens,
        totalErrors: totalAiErrors,
        avgLatencyMs,
      },
    };

    const recommendations: string[] = [];
    if (lateArrivingLogs.length > 0 && !options.reconcileLateEvents) {
      recommendations.push(
        `Reconciliation notice: ${lateArrivingLogs.length} event(s) arrived after 22:00 IST cutoff. Trigger reconciliation to merge.`,
      );
    }
    if (openTicketsCount > 0) {
      recommendations.push(`Review and resolve ${openTicketsCount} open customer escalation ticket(s).`);
    }
    if (failedActions > 0) {
      recommendations.push(`Investigate ${failedActions} failed action(s) logged during operations.`);
    }
    if (orderEnquiries > 0 && orderEnquiries > supportInteractions * 0.4) {
      recommendations.push('High volume of order status inquiries detected. Ensure tracking links are sent proactively.');
    }
    if (recommendations.length === 0) {
      recommendations.push('All systems operated smoothly with zero critical escalations.');
    }

    const summary = [
      `📊 *Mintara AI Daily Operational Intelligence Report*`,
      `📅 *Date:* ${targetDate} (22:00 IST)`,
      ``,
      `💬 *Messaging & Conversations:*`,
      `• Inbound Messages: ${incomingMessages}`,
      `• Outbound Messages: ${outgoingMessages}`,
      `• Support Interactions: ${supportInteractions}`,
      `• Order Inquiries: ${orderEnquiries}`,
      `• Product Inquiries: ${productEnquiries}`,
      ``,
      `🎫 *Resolution & Human Escalations:*`,
      `• Resolved Today: ${resolvedTodayCount}`,
      `• Open Pending Tickets: ${openTicketsCount}`,
      `• Human Escalations: ${humanEscalations}`,
      ``,
      `📈 *Growth & Retention:*`,
      `• Retention Follow-ups Dispatched: ${retentionFollowups}`,
      `• Supplier Interactions: ${supplierInteractions}`,
      `• Meetings Scheduled: ${meetingsScheduled}`,
      ``,
      `🤖 *AI Engine Health:*`,
      `• AI Completions: ${totalAiCalls}`,
      `• Tokens Consumed: ${totalTokens.toLocaleString()}`,
      `• Avg Latency: ${avgLatencyMs}ms`,
      `• AI Errors: ${totalAiErrors}`,
      ``,
      openTicketsCount > 0
        ? `⚠️ *Action Required:* ${openTicketsCount} open ticket(s) awaiting human review in Command Center.`
        : `✅ *Status:* All customer inquiries resolved smoothly today.`,
    ].join('\n');

    return {
      reportDate: targetDate,
      summary,
      metrics,
      categories,
      unresolvedItems: unresolvedItems.slice(0, 20),
      recommendations,
      status: 'compiled',
    };
  }

  public async saveDailyReport(report: PlatformDailyReportData): Promise<PlatformDailyReportRecord> {
    const now = new Date().toISOString();
    const record: PlatformDailyReportRecord = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      reportDate: report.reportDate,
      summary: report.summary,
      metrics: report.metrics,
      categories: report.categories,
      unresolvedItems: report.unresolvedItems,
      recommendations: report.recommendations,
      status: report.status || 'compiled',
      generatedAt: now,
      updatedAt: now,
    };
    this.dailyReportsCache.set(report.reportDate, record);

    try {
      const { data, error } = await this.client
        .from('ai_daily_reports')
        .upsert(
          {
            report_date: report.reportDate,
            summary: report.summary,
            metrics: report.metrics,
            categories: report.categories,
            unresolved_items: report.unresolvedItems,
            recommendations: report.recommendations,
            status: report.status || 'compiled',
            updated_at: now,
          },
          { onConflict: 'report_date' },
        )
        .select()
        .single();

      if (!error && data) {
        record.id = data.id;
        this.dailyReportsCache.set(report.reportDate, record);
      }
    } catch {}

    return record;
  }

  public async getDailyReport(dateIST: string): Promise<PlatformDailyReportRecord | null> {
    try {
      const { data, error } = await this.client
        .from('ai_daily_reports')
        .select('*')
        .eq('report_date', dateIST)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          reportDate: data.report_date,
          summary: data.summary,
          metrics: data.metrics,
          categories: data.categories,
          unresolvedItems: data.unresolved_items,
          recommendations: data.recommendations,
          status: data.status,
          generatedAt: data.generated_at,
          updatedAt: data.updated_at,
        };
      }
    } catch {}

    return this.dailyReportsCache.get(dateIST) || null;
  }

  public async listDailyReports(limit = 30): Promise<PlatformDailyReportRecord[]> {
    const cached = Array.from(this.dailyReportsCache.values());
    try {
      const { data, error } = await this.client
        .from('ai_daily_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .limit(limit);

      if (!error && data && data.length > 0) {
        return (data || []).map((d: any) => ({
          id: d.id,
          reportDate: d.report_date,
          summary: d.summary,
          metrics: d.metrics,
          categories: d.categories,
          unresolvedItems: d.unresolved_items,
          recommendations: d.recommendations,
          status: d.status,
          generatedAt: d.generated_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch {}

    return cached.slice(0, limit);
  }

  public async recordReportDelivery(delivery: {
    reportId: string;
    channel: 'whatsapp' | 'dashboard' | 'email';
    recipient: string;
    status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
    metaWamid?: string;
    errorMessage?: string;
  }): Promise<PlatformReportDeliveryRecord> {
    const record: PlatformReportDeliveryRecord = {
      id: `del_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      reportId: delivery.reportId,
      channel: delivery.channel,
      recipient: delivery.recipient,
      status: delivery.status,
      metaWamid: delivery.metaWamid,
      errorMessage: delivery.errorMessage,
      deliveredAt: delivery.status === 'delivered' ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };
    this.reportDeliveriesCache.unshift(record);

    try {
      const { data, error } = await this.client
        .from('ai_report_deliveries')
        .insert({
          report_id: delivery.reportId,
          channel: delivery.channel,
          recipient: delivery.recipient,
          status: delivery.status,
          meta_wamid: delivery.metaWamid || null,
          error_message: delivery.errorMessage || null,
          delivered_at: delivery.status === 'delivered' ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (!error && data) {
        record.id = data.id;
      }
    } catch {}

    return record;
  }

  // ---------------------------------------------------------------------------
  // 7. ANALYTICS SUMMARY
  // ---------------------------------------------------------------------------
  public async getAnalyticsSummary(): Promise<{
    activeConversations: number;
    escalatedConversations: number;
    openTickets: number;
    totalDispatches: number;
    receipts: { sent: number; delivered: number; read: number; failed: number };
  }> {
    const [convRes, tktRes, dispRes, rcpRes] = await Promise.all([
      this.client.from('support_conversations').select('status'),
      this.client.from('support_tickets').select('status').eq('status', 'open'),
      this.client.from('marketing_dispatches').select('id', { count: 'exact', head: true }),
      this.client.from('messaging_receipts').select('status'),
    ]);

    const conversations = convRes.data || [];
    const activeConversations = conversations.filter((c: any) => c.status === 'active').length;
    const escalatedConversations = conversations.filter(
      (c: any) => c.status === 'escalated',
    ).length;
    const openTickets = (tktRes.data || []).length;
    const totalDispatches = dispRes.count || 0;

    let sent = 0;
    let delivered = 0;
    let read = 0;
    let failed = 0;

    (rcpRes.data || []).forEach((r: any) => {
      if (r.status === 'sent') sent++;
      else if (r.status === 'delivered') delivered++;
      else if (r.status === 'read') read++;
      else if (r.status === 'failed') failed++;
    });

    return {
      activeConversations,
      escalatedConversations,
      openTickets,
      totalDispatches,
      receipts: { sent, delivered, read, failed },
    };
  }

  // ---------------------------------------------------------------------------
  // 8. CLICK-TO-WHATSAPP (CTWA) AD REFERRALS & ROAS ATTRIBUTION
  // ---------------------------------------------------------------------------
  public async recordAdReferral(data: AdReferralData): Promise<AdReferralRecord> {
    const cleanPhone = data.phoneNumber.replace(/\D/g, '');
    const now = new Date().toISOString();

    const record: AdReferralRecord = {
      id: `ref_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      phoneNumber: cleanPhone,
      sourceId: data.sourceId,
      adId: data.adId || data.sourceId,
      headline: data.headline,
      body: data.body,
      sourceType: data.sourceType || 'ad',
      sourceUrl: data.sourceUrl,
      mediaType: data.mediaType,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      ctwaClid: data.ctwaClid,
      customerId: data.customerId,
      rawReferral: data.rawReferral || {},
      createdAt: now,
    };

    // Store in-memory cache for immediate availability
    this.adReferralsCache.unshift(record);

    const payload = {
      phone_number: cleanPhone,
      source_id: data.sourceId || null,
      ad_id: data.adId || data.sourceId || null,
      headline: data.headline || null,
      body: data.body || null,
      source_type: data.sourceType || 'ad',
      source_url: data.sourceUrl || null,
      media_type: data.mediaType || null,
      image_url: data.imageUrl || null,
      video_url: data.videoUrl || null,
      ctwa_clid: data.ctwaClid || null,
      customer_id: data.customerId || null,
      raw_referral: data.rawReferral || {},
      created_at: now,
    };

    try {
      let insertResult = await this.client.from('ad_referrals').insert(payload).select().single();

      if (insertResult.error) {
        insertResult = await this.client
          .schema('integration' as any)
          .from('ad_referrals')
          .insert(payload)
          .select()
          .single();
      }

      if (insertResult.data) {
        record.id = insertResult.data.id;
        record.createdAt = insertResult.data.created_at;
      }
    } catch (err) {
      logger.debug(
        { err, phoneNumber: cleanPhone },
        'Could not persist ad referral to database, using cache',
      );
    }

    return record;
  }

  public async getAdReferrals(phoneNumber?: string, adId?: string): Promise<AdReferralRecord[]> {
    const clean = phoneNumber ? phoneNumber.replace(/\D/g, '') : undefined;

    // Filter from local cache
    const cachedMatches = this.adReferralsCache.filter((r) => {
      if (clean && r.phoneNumber !== clean) return false;
      if (adId && r.adId !== adId && r.sourceId !== adId) return false;
      return true;
    });

    try {
      let query = this.client
        .from('ad_referrals')
        .select('*')
        .order('created_at', { ascending: false });

      if (clean) query = query.eq('phone_number', clean);
      if (adId) query = query.or(`ad_id.eq.${adId},source_id.eq.${adId}`);

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const dbRecords: AdReferralRecord[] = data.map((r: any) => ({
          id: r.id,
          phoneNumber: r.phone_number,
          sourceId: r.source_id,
          adId: r.ad_id,
          headline: r.headline,
          body: r.body,
          sourceType: r.source_type,
          sourceUrl: r.source_url,
          mediaType: r.media_type,
          imageUrl: r.image_url,
          videoUrl: r.video_url,
          ctwaClid: r.ctwa_clid,
          customerId: r.customer_id,
          rawReferral: r.raw_referral,
          createdAt: r.created_at,
        }));

        // Merge DB records and cached records uniquely by id
        const combined: AdReferralRecord[] = [...dbRecords];
        for (const c of cachedMatches) {
          if (!combined.some((item) => item.id === c.id)) {
            combined.push(c);
          }
        }
        return combined;
      }
    } catch (err) {
      logger.debug({ err }, 'Database query for ad_referrals failed, returning cached');
    }

    return cachedMatches;
  }

  public async calculateROAS(adId: string, adSpend = 0): Promise<ROASReport> {
    const referrals = await this.getAdReferrals(undefined, adId === 'all' ? undefined : adId);
    const uniquePhones = Array.from(new Set(referrals.map((r) => r.phoneNumber).filter(Boolean)));
    const leadsCount = uniquePhones.length;

    if (leadsCount === 0) {
      return {
        adId,
        leadsCount: 0,
        ordersCount: 0,
        totalRevenue: 0,
        adSpend,
        roas: 0,
        conversionRate: 0,
      };
    }

    // Query orders that match the leads by phone or attribution
    let ordersCount = 0;
    let totalRevenue = 0;

    try {
      const phoneFilter = uniquePhones
        .map((p) => {
          const p10 = p.length > 10 && p.startsWith('91') ? p.slice(2) : p;
          return `shipping_phone.eq.${p},shipping_phone.eq.${p10}`;
        })
        .join(',');

      // Fetch orders from external ecommerce database, falling back to local client
      let orders: Array<Record<string, unknown>> | null = null;
      let ordersError: { message: string } | null = null;

      try {
        const ecomClient = createEcommerceSupabaseClient();
        const res = await ecomClient
          .from('orders')
          .select('id, total_amount, status, payment_status, shipping_phone, attribution_metadata')
          .or(phoneFilter);
        orders = res.data;
        ordersError = res.error;
      } catch {
        // Fallback
      }

      if (!orders || ordersError) {
        const res = await this.client
          .from('orders')
          .select('id, total_amount, status, payment_status, shipping_phone, attribution_metadata')
          .or(phoneFilter);
        orders = res.data;
        ordersError = res.error;
      }

      if (!ordersError && orders) {
        const validOrders = orders.filter(
          (o: any) => o.status !== 'CANCELLED' && o.payment_status !== 'FAILED',
        );
        ordersCount = validOrders.length;
        totalRevenue = validOrders.reduce(
          (sum: number, o: any) => sum + Number(o.total_amount || 0),
          0,
        );
      }
    } catch {
      // Offline fallback
    }

    const roas =
      adSpend > 0 ? Number((totalRevenue / adSpend).toFixed(2)) : totalRevenue > 0 ? Infinity : 0;
    const conversionRate =
      leadsCount > 0 ? Number(((ordersCount / leadsCount) * 100).toFixed(2)) : 0;

    return {
      adId,
      leadsCount,
      ordersCount,
      totalRevenue,
      adSpend,
      roas,
      conversionRate,
    };
  }

  // ---------------------------------------------------------------------------
  // 9. DYNAMIC PROMO CODES
  // ---------------------------------------------------------------------------
  public async createPromoCode(params: {
    code: string;
    type?: 'percent' | 'flat' | 'free_delivery';
    value?: number;
    minSubtotal?: number;
    maxDiscount?: number;
    expiresAt?: string;
    usageLimit?: number;
  }): Promise<PromoCodeRecord> {
    const cleanCode = params.code.trim().toUpperCase();
    const now = new Date().toISOString();

    const record: PromoCodeRecord = {
      id: `promo_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      code: cleanCode,
      type: params.type || 'percent',
      value: params.value ?? 10,
      minSubtotal: params.minSubtotal,
      maxDiscount: params.maxDiscount,
      expiresAt: params.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      usageLimit: params.usageLimit ?? 1,
      used: 0,
      createdAt: now,
    };

    // Store in-memory cache
    this.promoCodesCache.set(cleanCode, record);

    const payload = {
      code: cleanCode,
      type: record.type,
      value: record.value,
      min_subtotal: record.minSubtotal || null,
      max_discount: record.maxDiscount || null,
      expires_at: record.expiresAt,
      usage_limit: record.usageLimit,
      used: 0,
      created_at: now,
    };

    try {
      const { data, error } = await this.client
        .from('promo_codes')
        .upsert(payload, { onConflict: 'code' })
        .select()
        .single();

      if (!error && data) {
        record.id = data.id;
        record.createdAt = data.created_at;
      }
    } catch (err) {
      logger.debug(
        { err, code: cleanCode },
        'Could not persist promo code to database, using cache',
      );
    }

    return record;
  }

  public async getPromoCode(code: string): Promise<PromoCodeRecord | null> {
    const cleanCode = code.trim().toUpperCase();

    try {
      const { data, error } = await this.client
        .from('promo_codes')
        .select('*')
        .eq('code', cleanCode)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          code: data.code,
          type: data.type,
          value: Number(data.value),
          minSubtotal: data.min_subtotal ? Number(data.min_subtotal) : undefined,
          maxDiscount: data.max_discount ? Number(data.max_discount) : undefined,
          expiresAt: data.expires_at,
          usageLimit: data.usage_limit,
          used: data.used || 0,
          createdAt: data.created_at,
        };
      }
    } catch {
      // Fallback to cache below
    }

    return this.promoCodesCache.get(cleanCode) || null;
  }

  // ---------------------------------------------------------------------------
  // 10. CUSTOMER CSAT & REVIEWS
  // ---------------------------------------------------------------------------
  public async recordCustomerReview(params: {
    customerPhone: string;
    customerName?: string;
    orderNumber?: string;
    rating: number;
    comment?: string;
    status?: 'submitted' | 'escalated' | 'resolved';
  }): Promise<CustomerReviewRecord> {
    const cleanPhone = params.customerPhone.replace(/\D/g, '');
    const now = new Date().toISOString();
    const clampedRating = Math.max(1, Math.min(5, Math.round(params.rating)));

    const record: CustomerReviewRecord = {
      id: `rev_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      platform: 'whatsapp',
      customerPhone: cleanPhone,
      customerName: params.customerName || 'Customer',
      orderNumber: params.orderNumber,
      rating: clampedRating,
      comment: params.comment,
      status: params.status || (clampedRating < 4 ? 'escalated' : 'submitted'),
      createdAt: now,
    };

    this.customerReviewsCache.unshift(record);

    try {
      const { data, error } = await this.client
        .from('reviews')
        .insert({
          product_id: 'general',
          customer_name: record.customerName,
          rating: record.rating,
          comment: record.comment || `WhatsApp Rating: ${record.rating} Stars`,
          is_verified: true,
          created_at: now,
        })
        .select()
        .single();

      if (!error && data) {
        record.id = data.id;
      }
    } catch (err) {
      logger.debug({ err, cleanPhone }, 'Could not persist review to DB, using cache');
    }

    return record;
  }

  public async getCustomerReviews(customerPhone?: string): Promise<CustomerReviewRecord[]> {
    if (customerPhone) {
      const cleanPhone = customerPhone.replace(/\D/g, '');
      return this.customerReviewsCache.filter((r) => r.customerPhone === cleanPhone);
    }
    return [...this.customerReviewsCache];
  }

  public async upsertPlatformReview(params: {
    id?: string;
    externalReviewId?: string;
    platform: ReviewPlatform;
    rating: number;
    customerName?: string;
    customerPhone?: string;
    orderNumber?: string;
    title?: string;
    comment?: string;
    status?: 'submitted' | 'escalated' | 'resolved' | 'published';
    verified?: boolean;
    createdAt?: string;
  }): Promise<CustomerReviewRecord> {
    const cleanPhone = params.customerPhone ? params.customerPhone.replace(/\D/g, '') : undefined;
    const now = new Date().toISOString();
    const clampedRating = Math.max(1, Math.min(5, Math.round(params.rating)));

    const existingIndex = this.customerReviewsCache.findIndex((r) => {
      if (params.id && r.id === params.id) return true;
      if (params.externalReviewId && r.externalReviewId === params.externalReviewId) return true;
      return false;
    });

    if (existingIndex >= 0) {
      const existing = this.customerReviewsCache[existingIndex]!;
      existing.rating = clampedRating;
      if (params.comment !== undefined) existing.comment = params.comment;
      if (params.title !== undefined) existing.title = params.title;
      if (params.customerName !== undefined) existing.customerName = params.customerName;
      if (params.status !== undefined) existing.status = params.status;
      existing.updatedAt = now;
      return existing;
    }

    const record: CustomerReviewRecord = {
      id: params.id || `rev_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      platform: params.platform,
      externalReviewId: params.externalReviewId,
      customerPhone: cleanPhone,
      customerName: params.customerName || 'Customer',
      orderNumber: params.orderNumber,
      rating: clampedRating,
      title: params.title,
      comment: params.comment,
      status: params.status || 'published',
      verified: params.verified ?? true,
      createdAt: params.createdAt || now,
    };

    this.customerReviewsCache.unshift(record);

    try {
      await this.client.from('reviews').insert({
        product_id: 'general',
        customer_name: record.customerName,
        rating: record.rating,
        title: record.title || null,
        comment: record.comment || `${params.platform} Review: ${record.rating} Stars`,
        is_verified: record.verified,
        created_at: record.createdAt,
      });
    } catch (err) {
      logger.debug({ err }, 'Could not persist external review to DB, using cache');
    }

    return record;
  }

  public async batchSyncReviews(
    reviews: Array<{
      id?: string;
      externalReviewId?: string;
      platform: ReviewPlatform;
      rating: number;
      customerName?: string;
      customerPhone?: string;
      orderNumber?: string;
      title?: string;
      comment?: string;
      status?: 'submitted' | 'escalated' | 'resolved' | 'published';
      verified?: boolean;
      createdAt?: string;
    }>,
  ): Promise<{ synced: number; reviews: CustomerReviewRecord[] }> {
    const results: CustomerReviewRecord[] = [];
    for (const item of reviews) {
      const synced = await this.upsertPlatformReview(item);
      results.push(synced);
    }
    return { synced: results.length, reviews: results };
  }

  public async syncWebsiteReviews(
    websiteReviews: Array<{
      id: string;
      productId?: string;
      customerName: string;
      rating: number;
      title?: string;
      comment: string;
      isVerified?: boolean;
      createdAt?: string;
    }>,
  ): Promise<{ synced: number; reviews: CustomerReviewRecord[] }> {
    const formatted = websiteReviews.map((r) => ({
      id: r.id,
      externalReviewId: `web_${r.id}`,
      platform: 'website' as const,
      customerName: r.customerName,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      verified: r.isVerified ?? true,
      status: r.rating < 4 ? ('escalated' as const) : ('published' as const),
      createdAt: r.createdAt,
    }));
    return await this.batchSyncReviews(formatted);
  }

  public async updateReviewRating(
    reviewId: string,
    newRating: number,
    comment?: string,
  ): Promise<CustomerReviewRecord | null> {
    const clampedRating = Math.max(1, Math.min(5, Math.round(newRating)));
    const now = new Date().toISOString();

    const existing = this.customerReviewsCache.find(
      (r) => r.id === reviewId || r.externalReviewId === reviewId,
    );

    if (existing) {
      existing.rating = clampedRating;
      if (comment !== undefined) existing.comment = comment;
      existing.updatedAt = now;
      if (clampedRating < 4) existing.status = 'escalated';
    }

    try {
      await this.client
        .from('reviews')
        .update({
          rating: clampedRating,
          ...(comment !== undefined ? { comment } : {}),
        })
        .eq('id', reviewId);
    } catch (err) {
      logger.debug({ err, reviewId }, 'Could not update review in DB, cache updated');
    }

    return existing || null;
  }

  public async getUnifiedReviewSummary(): Promise<UnifiedReviewSummary> {
    const reviews = await this.getCustomerReviews();

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    const platformBreakdown: Record<
      string,
      { count: number; totalScore: number; averageRating: number }
    > = {};

    let totalScore = 0;
    for (const r of reviews) {
      const rating = Math.max(1, Math.min(5, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
      distribution[rating]++;
      totalScore += rating;

      const p = r.platform || 'whatsapp';
      if (!platformBreakdown[p]) {
        platformBreakdown[p] = { count: 0, totalScore: 0, averageRating: 0 };
      }
      platformBreakdown[p]!.count++;
      platformBreakdown[p]!.totalScore += rating;
    }

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 ? Number((totalScore / totalReviews).toFixed(1)) : 5.0;

    const formattedBreakdown: Record<string, { count: number; averageRating: number }> = {};
    for (const [p, stats] of Object.entries(platformBreakdown)) {
      formattedBreakdown[p] = {
        count: stats.count,
        averageRating: stats.count > 0 ? Number((stats.totalScore / stats.count).toFixed(1)) : 5.0,
      };
    }

    return {
      averageRating,
      totalReviews,
      platformBreakdown: formattedBreakdown,
      ratingDistribution: distribution,
    };
  }

  // ---------------------------------------------------------------------------
  // 11. NDR (NON-DELIVERY REPORT) INSTRUCTIONS
  // ---------------------------------------------------------------------------
  public async recordNdrInstruction(params: {
    customerPhone: string;
    orderNumber?: string;
    instructions: string;
    courier?: string;
    status?: 'submitted' | 'forwarded_to_courier' | 'resolved';
  }): Promise<NdrInstructionRecord> {
    const cleanPhone = params.customerPhone.replace(/\D/g, '');
    const now = new Date().toISOString();

    const record: NdrInstructionRecord = {
      id: `ndr_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      customerPhone: cleanPhone,
      orderNumber: params.orderNumber,
      instructions: params.instructions.trim(),
      courier: params.courier || 'courier',
      status: params.status || 'submitted',
      createdAt: now,
    };

    this.ndrInstructionsCache.unshift(record);

    try {
      const { data, error } = await this.client
        .from('ndr_instructions')
        .insert({
          phone_number: cleanPhone,
          order_number: record.orderNumber || null,
          instructions: record.instructions,
          courier: record.courier,
          status: record.status,
          created_at: now,
        })
        .select()
        .single();

      if (!error && data) {
        record.id = data.id;
      }
    } catch (err) {
      logger.debug({ err, cleanPhone }, 'Could not persist NDR instruction to DB, using cache');
    }

    return record;
  }

  public async getNdrInstructions(customerPhone?: string): Promise<NdrInstructionRecord[]> {
    if (customerPhone) {
      const cleanPhone = customerPhone.replace(/\D/g, '');
      return this.ndrInstructionsCache.filter((n) => n.customerPhone === cleanPhone);
    }
    return [...this.ndrInstructionsCache];
  }

  public async getLatestNdrInstruction(
    customerPhone: string,
  ): Promise<NdrInstructionRecord | null> {
    const list = await this.getNdrInstructions(customerPhone);
    return list[0] || null;
  }

  // ---------------------------------------------------------------------------
  // WEBHOOK IDEMPOTENCY GUARD
  // ---------------------------------------------------------------------------
  private processedEventsCache = new Map<string, number>();

  public async isWebhookProcessed(eventId: string, provider = 'whatsapp'): Promise<boolean> {
    if (!eventId) return false;
    const cacheKey = `${provider}:${eventId}`;
    const now = Date.now();
    const cachedTime = this.processedEventsCache.get(cacheKey);

    // 15-minute in-memory LRU window
    if (cachedTime && now - cachedTime < 15 * 60 * 1000) {
      return true;
    }

    try {
      const { data, error } = await this.client
        .from('processed_webhooks')
        .select('event_id')
        .eq('event_id', eventId)
        .maybeSingle();

      if (!error && data?.event_id) {
        this.processedEventsCache.set(cacheKey, now);
        return true;
      }
    } catch (err) {
      logger.debug({ err, eventId }, 'Error checking processed_webhooks table');
    }

    return false;
  }

  public async recordProcessedWebhook(
    eventId: string,
    provider = 'whatsapp',
    eventType = 'message',
  ): Promise<void> {
    if (!eventId) return;
    const cacheKey = `${provider}:${eventId}`;
    this.processedEventsCache.set(cacheKey, Date.now());

    // Clean up cache if too large
    if (this.processedEventsCache.size > 5000) {
      const cutoff = Date.now() - 15 * 60 * 1000;
      for (const [k, timestamp] of this.processedEventsCache.entries()) {
        if (timestamp < cutoff) {
          this.processedEventsCache.delete(k);
        }
      }
    }

    try {
      await this.client.from('processed_webhooks').upsert(
        {
          event_id: eventId,
          provider,
          event_type: eventType,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'event_id' },
      );
    } catch (err) {
      logger.debug({ err, eventId }, 'Non-fatal error recording processed webhook in DB');
    }
  }

  // ---------------------------------------------------------------------------
  // 14. COMPANY SETTINGS (SUPABASE STORAGE & CHATGPT ACTIONS)
  // ---------------------------------------------------------------------------
  public async getCompanySettings(): Promise<CompanySettingsRecord | null> {
    try {
      const { data, error } = await this.client
        .from('company_settings')
        .select('*')
        .eq('id', 'current')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        logger.debug({ error }, 'Non-fatal querying company_settings table');
      }

      if (data && data.profile) {
        const parsed = businessProfileSchema.safeParse(data.profile);
        if (parsed.success) {
          this.companySettingsCache = {
            id: data.id || 'current',
            profile: parsed.data,
            customMarkdown: data.custom_markdown || undefined,
            version: data.version || 1,
            updatedAt: data.updated_at || new Date().toISOString(),
            updatedBy: data.updated_by || 'supabase',
          };
          updateCachedBusinessKnowledge(parsed.data, data.custom_markdown);
          return this.companySettingsCache;
        }
      }
    } catch (err) {
      logger.debug({ err }, 'Non-fatal error fetching company_settings from Supabase');
    }

    return this.companySettingsCache;
  }

  public async saveCompanySettings(
    profile: BusinessProfile,
    customMarkdown?: string,
    updatedBy = 'system',
  ): Promise<{ success: boolean; version: number }> {
    const nextVersion = (this.companySettingsCache?.version || 0) + 1;
    const now = new Date().toISOString();
    const effectiveMarkdown =
      customMarkdown !== undefined
        ? customMarkdown
        : this.companySettingsCache?.customMarkdown || undefined;

    this.companySettingsCache = {
      id: 'current',
      profile,
      customMarkdown: effectiveMarkdown,
      version: nextVersion,
      updatedAt: now,
      updatedBy,
    };

    // Hot-reload in-memory config cache & sync to disk for persistence
    try {
      saveBusinessProfileToDisk(profile, effectiveMarkdown);
    } catch (diskErr) {
      logger.warn({ diskErr }, 'Non-fatal error persisting business profile to disk');
    }

    try {
      await this.client.from('company_settings').upsert({
        id: 'current',
        profile,
        custom_markdown: effectiveMarkdown || null,
        version: nextVersion,
        updated_at: now,
        updated_by: updatedBy,
      });
    } catch (dbErr) {
      logger.warn({ dbErr }, 'Non-fatal error upserting company_settings into Supabase');
    }

    return { success: true, version: nextVersion };
  }

  // ---------------------------------------------------------------------------
  // 15. CUSTOMER ENGAGEMENT ANALYTICS & GUARDRAILS
  // ---------------------------------------------------------------------------
  public async getCustomerMessageStats(phoneNumber: string): Promise<CustomerEngagementStats> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayIso = startOfToday.toISOString();

    try {
      const { data, error } = await this.client
        .from('support_messages')
        .select('role, created_at')
        .eq('phone_number', cleanPhone)
        .order('created_at', { ascending: true });

      if (error) {
        logger.debug({ error, phoneNumber: cleanPhone }, 'Failed fetching message stats from DB');
      }

      const rows = data || [];
      const totalInbound = rows.filter((r) => r.role === 'customer').length;
      const totalOutbound = rows.filter(
        (r) => r.role === 'assistant' || r.role === 'human_agent',
      ).length;
      const messagesToday = rows.filter((r) => r.created_at >= startOfTodayIso).length;
      const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const lastMessageAt = lastRow ? lastRow.created_at : null;

      return {
        phoneNumber: cleanPhone,
        totalInbound,
        totalOutbound,
        totalMessages: rows.length,
        messagesToday,
        lastMessageAt,
      };
    } catch {
      return {
        phoneNumber: cleanPhone,
        totalInbound: 0,
        totalOutbound: 0,
        totalMessages: 0,
        messagesToday: 0,
        lastMessageAt: null,
      };
    }
  }

  public async checkCustomerDailyLimit(
    phoneNumber: string,
    limit = 25,
  ): Promise<{ allowed: boolean; countToday: number; limit: number }> {
    const stats = await this.getCustomerMessageStats(phoneNumber);
    return {
      allowed: stats.messagesToday < limit,
      countToday: stats.messagesToday,
      limit,
    };
  }

  public async getOwnerCustomerMetrics(limit = 50): Promise<OwnerCustomerMetric[]> {
    try {
      const { data: convs, error } = await this.client
        .from('support_conversations')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error || !convs) return [];

      const metrics: OwnerCustomerMetric[] = [];
      for (const conv of convs) {
        const stats = await this.getCustomerMessageStats(conv.phone_number);
        let ordersCount = 0;
        let totalSpend = 0;

        try {
          const cleanPhone = conv.phone_number.replace(/\D/g, '');
          let customerRow: Record<string, unknown> | null = null;

          try {
            const ecomClient = createEcommerceSupabaseClient();
            const res = await ecomClient
              .from('customers')
              .select('total_orders, total_spend')
              .eq('phone', cleanPhone)
              .maybeSingle();
            customerRow = res.data;
          } catch {
            // Fallback
          }

          if (!customerRow) {
            const res = await this.client
              .from('customers')
              .select('total_orders, total_spend')
              .eq('phone', cleanPhone)
              .maybeSingle();
            customerRow = res.data;
          }

          if (customerRow) {
            ordersCount = Number(customerRow.total_orders) || 0;
            totalSpend = Number(customerRow.total_spend) || 0;
          }
        } catch {
          // Non-fatal
        }

        metrics.push({
          phoneNumber: conv.phone_number,
          customerName: conv.customer_name || 'Customer',
          totalMessages: stats.totalMessages,
          messagesToday: stats.messagesToday,
          lastActiveAt: stats.lastMessageAt || conv.updated_at,
          status: conv.status,
          ordersCount,
          totalSpend,
        });
      }
      return metrics;
    } catch {
      return [];
    }
  }

  public async getOwnerCartMetrics(limit = 50): Promise<OwnerCartMetric[]> {
    try {
      const { data, error } = await this.client
        .from('abandoned_cart_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) return [];

      return data.map((d: any) => ({
        id: d.id,
        customerId: d.customer_id,
        email: d.email,
        phone: d.phone,
        cartItemsSummary:
          typeof d.cart_data === 'object' ? JSON.stringify(d.cart_data) : String(d.cart_data || ''),
        cartValue: Number(d.cart_value) || 0,
        status: d.status || 'abandoned',
        createdAt: d.created_at,
      }));
    } catch {
      return [];
    }
  }

  public async getEngagementSummary(): Promise<EngagementSummary> {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [
        { count: totalConversations },
        { count: activeConversations },
        { count: escalatedConversations },
        { count: openTickets },
        { count: abandonedCartsTotal },
        { count: totalMessagesToday },
      ] = await Promise.all([
        this.client.from('support_conversations').select('*', { count: 'exact', head: true }),
        this.client
          .from('support_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active'),
        this.client
          .from('support_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'escalated'),
        this.client
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open'),
        this.client
          .from('abandoned_cart_logs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        this.client
          .from('support_messages')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startOfToday.toISOString()),
      ]);

      return {
        totalConversations: totalConversations || 0,
        activeConversations: activeConversations || 0,
        escalatedConversations: escalatedConversations || 0,
        totalMessagesToday: totalMessagesToday || 0,
        openTickets: openTickets || 0,
        abandonedCartsTotal: abandonedCartsTotal || 0,
      };
    } catch {
      return {
        totalConversations: 0,
        activeConversations: 0,
        escalatedConversations: 0,
        totalMessagesToday: 0,
        openTickets: 0,
        abandonedCartsTotal: 0,
      };
    }
  }
}

let platformRepoInstance: PlatformRepository | null = null;
export function getPlatformRepository(customClient?: SupabaseClient): PlatformRepository {
  if (customClient) {
    return new PlatformRepository(customClient);
  }
  if (!platformRepoInstance) {
    platformRepoInstance = new PlatformRepository();
  }
  return platformRepoInstance;
}

export function resetPlatformRepository(): void {
  platformRepoInstance = null;
}
