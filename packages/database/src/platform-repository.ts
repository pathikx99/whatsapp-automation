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

export class PlatformRepository {
  private client: SupabaseClient;

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
