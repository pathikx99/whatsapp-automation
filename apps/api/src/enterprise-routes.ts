import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  getEnterpriseRepository,
  getPlatformRepository,
} from '@whatsapp-platform/database';
import {
  getAiOrchestrator,
  AgentFactory,
  getToolRegistry,
  AgentRoleType,
} from '@whatsapp-platform/ai';
import { createEcommerceAdapter } from '@whatsapp-platform/ecommerce-adapter';
import { createWhatsAppProvider } from '@whatsapp-platform/whatsapp';
import { createLogger } from '@whatsapp-platform/shared';
import { resolveTenantContext } from './tenant-context.js';

export function registerEnterpriseRoutes(
  app: FastifyInstance,
  options: { requireAdminAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void> },
): void {
  const logger = createLogger({ name: 'enterprise-routes' });
  logger.info('Registering Mintara AI Enterprise OS routes');
  const { requireAdminAuth } = options;
  const enterpriseRepo = getEnterpriseRepository();
  const platformRepo = getPlatformRepository();
  const orchestrator = getAiOrchestrator();
  const toolRegistry = getToolRegistry();
  const ecommerceAdapter = createEcommerceAdapter();
  const whatsappProvider = createWhatsAppProvider();

  // ===========================================================================
  // 0. ENTERPRISE TELEMETRY & SYSTEM HEALTH
  // ===========================================================================
  app.get('/api/enterprise/status', { preHandler: requireAdminAuth }, async (_req, reply) => {
    return reply.status(200).send({
      status: 'operational',
      agentsCount: 15,
      toolsCount: 21,
      guardrails: {
        ecommerceReadOnly: true,
        shiprocketStrictLinks: true,
      },
    });
  });

  // ===========================================================================
  // 1. AI ORCHESTRATOR & 15 SPECIALIZED AGENTS
  // ===========================================================================
  app.get('/api/ai/agents', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const agents = AgentFactory.getAllAgents().map((a) => ({
      role: a.role,
      displayName: a.displayName,
      description: a.description,
      permittedTools: Array.from(a.permittedTools),
    }));
    return reply.status(200).send({ agents, count: agents.length });
  });

  app.get('/api/ai/tools', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const tools = toolRegistry.getDeclarations();
    return reply.status(200).send({ tools, count: tools.length });
  });

  app.post('/api/ai/orchestrate', { preHandler: requireAdminAuth }, async (req, reply) => {
    // 1. Mandatory Identity & Authentication
    if (!req.tenantContext) {
      await resolveTenantContext(req, reply);
      if (reply.sent) return;
    }

    const tenantCtx = req.tenantContext;
    if (!tenantCtx) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const body = req.body as {
      agentRole: AgentRoleType;
      prompt: string;
      conversationHistory?: any[];
      context?: Record<string, unknown>;
    };

    if (!body.agentRole || !body.prompt) {
      return reply.status(400).send({ error: 'agentRole and prompt are required fields.' });
    }

    // 2. Validate Agent Role Privilege Boundary
    // Platform owner assistant requires verified platform owner role
    if (body.agentRole === 'platform_owner_assistant') {
      if (!tenantCtx.isPlatformAdmin || tenantCtx.platformRole !== 'platform_owner') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: "Agent role 'platform_owner_assistant' requires platform owner privileges.",
        });
      }
    }

    // Executive business assistant roles require business_owner or business_admin or platform admin
    const executiveRoles: AgentRoleType[] = ['owner_assistant', 'finance_bi_agent'];
    if (executiveRoles.includes(body.agentRole)) {
      const isOwnerOrAdmin =
        tenantCtx.isPlatformAdmin ||
        tenantCtx.businessRole === 'business_owner' ||
        tenantCtx.businessRole === 'business_admin';

      if (!isOwnerOrAdmin) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'InsufficientTenantRole',
          message: `Agent role '${body.agentRole}' requires business_owner or business_admin privileges.`,
        });
      }
    }

    // 3. Prevent Cross-Tenant Injection
    const requestedTenantId = body.context?.tenantId as string | undefined;
    if (requestedTenantId && requestedTenantId !== tenantCtx.tenantId) {
      if (!tenantCtx.isPlatformAdmin) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'CrossTenantAccessDenied',
          message: `User is not authorized to orchestrate AI agent for tenant '${requestedTenantId}'.`,
        });
      }
    }

    // 4. Force server-side verified context parameters
    const safeContext = {
      ...(body.context || {}),
      tenantId: requestedTenantId && tenantCtx.isPlatformAdmin ? requestedTenantId : tenantCtx.tenantId,
      initiatingUser: tenantCtx.userId,
      userEmail: tenantCtx.userEmail,
      isPlatformActor: tenantCtx.isPlatformAdmin,
    };

    try {
      const result = await orchestrator.execute({
        agentRole: body.agentRole,
        prompt: body.prompt,
        conversationHistory: body.conversationHistory,
        context: safeContext,
      });
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: 'AI Orchestration failed', message: errMsg });
    }
  });

  app.post('/api/ai/assistant/chat', { preHandler: requireAdminAuth }, async (req, reply) => {
    if (!req.tenantContext) {
      await resolveTenantContext(req, reply);
      if (reply.sent) return;
    }

    const tenantCtx = req.tenantContext;
    if (!tenantCtx) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const body = req.body as {
      prompt: string;
      mode?: 'text' | 'voice';
      conversationHistory?: any[];
    };

    if (!body.prompt) {
      return reply.status(400).send({ error: 'prompt is required.' });
    }

    try {
      const result = await orchestrator.execute({
        agentRole: 'owner_assistant',
        prompt: body.prompt,
        conversationHistory: body.conversationHistory,
        context: {
          tenantId: tenantCtx.tenantId,
          userName: tenantCtx.userEmail,
          initiatingUser: tenantCtx.userId,
          isPlatformActor: tenantCtx.isPlatformAdmin,
        },
      });

      return reply.status(200).send({
        reply: result.content,
        mode: body.mode || 'text',
        toolExecutions: result.toolExecutions,
        requiresApproval: result.requiresApproval,
        approvalRequestId: result.approvalRequestId,
        usage: result.usage,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: 'Owner Assistant request failed', message: errMsg });
    }
  });

  // ===========================================================================
  // 2. CUSTOMER INTELLIGENCE & SEGMENTS
  // ===========================================================================
  app.get('/api/segments', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const segments = await enterpriseRepo.listCustomerSegments();
    return reply.status(200).send({ segments, count: segments.length });
  });

  app.post('/api/segments/recalculate', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const rfm = await ecommerceAdapter.getRFMSegments();
    const segments = await enterpriseRepo.listCustomerSegments();

    for (const seg of segments) {
      if (seg.slug === 'repeat-customers') {
        await enterpriseRepo.updateSegmentMemberCount(seg.id, rfm.counts.loyal);
      } else if (seg.slug === 'high-value-vip') {
        await enterpriseRepo.updateSegmentMemberCount(seg.id, rfm.counts.champions);
      } else if (seg.slug === 'inactive-winback') {
        await enterpriseRepo.updateSegmentMemberCount(seg.id, rfm.counts.dormant);
      } else if (seg.slug === 'first-time-buyers') {
        await enterpriseRepo.updateSegmentMemberCount(seg.id, rfm.counts.oneTimeRecent);
      }
    }

    const updated = await enterpriseRepo.listCustomerSegments();
    return reply.status(200).send({ message: 'Customer segments recalculated successfully', segments: updated });
  });

  // ===========================================================================
  // 3. MARKETING AUTOMATIONS (10 Workflows)
  // ===========================================================================
  app.get('/api/campaigns', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const campaigns = await enterpriseRepo.listCampaignDefinitions();
    return reply.status(200).send({ campaigns, count: campaigns.length });
  });

  app.get('/api/campaigns/:id', { preHandler: requireAdminAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const campaign = await enterpriseRepo.getCampaignDefinition(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Campaign not found' });
    }
    const executions = await enterpriseRepo.listCampaignExecutions(id);
    return reply.status(200).send({ campaign, executions });
  });

  app.patch('/api/campaigns/:id', { preHandler: requireAdminAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { isEnabled?: boolean };
    if (typeof body.isEnabled !== 'boolean') {
      return reply.status(400).send({ error: 'isEnabled boolean is required.' });
    }
    const updated = await enterpriseRepo.updateCampaignStatus(id, body.isEnabled);
    return reply.status(200).send({ campaign: updated });
  });

  app.post('/api/campaigns/:id/execute', { preHandler: requireAdminAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const campaign = await enterpriseRepo.getCampaignDefinition(id);
    if (!campaign) {
      return reply.status(404).send({ error: 'Campaign not found' });
    }
    if (!campaign.isEnabled) {
      return reply.status(400).send({ error: 'Cannot execute disabled campaign. Enable it first.' });
    }

    const candidates = await ecommerceAdapter.getMarketingCandidates();
    const execution = await enterpriseRepo.createCampaignExecution({
      campaignId: id,
      totalTarget: candidates.length,
    });

    return reply.status(200).send({ message: 'Campaign execution scheduled', execution });
  });

  // ===========================================================================
  // 4. PERSONALIZED DISCOUNT ENGINE (Dashboard Controlled)
  // ===========================================================================
  app.get('/api/discounts/rules', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const rules = await enterpriseRepo.getPersonalizedDiscountRules();
    return reply.status(200).send({ rules });
  });

  app.put('/api/discounts/rules', { preHandler: requireAdminAuth }, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const updated = await enterpriseRepo.updatePersonalizedDiscountRules(body as any);
    return reply.status(200).send({ rules: updated });
  });

  app.get('/api/discounts/logs', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const logs = await enterpriseRepo.listDiscountLogs();
    return reply.status(200).send({ logs, count: logs.length });
  });

  // ===========================================================================
  // 5. SUPPLIER & PROCUREMENT MANAGEMENT
  // ===========================================================================
  app.get('/api/suppliers', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const suppliers = await enterpriseRepo.listSuppliers();
    return reply.status(200).send({ suppliers, count: suppliers.length });
  });

  app.get('/api/suppliers/:id', { preHandler: requireAdminAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const supplier = await enterpriseRepo.getSupplier(id);
    if (!supplier) {
      return reply.status(404).send({ error: 'Supplier not found' });
    }
    const materials = await enterpriseRepo.listSupplierMaterials(supplier.id);
    const quotations = await enterpriseRepo.listSupplierQuotations(supplier.id);
    const interactions = await enterpriseRepo.listSupplierInteractions(supplier.id);
    const calls = await enterpriseRepo.listSupplierCalls(supplier.id);

    return reply.status(200).send({
      supplier,
      materials,
      quotations,
      interactions,
      calls,
    });
  });

  app.post('/api/suppliers/:id/interactions', { preHandler: requireAdminAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      interactionType: any;
      subject: string;
      summary: string;
      proposedTerms?: Record<string, unknown>;
    };

    const interaction = await enterpriseRepo.recordSupplierInteraction({
      supplierId: id,
      interactionType: body.interactionType || 'whatsapp',
      initiatedBy: 'owner',
      subject: body.subject || 'Follow-up',
      summary: body.summary || '',
      proposedTerms: body.proposedTerms,
    });

    return reply.status(201).send({ interaction });
  });

  app.post('/api/suppliers/calls/initiate', { preHandler: requireAdminAuth }, async (req, reply) => {
    const body = req.body as {
      supplierId: string;
      phoneNumber: string;
      purpose: string;
      language?: string;
    };

    if (!body.supplierId || !body.phoneNumber) {
      return reply.status(400).send({ error: 'supplierId and phoneNumber are required.' });
    }

    const call = await enterpriseRepo.recordSupplierCall({
      tenantId: '00000000-0000-0000-0000-000000000001',
      supplierId: body.supplierId,
      phoneNumber: body.phoneNumber,
      callerIdentity: 'Mintara Bites Manager',
      provider: 'mock',
      callStatus: 'completed',
      durationSeconds: 42,
      recipientLanguage: body.language || 'gu-IN',
      transcript: `[Mintara Bites Manager]: Namaste, calling regarding pricing inquiry for ${body.purpose}.\n[Supplier]: Rates are standard as per our catalog.\n[Mintara Bites Manager]: Recorded tentatively for owner review.`,
      tentativeAgreement: { status: 'pending_owner_review' },
    });

    return reply.status(200).send({
      message: 'Call executed under "Mintara Bites Manager" identity. Tentative outcome recorded.',
      call,
    });
  });

  app.get('/api/suppliers/calls', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const calls = await enterpriseRepo.listSupplierCalls();
    return reply.status(200).send({ calls, count: calls.length });
  });

  // ===========================================================================
  // 6. KNOWLEDGE CENTRE & MEMORY
  // ===========================================================================
  app.get('/api/knowledge/documents', { preHandler: requireAdminAuth }, async (req, reply) => {
    const query = req.query as { category?: string };
    const docs = await enterpriseRepo.listKnowledgeDocuments(query.category);
    return reply.status(200).send({ documents: docs, count: docs.length });
  });

  app.post('/api/knowledge/upload', { preHandler: requireAdminAuth }, async (req, reply) => {
    const body = req.body as {
      title: string;
      originalFilename: string;
      fileType: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'image' | 'json';
      category: any;
      textContent?: string;
    };

    if (!body.title || !body.fileType) {
      return reply.status(400).send({ error: 'title and fileType are required.' });
    }

    const doc = await enterpriseRepo.createKnowledgeDocument({
      tenantId: '00000000-0000-0000-0000-000000000001',
      title: body.title,
      originalFilename: body.originalFilename || `${body.title}.${body.fileType}`,
      fileType: body.fileType,
      fileSizeBytes: body.textContent ? Buffer.byteLength(body.textContent) : 1024,
      category: body.category || 'sop',
      status: 'active',
      version: 1,
      conflictDetected: false,
      isOwnerApproved: true,
      extractedText: body.textContent,
    });

    if (body.textContent) {
      await enterpriseRepo.storeKnowledgeChunks([
        {
          documentId: doc.id,
          chunkIndex: 0,
          chunkText: body.textContent,
          tokenCount: Math.ceil(body.textContent.length / 4),
          metadata: { title: doc.title, category: doc.category },
        },
      ]);
    }

    return reply.status(201).send({ document: doc });
  });

  app.get('/api/knowledge/search', { preHandler: requireAdminAuth }, async (req, reply) => {
    const query = req.query as { q?: string; limit?: string };
    const q = query.q || '';
    const limit = parseInt(query.limit || '5', 10);
    const chunks = await enterpriseRepo.searchKnowledgeChunks(q, limit);
    return reply.status(200).send({ query: q, chunks, count: chunks.length });
  });

  app.get('/api/knowledge/memories', { preHandler: requireAdminAuth }, async (req, reply) => {
    const query = req.query as { type?: any };
    const memories = await enterpriseRepo.listBusinessMemories(query.type);
    return reply.status(200).send({ memories, count: memories.length });
  });

  app.get('/api/knowledge/proposals', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const proposals = await enterpriseRepo.listLearningProposals();
    return reply.status(200).send({ proposals, count: proposals.length });
  });

  // ===========================================================================
  // 7. MANUFACTURING INTELLIGENCE
  // ===========================================================================
  app.get('/api/manufacturing/raw-materials', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const materials = await enterpriseRepo.listRawMaterials();
    return reply.status(200).send({ materials, count: materials.length });
  });

  app.get('/api/manufacturing/recipes', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const recipes = await enterpriseRepo.listRecipes();
    return reply.status(200).send({ recipes, count: recipes.length });
  });

  app.get('/api/manufacturing/batches', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const batches = await enterpriseRepo.listProductionBatches();
    return reply.status(200).send({ batches, count: batches.length });
  });

  app.post('/api/manufacturing/batches', { preHandler: requireAdminAuth }, async (req, reply) => {
    const body = req.body as {
      batchNumber: string;
      recipeId: string;
      quantityProduced: number;
      unit?: string;
      expiryDate?: string;
    };

    if (!body.batchNumber || !body.recipeId) {
      return reply.status(400).send({ error: 'batchNumber and recipeId are required.' });
    }

    const expiry = body.expiryDate || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
    const batch = await enterpriseRepo.createProductionBatch({
      tenantId: '00000000-0000-0000-0000-000000000001',
      batchNumber: body.batchNumber,
      recipeId: body.recipeId,
      quantityProduced: body.quantityProduced || 50,
      unit: body.unit || 'kg',
      yieldPercentage: 100,
      manufacturingDate: new Date().toISOString().split('T')[0]!,
      expiryDate: expiry,
      status: 'released',
      batchCost: 3500,
    });

    return reply.status(201).send({ batch });
  });

  app.get('/api/manufacturing/forecasts', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const forecasts = await enterpriseRepo.listProcurementForecasts();
    return reply.status(200).send({ forecasts, count: forecasts.length });
  });

  // ===========================================================================
  // 8. FINANCIAL INTELLIGENCE & UNIT ECONOMICS
  // ===========================================================================
  app.get('/api/finance/overview', { preHandler: requireAdminAuth }, async (req, reply) => {
    const query = req.query as { date?: string };
    const snapshot = await enterpriseRepo.getFinancialSnapshot(query.date);
    return reply.status(200).send({ snapshot });
  });

  app.get('/api/finance/unit-economics', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const ues = await enterpriseRepo.listUnitEconomics();
    return reply.status(200).send({ unitEconomics: ues, count: ues.length });
  });

  // ===========================================================================
  // 9. LEVEL 3 APPROVALS & CONTROLLED AUTONOMY
  // ===========================================================================
  app.get('/api/approvals', { preHandler: requireAdminAuth }, async (req, reply) => {
    const query = req.query as { status?: any };
    const approvals = await enterpriseRepo.listApprovalRequests(query.status);
    return reply.status(200).send({ approvals, count: approvals.length });
  });

  app.post('/api/approvals/:id/resolve', { preHandler: requireAdminAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { status: 'approved' | 'rejected'; approverName?: string };
    if (!body.status || !['approved', 'rejected'].includes(body.status)) {
      return reply.status(400).send({ error: 'status must be approved or rejected.' });
    }

    const resolved = await enterpriseRepo.resolveApprovalRequest({
      id,
      status: body.status,
      approvedBy: body.approverName || 'Owner',
      executionResult: { resolvedAt: new Date().toISOString(), result: `Action marked ${body.status}` },
    });

    if (!resolved) {
      return reply.status(404).send({ error: 'Approval request not found.' });
    }

    return reply.status(200).send({ approval: resolved });
  });

  // ===========================================================================
  // 10. OPERATIONAL ALERTS & ESCALATIONS
  // ===========================================================================
  app.get('/api/alerts', { preHandler: requireAdminAuth }, async (req, reply) => {
    const query = req.query as { status?: any };
    const alerts = await enterpriseRepo.listOperationalAlerts(query.status);
    return reply.status(200).send({ alerts, count: alerts.length });
  });

  // ===========================================================================
  // 11. ECOMMERCE CHANGE INTELLIGENCE
  // ===========================================================================
  app.get('/api/ecommerce/changes', { preHandler: requireAdminAuth }, async (_req, reply) => {
    const changes = await enterpriseRepo.listEcommerceChanges();
    return reply.status(200).send({ changes, count: changes.length });
  });

  // ===========================================================================
  // 12. HUMAN TAKEOVER REPLY & HANDBACK
  // ===========================================================================
  app.post('/api/enterprise/support/conversations/:id/reply', { preHandler: requireAdminAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { text: string; senderName?: string };

    if (!body.text) {
      return reply.status(400).send({ error: 'Message text is required.' });
    }

    const conv = await platformRepo.getConversationById(id);
    if (!conv) {
      return reply.status(404).send({ error: 'Conversation not found.' });
    }

    // Dispatch message to customer on WhatsApp
    await whatsappProvider.sendMessage({
      type: 'text',
      to: conv.phoneNumber,
      body: body.text,
    });

    // Save human agent message in conversation transcript
    await platformRepo.appendMessage(conv.id, conv.phoneNumber, 'human_agent', body.text);

    // Mute AI / ensure conversation is in escalated status
    await platformRepo.updateConversationStatus(conv.phoneNumber, 'escalated');

    return reply.status(200).send({ success: true, message: 'Reply sent. AI remains paused.' });
  });

  app.post('/api/support/conversations/:id/handback', { preHandler: requireAdminAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const conv = await platformRepo.getConversationById(id);
    if (!conv) {
      return reply.status(404).send({ error: 'Conversation not found.' });
    }

    // Resume AI
    await platformRepo.updateConversationStatus(conv.phoneNumber, 'active');

    return reply.status(200).send({ success: true, message: 'Conversation handed back to AI assistant.' });
  });
}
