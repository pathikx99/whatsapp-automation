import { SupabaseClient } from '@supabase/supabase-js';
import { createLocalSupabaseClient } from './local-client.js';
import { createLogger } from '@whatsapp-platform/shared';

const logger = createLogger({ name: 'platform-repository' });

export type ConversationStatus = 'active' | 'escalated' | 'closed';
export type MessageRole = 'customer' | 'assistant' | 'human_agent' | 'system';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';

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
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retries: number;
  maxRetries: number;
  error?: string;
  scheduledFor: string;
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

export type ReviewPlatform =
  | 'website'
  | 'google'
  | 'whatsapp'
  | 'amazon'
  | 'trustpilot'
  | 'other';

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
  platformBreakdown: Record<
    string,
    { count: number; averageRating: number }
  >;
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

  public async resolveTicket(ticketId: string): Promise<PlatformTicket | null> {
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('support_tickets')
      .update({ status: 'resolved', resolved_at: now })
      .eq('id', ticketId)
      .select()
      .single();

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
    status: 'pending' | 'processing' | 'completed' | 'failed',
    errorMsg?: string,
  ): Promise<void> {
    const now = new Date().toISOString();

    const { error } = await this.client
      .from('worker_jobs')
      .update({
        status,
        error: errorMsg || null,
        updated_at: now,
      })
      .eq('id', jobId);

    if (error) {
      logger.error({ error, jobId, status }, 'Failed updating worker_jobs status');
      throw new Error(`Database error updating job status: ${error.message}`);
    }
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
      logger.debug({ err, phoneNumber: cleanPhone }, 'Could not persist ad referral to database, using cache');
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
      let query = this.client.from('ad_referrals').select('*').order('created_at', { ascending: false });

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

      const { data: orders, error: ordersError } = await this.client
        .from('orders')
        .select('id, total_amount, status, payment_status, shipping_phone, attribution_metadata')
        .or(phoneFilter);

      if (!ordersError && orders) {
        const validOrders = orders.filter(
          (o: any) => o.status !== 'CANCELLED' && o.payment_status !== 'FAILED',
        );
        ordersCount = validOrders.length;
        totalRevenue = validOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
      }
    } catch {
      // Offline fallback
    }

    const roas = adSpend > 0 ? Number((totalRevenue / adSpend).toFixed(2)) : totalRevenue > 0 ? Infinity : 0;
    const conversionRate = leadsCount > 0 ? Number(((ordersCount / leadsCount) * 100).toFixed(2)) : 0;

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
      logger.debug({ err, code: cleanCode }, 'Could not persist promo code to database, using cache');
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

  public async getLatestNdrInstruction(customerPhone: string): Promise<NdrInstructionRecord | null> {
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
      await this.client
        .from('processed_webhooks')
        .upsert(
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
