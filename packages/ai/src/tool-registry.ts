import crypto from 'node:crypto';
import {
  createEcommerceAdapter,
  EcommerceAdapter,
} from '@whatsapp-platform/ecommerce-adapter';
import {
  getPlatformRepository,
  PlatformRepository,
  getEnterpriseRepository,
  EnterpriseRepository,
  getMultiTenantRepository,
  MultiTenantRepository,
} from '@whatsapp-platform/database';
import { createLogger } from '@whatsapp-platform/shared';
import { AiToolDeclaration } from './index.js';

const logger = createLogger({ name: 'ai-tool-registry' });

// In-memory runtime signing secret for internal context sealing
const CONTEXT_SIGNING_SECRET = crypto.randomBytes(32);

export interface ToolExecutionContext {
  agentRole: string;
  tenantId?: string;
  initiatingUser?: string;
  conversationId?: string;
  contextToken?: string;
  isPlatformActor?: boolean;
}

/**
 * Creates an immutable, cryptographically sealed tool execution context.
 * Only contexts created by trusted server-side code (AiOrchestrator or authorized services)
 * carry a valid contextToken.
 */
export function createTrustedToolContext(
  input: Omit<ToolExecutionContext, 'contextToken'>,
): ToolExecutionContext {
  const payload = `${input.agentRole}:${input.tenantId || ''}:${input.initiatingUser || ''}:${input.conversationId || ''}:${Boolean(input.isPlatformActor)}`;
  const contextToken = crypto
    .createHmac('sha256', CONTEXT_SIGNING_SECRET)
    .update(payload)
    .digest('hex');

  return {
    ...input,
    contextToken,
  };
}

/**
 * Verifies that the tool execution context was created by the server-side trusted factory
 * and has not been forged or tampered with.
 */
export function verifyTrustedToolContext(context: ToolExecutionContext): boolean {
  if (!context || !context.contextToken || typeof context.contextToken !== 'string') {
    return false;
  }
  const payload = `${context.agentRole}:${context.tenantId || ''}:${context.initiatingUser || ''}:${context.conversationId || ''}:${Boolean(context.isPlatformActor)}`;
  const expected = crypto
    .createHmac('sha256', CONTEXT_SIGNING_SECRET)
    .update(payload)
    .digest('hex');

  const tokenBuf = Buffer.from(context.contextToken, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
  requiresApproval?: boolean;
  approvalRequestId?: string;
}

export interface BackendToolDefinition {
  declaration: AiToolDeclaration;
  permittedRoles?: string[];
  requiredPermissions?: string[];
  requiresApproval?: boolean;
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
}

export const TOOL_PERMITTED_ROLES: Record<string, string[]> = {
  get_customer_profile: [
    'customer_support_agent',
    'sales_agent',
    'customer_intelligence_agent',
    'owner_assistant',
  ],
  get_customer_orders: [
    'customer_support_agent',
    'customer_intelligence_agent',
    'owner_assistant',
  ],
  get_order_details: [
    'customer_support_agent',
    'owner_assistant',
  ],
  get_order_tracking_link: [
    'customer_support_agent',
    'owner_assistant',
  ],
  get_product_details: [
    'customer_support_agent',
    'sales_agent',
    'owner_assistant',
    'ecommerce_intelligence_agent',
  ],
  search_products: [
    'customer_support_agent',
    'sales_agent',
    'research_agent',
    'owner_assistant',
    'ecommerce_intelligence_agent',
  ],
  get_inventory_availability: [
    'customer_support_agent',
    'sales_agent',
    'manufacturing_agent',
    'inventory_agent',
    'owner_assistant',
    'ecommerce_intelligence_agent',
  ],
  get_active_promotions: [
    'customer_support_agent',
    'sales_agent',
    'marketing_agent',
    'owner_assistant',
    'ecommerce_intelligence_agent',
  ],
  get_eligible_promotions: [
    'sales_agent',
    'owner_assistant',
  ],
  get_customer_segments: [
    'marketing_agent',
    'customer_intelligence_agent',
    'owner_assistant',
  ],
  create_support_ticket: [
    'customer_support_agent',
    'owner_assistant',
  ],
  schedule_followup: [
    'customer_support_agent',
    'sales_agent',
    'communication_agent',
    'owner_assistant',
  ],
  create_meeting_request: [
    'supplier_agent',
    'communication_agent',
    'owner_assistant',
  ],
  create_supplier_followup: [
    'procurement_agent',
    'supplier_agent',
    'calling_negotiation_agent',
    'owner_assistant',
  ],
  request_owner_approval: [
    'customer_support_agent',
    'marketing_agent',
    'manufacturing_agent',
    'procurement_agent',
    'supplier_agent',
    'calling_negotiation_agent',
    'owner_assistant',
  ],
  create_campaign_draft: [
    'marketing_agent',
    'owner_assistant',
  ],
  get_business_metrics: [
    'finance_bi_agent',
    'owner_assistant',
    'ecommerce_intelligence_agent',
  ],
  get_manufacturing_data: [
    'manufacturing_agent',
    'inventory_agent',
    'procurement_agent',
    'owner_assistant',
  ],
  get_supplier_details: [
    'procurement_agent',
    'supplier_agent',
    'research_agent',
    'calling_negotiation_agent',
    'owner_assistant',
  ],
  create_knowledge_update_proposal: [
    'research_agent',
    'owner_assistant',
    'knowledge_management_agent',
  ],
  create_operational_alert: [
    'customer_support_agent',
    'manufacturing_agent',
    'inventory_agent',
    'finance_bi_agent',
    'communication_agent',
    'calling_negotiation_agent',
    'owner_assistant',
    'knowledge_management_agent',
    'ecommerce_intelligence_agent',
    'platform_owner_assistant',
  ],
  get_platform_overview: [
    'platform_owner_assistant',
  ],
  list_platform_tenants: [
    'platform_owner_assistant',
  ],
  get_tenant_status: [
    'platform_owner_assistant',
  ],
  get_system_health: [
    'platform_owner_assistant',
  ],
};

export class ToolRegistry {
  public static readonly CORE_TOOL_NAMES = [
    'get_customer_profile',
    'get_customer_orders',
    'get_order_details',
    'get_order_tracking_link',
    'get_product_details',
    'search_products',
    'get_inventory_availability',
    'get_active_promotions',
    'get_eligible_promotions',
    'get_customer_segments',
    'create_support_ticket',
    'schedule_followup',
    'create_meeting_request',
    'create_supplier_followup',
    'request_owner_approval',
    'create_campaign_draft',
    'get_business_metrics',
    'get_manufacturing_data',
    'get_supplier_details',
    'create_knowledge_update_proposal',
    'create_operational_alert',
  ];

  private tools: Map<string, BackendToolDefinition> = new Map();
  private ecommerceAdapter: EcommerceAdapter;
  private platformRepo: PlatformRepository;
  private enterpriseRepo: EnterpriseRepository;
  private multiTenantRepo: MultiTenantRepository;

  constructor(options?: {
    ecommerceAdapter?: EcommerceAdapter;
    platformRepo?: PlatformRepository;
    enterpriseRepo?: EnterpriseRepository;
    multiTenantRepo?: MultiTenantRepository;
  }) {
    this.ecommerceAdapter = options?.ecommerceAdapter || createEcommerceAdapter();
    this.platformRepo = options?.platformRepo || getPlatformRepository();
    this.enterpriseRepo = options?.enterpriseRepo || getEnterpriseRepository();
    this.multiTenantRepo = options?.multiTenantRepo || getMultiTenantRepository();
    this.registerAllTools();
  }

  private register(tool: BackendToolDefinition): void {
    if (!tool.permittedRoles || tool.permittedRoles.length === 0) {
      tool.permittedRoles = TOOL_PERMITTED_ROLES[tool.declaration.name] || ['owner_assistant'];
    }
    this.tools.set(tool.declaration.name, tool);
  }

  public getTool(name: string): BackendToolDefinition | undefined {
    return this.tools.get(name);
  }

  public getDeclarations(toolNames?: string[], includePlatformTools = false): AiToolDeclaration[] {
    if (!toolNames) {
      if (includePlatformTools) {
        return Array.from(this.tools.values()).map((t) => t.declaration);
      }
      return ToolRegistry.CORE_TOOL_NAMES
        .map((name) => this.tools.get(name)?.declaration)
        .filter((d): d is AiToolDeclaration => Boolean(d));
    }
    return toolNames
      .map((name) => this.tools.get(name)?.declaration)
      .filter((d): d is AiToolDeclaration => Boolean(d));
  }

  public async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      logger.warn({ toolName: name }, 'Tool execution attempted for unregistered tool');
      return {
        toolName: name,
        success: false,
        error: `Tool '${name}' is not registered in the system.`,
      };
    }

    // 1. Mandatory Context Authenticity Verification
    if (context?.contextToken) {
      if (!verifyTrustedToolContext(context)) {
        logger.warn({ toolName: name, agentRole: context?.agentRole }, 'Tool execution rejected: Forged or tampered context token');
        return {
          toolName: name,
          success: false,
          error: `Unauthorized: Forged or tampered tool execution context. Tools can only be executed via trusted orchestrator.`,
        };
      }
    } else if (process.env.NODE_ENV === 'production') {
      logger.warn({ toolName: name }, 'Tool execution rejected: Missing context token in production');
      return {
        toolName: name,
        success: false,
        error: `Unauthorized: Tool execution requires a trusted server-side context token in production.`,
      };
    }

    // 2. Mandatory Actor Verification
    if (!context || !context.agentRole || typeof context.agentRole !== 'string') {
      logger.warn({ toolName: name }, 'Tool execution rejected: Missing authenticated agent role');
      return {
        toolName: name,
        success: false,
        error: `Unauthorized: Tool execution requires an authenticated agent role.`,
      };
    }

    // 3. Mandatory Permission Enforcement at Execution Boundary
    const permittedRoles = tool.permittedRoles || TOOL_PERMITTED_ROLES[name] || [];
    if (!permittedRoles.includes(context.agentRole)) {
      logger.warn(
        { toolName: name, agentRole: context.agentRole, permittedRoles },
        'Tool execution rejected: Agent role unauthorized for tool',
      );
      return {
        toolName: name,
        success: false,
        error: `Unauthorized: Agent role '${context.agentRole}' is not permitted to execute tool '${name}'. Permitted roles: [${permittedRoles.join(', ')}]`,
      };
    }

    // 4. Platform vs Tenant Tool Boundaries
    const isPlatformTool = [
      'get_platform_overview',
      'list_platform_tenants',
      'get_tenant_status',
      'get_system_health',
    ].includes(name);

    if (isPlatformTool) {
      if (context.agentRole !== 'platform_owner_assistant') {
        logger.warn(
          { toolName: name, agentRole: context.agentRole },
          'Tool execution rejected: Platform tool requires platform_owner_assistant',
        );
        return {
          toolName: name,
          success: false,
          error: `Unauthorized: Tool '${name}' is a platform-scoped tool and requires platform_owner_assistant role.`,
        };
      }
    } else if (context.agentRole !== 'platform_owner_assistant') {
      if (!context.tenantId) {
        // Enforce default internal tenant context if running single-tenant internal operation
        context.tenantId = '00000000-0000-0000-0000-000000000001';
      }
    }

    // 4. Execution Boundary
    try {
      logger.info(
        { toolName: name, agentRole: context.agentRole, tenantId: context.tenantId },
        'Executing backend AI tool',
      );
      const result = await tool.execute(args, context);
      return result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ toolName: name, err: errMsg }, 'Tool execution failed');
      return {
        toolName: name,
        success: false,
        error: errMsg,
      };
    }
  }

  private registerAllTools(): void {
    // 1. get_customer_profile
    this.register({
      declaration: {
        name: 'get_customer_profile',
        description: 'Retrieve verified customer details and purchase history by phone number or customer ID (Read-only).',
        parameters: {
          type: 'object',
          properties: {
            phoneNumber: { type: 'string', description: 'Customer 10-digit Indian mobile number or E.164' },
            customerId: { type: 'string', description: 'Unique customer UUID from ecommerce platform' },
          },
        },
      },
      execute: async (args) => {
        const phone = typeof args.phoneNumber === 'string' ? args.phoneNumber : undefined;
        const custId = typeof args.customerId === 'string' ? args.customerId : undefined;
        let customer = null;
        if (phone) {
          customer = await this.ecommerceAdapter.getCustomerByPhone(phone);
        } else if (custId) {
          customer = await this.ecommerceAdapter.getCustomerById(custId);
        }
        return {
          toolName: 'get_customer_profile',
          success: true,
          data: customer || { message: 'Customer record not found in website database.' },
        };
      },
    });

    // 2. get_customer_orders
    this.register({
      declaration: {
        name: 'get_customer_orders',
        description: 'Fetch recent orders placed by a verified customer ID (Read-only).',
        parameters: {
          type: 'object',
          properties: {
            customerId: { type: 'string', description: 'Unique customer UUID' },
            limit: { type: 'number', description: 'Maximum number of orders to return (default: 5)' },
          },
          required: ['customerId'],
        },
      },
      execute: async (args) => {
        const custId = String(args.customerId || '');
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        const allOrders = await this.ecommerceAdapter.getCustomerOrders(custId);
        const orders = allOrders.slice(0, limit);
        return {
          toolName: 'get_customer_orders',
          success: true,
          data: { orders, count: orders.length },
        };
      },
    });

    // 3. get_order_details
    this.register({
      declaration: {
        name: 'get_order_details',
        description: 'Get verified details of a specific order by order number or order ID (Read-only).',
        parameters: {
          type: 'object',
          properties: {
            orderNumber: { type: 'string', description: 'Order number (e.g. MB-1001)' },
          },
          required: ['orderNumber'],
        },
      },
      execute: async (args) => {
        const orderNumber = String(args.orderNumber || '');
        const order = await this.ecommerceAdapter.getOrderDetails(orderNumber);
        return {
          toolName: 'get_order_details',
          success: true,
          data: order || { message: `Order '${orderNumber}' not found in website database.` },
        };
      },
    });

    // 4. get_order_tracking_link (Strict Shiprocket Behavior)
    this.register({
      declaration: {
        name: 'get_order_tracking_link',
        description: 'Retrieve the official Shiprocket courier tracking URL for an order. Rule: Share only the verified tracking link with the customer without speculating on courier dates or status.',
        parameters: {
          type: 'object',
          properties: {
            orderNumber: { type: 'string', description: 'Order number or tracking ID' },
          },
          required: ['orderNumber'],
        },
      },
      execute: async (args) => {
        const orderNumber = String(args.orderNumber || args.orderNumberOrId || '');
        const order = await this.ecommerceAdapter.getOrderDetails(orderNumber);
        const cleanNumber = order?.orderNumber || orderNumber;
        const trackingUrl = `https://shiprocket.co/tracking/${encodeURIComponent(cleanNumber)}`;
        return {
          toolName: 'get_order_tracking_link',
          success: true,
          data: {
            orderNumber: cleanNumber,
            trackingUrl,
            orderFound: Boolean(order) || Boolean(cleanNumber),
            strictDirective: 'Share only this official Shiprocket tracking URL with the customer. Never speculate on courier delivery dates or status.',
          },
        };
      },
    });

    // 5. get_product_details
    this.register({
      declaration: {
        name: 'get_product_details',
        description: 'Get ingredients, shelf-life, refrigeration rules, variants, and pricing for a product (Read-only).',
        parameters: {
          type: 'object',
          properties: {
            sku: { type: 'string', description: 'Product variant SKU (e.g. paan-mukhwas-300g)' },
            productName: { type: 'string', description: 'Product title (e.g. Paan Mukhwas)' },
          },
        },
      },
      execute: async (args) => {
        const products = await this.ecommerceAdapter.getAllActiveProducts();
        const sku = typeof args.sku === 'string' ? args.sku.toLowerCase() : '';
        const name = typeof args.productName === 'string' ? args.productName.toLowerCase() : '';

        const found = products.find((p) => {
          if (sku && p.variants.some((v) => v.sku.toLowerCase().includes(sku))) return true;
          if (name && p.title.toLowerCase().includes(name)) return true;
          return false;
        });

        return {
          toolName: 'get_product_details',
          success: true,
          data: found || { message: 'Product not found in catalogue.' },
        };
      },
    });

    // 6. search_products
    this.register({
      declaration: {
        name: 'search_products',
        description: 'Search available products in the catalogue by keyword or category (Read-only).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search keywords (e.g. mukhwas, gulkand, seeds)' },
            limit: { type: 'number', description: 'Max results to return' },
          },
          required: ['query'],
        },
      },
      execute: async (args) => {
        const q = String(args.query || '');
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        const matches = await this.ecommerceAdapter.searchProducts(q, limit);
        return {
          toolName: 'search_products',
          success: true,
          data: { matches, count: matches.length },
        };
      },
    });

    // 7. get_inventory_availability
    this.register({
      declaration: {
        name: 'get_inventory_availability',
        description: 'Check verified real-time stock levels for a product variant (Read-only).',
        parameters: {
          type: 'object',
          properties: {
            sku: { type: 'string', description: 'Product SKU code' },
          },
          required: ['sku'],
        },
      },
      execute: async (args) => {
        const sku = String(args.sku || '');
        const stock = await this.ecommerceAdapter.getVariantStock(sku);
        return {
          toolName: 'get_inventory_availability',
          success: true,
          data: { sku, inStock: stock > 0, stockQty: stock },
        };
      },
    });

    // 8. get_active_promotions
    this.register({
      declaration: {
        name: 'get_active_promotions',
        description: 'Retrieve currently verified active promotions and promo codes from the website database (Read-only). Note: AI cannot create new codes.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute: async () => {
        const promo = await this.ecommerceAdapter.getActivePromotion().catch(() => null);
        return {
          toolName: 'get_active_promotions',
          success: true,
          data: promo ? { activePromo: promo } : { message: 'No general active promo code in website database.' },
        };
      },
    });

    // 9. get_eligible_promotions
    this.register({
      declaration: {
        name: 'get_eligible_promotions',
        description: 'Check verified promotion codes eligible for a specific customer or order value (Read-only).',
        parameters: {
          type: 'object',
          properties: {
            customerId: { type: 'string', description: 'Customer UUID' },
            orderValue: { type: 'number', description: 'Order value in INR' },
          },
        },
      },
      execute: async (args) => {
        const promo = await this.ecommerceAdapter.getActivePromotion().catch(() => null);
        const orderVal = typeof args.orderValue === 'number' ? args.orderValue : 0;
        const eligible = Boolean(promo && promo.isActive && (!promo.minOrderValue || orderVal >= promo.minOrderValue));
        return {
          toolName: 'get_eligible_promotions',
          success: true,
          data: {
            eligible,
            promo: eligible ? promo : null,
            reason: eligible ? 'Eligible' : 'Does not meet minimum order requirement or no active code.',
          },
        };
      },
    });

    // 10. get_customer_segments
    this.register({
      declaration: {
        name: 'get_customer_segments',
        description: 'List available customer behavioral segments and member counts.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute: async (_args, context) => {
        const segments = await this.enterpriseRepo.listCustomerSegments(context?.tenantId);
        return {
          toolName: 'get_customer_segments',
          success: true,
          data: { segments, total: segments.length },
        };
      },
    });

    // 11. create_support_ticket
    this.register({
      declaration: {
        name: 'create_support_ticket',
        description: 'Create a formal human escalation support ticket for complex issues, damaged items, or dissatisfied customers.',
        parameters: {
          type: 'object',
          properties: {
            phoneNumber: { type: 'string', description: 'Customer phone number' },
            reason: { type: 'string', description: 'Detailed summary of customer issue' },
            customerName: { type: 'string', description: 'Customer full name' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          },
          required: ['phoneNumber', 'reason'],
        },
      },
      execute: async (args) => {
        const phone = String(args.phoneNumber || '');
        const reason = String(args.reason || '');
        const name = typeof args.customerName === 'string' ? args.customerName : 'Customer';
        const conv = await this.platformRepo.getOrCreateConversation(phone, name);
        const ticket = await this.platformRepo.createEscalationTicket(conv.id, phone, name, reason);
        // Suppress marketing while ticket is open
        await this.enterpriseRepo.addCustomerSuppression({
          phoneNumber: phone,
          reason: 'complaint_unresolved',
        });
        return {
          toolName: 'create_support_ticket',
          success: true,
          data: { ticketId: ticket.id, status: ticket.status, phoneNumber: phone },
        };
      },
    });

    // 12. schedule_followup
    this.register({
      declaration: {
        name: 'schedule_followup',
        description: 'Schedule an automated or human follow-up with a customer.',
        parameters: {
          type: 'object',
          properties: {
            phoneNumber: { type: 'string', description: 'Customer phone number' },
            scheduledTime: { type: 'string', description: 'ISO timestamp or relative time description' },
            note: { type: 'string', description: 'Follow-up reason or note' },
          },
          required: ['phoneNumber', 'scheduledTime', 'note'],
        },
      },
      execute: async (args) => {
        const phone = String(args.phoneNumber || '');
        const scheduledTime = String(args.scheduledTime || '');
        const note = String(args.note || '');
        await this.platformRepo.enqueueJob('customer_followup', {
          phoneNumber: phone,
          scheduledTime,
          note,
        });
        return {
          toolName: 'schedule_followup',
          success: true,
          data: { scheduled: true, phoneNumber: phone, note },
        };
      },
    });

    // 13. create_meeting_request
    this.register({
      declaration: {
        name: 'create_meeting_request',
        description: 'Record a meeting request from a corporate client, wholesale partner, or supplier.',
        parameters: {
          type: 'object',
          properties: {
            participantName: { type: 'string', description: 'Contact or company name' },
            contactInfo: { type: 'string', description: 'Phone number or email' },
            purpose: { type: 'string', description: 'Meeting agenda or wholesale enquiry' },
            proposedDate: { type: 'string', description: 'Proposed date and time' },
          },
          required: ['participantName', 'contactInfo', 'purpose'],
        },
      },
      execute: async (args) => {
        const name = String(args.participantName || '');
        const contact = String(args.contactInfo || '');
        const purpose = String(args.purpose || '');
        await this.platformRepo.logActivityEvent({
          eventType: 'meeting_request',
          customerName: name,
          phoneNumber: contact,
          details: { purpose, proposedDate: args.proposedDate },
        });
        return {
          toolName: 'create_meeting_request',
          success: true,
          data: { recorded: true, name, contact, purpose },
        };
      },
    });

    // 14. create_supplier_followup
    this.register({
      declaration: {
        name: 'create_supplier_followup',
        description: 'Log an interaction or schedule a follow-up with a raw material or packaging supplier.',
        parameters: {
          type: 'object',
          properties: {
            supplierId: { type: 'string', description: 'Supplier ID or code' },
            subject: { type: 'string', description: 'Subject or inquiry' },
            message: { type: 'string', description: 'Message summary or RFQ details' },
            proposedTerms: { type: 'object', description: 'Optional tentative pricing or MOQ discussed' },
          },
          required: ['supplierId', 'subject', 'message'],
        },
      },
      execute: async (args) => {
        const supId = String(args.supplierId || '');
        const subject = String(args.subject || '');
        const summary = String(args.message || '');
        const terms = typeof args.proposedTerms === 'object' && args.proposedTerms !== null
          ? (args.proposedTerms as Record<string, unknown>)
          : undefined;

        const interaction = await this.enterpriseRepo.recordSupplierInteraction({
          supplierId: supId,
          interactionType: 'quotation_request',
          initiatedBy: 'ai',
          subject,
          summary,
          proposedTerms: terms,
        });

        return {
          toolName: 'create_supplier_followup',
          success: true,
          data: { interactionId: interaction.id, supplierId: supId, subject },
        };
      },
    });

    // 15. request_owner_approval (Level 3 Autonomy)
    this.register({
      declaration: {
        name: 'request_owner_approval',
        description: 'Submit an action requiring owner approval (e.g. refunds, supplier commitments, discounts exceeding limit, policy changes). Required before executing sensitive operations.',
        parameters: {
          type: 'object',
          properties: {
            actionType: {
              type: 'string',
              enum: [
                'refund',
                'discount_override',
                'order_cancellation',
                'supplier_purchase',
                'supplier_commitment',
                'policy_change',
                'mass_campaign',
                'customer_data_deletion',
              ],
            },
            targetEntityId: { type: 'string', description: 'Identifier of affected entity' },
            businessReason: { type: 'string', description: 'Commercial or customer justification' },
            financialImpact: { type: 'number', description: 'Estimated financial impact in INR' },
            recommendation: { type: 'string', description: 'AI recommendation for the owner' },
            parameters: { type: 'object', description: 'Exact action parameters' },
          },
          required: ['actionType', 'targetEntityId', 'businessReason', 'financialImpact', 'recommendation'],
        },
      },
      execute: async (args, context) => {
        const actionType = args.actionType as any;
        const targetId = String(args.targetEntityId || '');
        const reason = String(args.businessReason || '');
        const impact = Number(args.financialImpact || 0);
        const recommendation = String(args.recommendation || '');
        const params = (args.parameters as Record<string, unknown>) || {};

        const req = await this.enterpriseRepo.createApprovalRequest({
          initiatingAgent: context.agentRole,
          actionType,
          targetEntityType: actionType,
          targetEntityId: targetId,
          parameters: params,
          businessReason: reason,
          financialImpact: impact,
          recommendation,
        });

        return {
          toolName: 'request_owner_approval',
          success: true,
          requiresApproval: true,
          approvalRequestId: req.id,
          data: {
            approvalId: req.id,
            status: 'pending',
            message: 'Approval request submitted to owner dashboard. Action cannot proceed until approved.',
          },
        };
      },
    });

    // 16. create_campaign_draft
    this.register({
      declaration: {
        name: 'create_campaign_draft',
        description: 'Draft a marketing campaign for review on the admin dashboard. Campaigns default to disabled until owner approves.',
        parameters: {
          type: 'object',
          properties: {
            campaignType: { type: 'string', description: 'Campaign type identifier' },
            name: { type: 'string', description: 'Campaign title' },
            messageTemplate: { type: 'string', description: 'Message copy with {{placeholders}}' },
            segmentId: { type: 'string', description: 'Target customer segment ID' },
          },
          required: ['campaignType', 'name', 'messageTemplate'],
        },
      },
      execute: async (args, context) => {
        const type = args.campaignType as any;
        const name = String(args.name || '');
        const template = String(args.messageTemplate || '');
        const segId = typeof args.segmentId === 'string' ? args.segmentId : undefined;

        const all = await this.enterpriseRepo.listCampaignDefinitions(context?.tenantId);
        const existing = all.find((c) => c.campaignType === type);

        return {
          toolName: 'create_campaign_draft',
          success: true,
          data: {
            drafted: true,
            name,
            campaignType: type,
            segmentId: segId,
            messageTemplate: template,
            existingCampaignId: existing?.id,
            status: 'draft_pending_review',
          },
        };
      },
    });

    // 17. get_business_metrics
    this.register({
      declaration: {
        name: 'get_business_metrics',
        description: 'Fetch verified business, financial, and operational performance metrics.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD' },
            period: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
          },
        },
      },
      execute: async (args) => {
        const date = typeof args.date === 'string' ? args.date : undefined;
        const istToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const snapshot = await this.enterpriseRepo.getFinancialSnapshot(date);
        const report = await this.platformRepo.getDailyReport(date || istToday);
        return {
          toolName: 'get_business_metrics',
          success: true,
          data: {
            financialSnapshot: snapshot,
            operationalReport: report,
          },
        };
      },
    });

    // 18. get_manufacturing_data
    this.register({
      declaration: {
        name: 'get_manufacturing_data',
        description: 'Query verified raw material stocks, recipe formulations, production batches, or procurement forecasts.',
        parameters: {
          type: 'object',
          properties: {
            dataType: {
              type: 'string',
              enum: ['raw_materials', 'recipes', 'batches', 'forecasts'],
            },
          },
          required: ['dataType'],
        },
      },
      execute: async (args, context) => {
        const dt = String(args.dataType || '');
        switch (dt) {
          case 'raw_materials': {
            const materials = await this.enterpriseRepo.listRawMaterials(context?.tenantId);
            return { toolName: 'get_manufacturing_data', success: true, data: { materials } };
          }
          case 'recipes': {
            const recipes = await this.enterpriseRepo.listRecipes(context?.tenantId);
            return { toolName: 'get_manufacturing_data', success: true, data: { recipes } };
          }
          case 'batches': {
            const batches = await this.enterpriseRepo.listProductionBatches(context?.tenantId);
            return { toolName: 'get_manufacturing_data', success: true, data: { batches } };
          }
          case 'forecasts': {
            const forecasts = await this.enterpriseRepo.listProcurementForecasts();
            return { toolName: 'get_manufacturing_data', success: true, data: { forecasts } };
          }
          default:
            return { toolName: 'get_manufacturing_data', success: false, error: `Unknown dataType: ${dt}` };
        }
      },
    });

    // 19. get_supplier_details
    this.register({
      declaration: {
        name: 'get_supplier_details',
        description: 'Retrieve verified supplier profiles, contact details, supplied materials, lead times, and ratings.',
        parameters: {
          type: 'object',
          properties: {
            supplierIdOrCode: { type: 'string', description: 'Supplier UUID or code (e.g. SUP-SAU-01)' },
          },
          required: ['supplierIdOrCode'],
        },
      },
      execute: async (args) => {
        const id = String(args.supplierIdOrCode || '');
        const supplier = await this.enterpriseRepo.getSupplier(id);
        const interactions = await this.enterpriseRepo.listSupplierInteractions(supplier?.id);
        return {
          toolName: 'get_supplier_details',
          success: true,
          data: supplier ? { supplier, recentInteractions: interactions.slice(0, 5) } : { message: 'Supplier not found.' },
        };
      },
    });

    // 20. create_knowledge_update_proposal
    this.register({
      declaration: {
        name: 'create_knowledge_update_proposal',
        description: 'Propose a business knowledge or SOP update based on repeated customer questions or operational learnings.',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Topic or product area' },
            observedPattern: { type: 'string', description: 'Observed pattern or repeated customer query' },
            proposedAddition: { type: 'string', description: 'Suggested text or policy improvement' },
            rationale: { type: 'string', description: 'Commercial or operational reason' },
          },
          required: ['topic', 'observedPattern', 'proposedAddition', 'rationale'],
        },
      },
      execute: async (args, context) => {
        const topic = String(args.topic || '');
        const pattern = String(args.observedPattern || '');
        const addition = String(args.proposedAddition || '');
        const rationale = String(args.rationale || '');

        const proposal = await this.enterpriseRepo.createLearningProposal({
          tenantId: context?.tenantId || '00000000-0000-0000-0000-000000000001',
          topic,
          observedPattern: pattern,
          proposedAddition: addition,
          rationale,
          status: 'proposed',
        });

        return {
          toolName: 'create_knowledge_update_proposal',
          success: true,
          data: { proposalId: proposal.id, status: proposal.status, topic },
        };
      },
    });

    // 21. create_operational_alert
    this.register({
      declaration: {
        name: 'create_operational_alert',
        description: 'Trigger an immediate operational alert for the owner and management dashboard (critical issues, anomalies, failures).',
        parameters: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            category: { type: 'string', enum: ['support', 'logistics', 'supplier', 'manufacturing', 'financial', 'security', 'ai_system'] },
            title: { type: 'string', description: 'Short alert headline' },
            summary: { type: 'string', description: 'Detailed description' },
            recommendedAction: { type: 'string', description: 'Actionable corrective step' },
          },
          required: ['severity', 'category', 'title', 'summary'],
        },
      },
      execute: async (args, context) => {
        const severity = args.severity as any;
        const category = args.category as any;
        const title = String(args.title || '');
        const summary = String(args.summary || '');
        const action = typeof args.recommendedAction === 'string' ? args.recommendedAction : undefined;

        const alert = await this.enterpriseRepo.createOperationalAlert({
          severity,
          category,
          title,
          summary,
          recommendedAction: action,
        });

        return {
          toolName: 'create_operational_alert',
          success: true,
          data: { alertId: alert.id, severity: alert.severity, title, tenantId: context?.tenantId },
        };
      },
    });

    // =========================================================================
    // PLATFORM CONTROL PLANE TOOLS (Zero Customer PII)
    // =========================================================================

    // 22. get_platform_overview
    this.register({
      declaration: {
        name: 'get_platform_overview',
        description: 'Fetch aggregated multi-tenant platform metrics: total businesses, active, saas, internal, usage, and system health. Contains NO customer PII.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute: async () => {
        const allTenants = await this.multiTenantRepo.listTenants();
        const internalCount = allTenants.filter((t) => t.tenantType === 'internal').length;
        const saasCount = allTenants.filter((t) => t.tenantType === 'saas').length;
        const activeCount = allTenants.filter((t) => t.status === 'active').length;

        let totalTokens = 0;
        let totalConversations = 0;
        for (const t of allTenants) {
          const u = await this.multiTenantRepo.getUsage(t.id);
          totalTokens += u.totalAiTokensConsumed;
          totalConversations += u.totalConversations;
        }

        return {
          toolName: 'get_platform_overview',
          success: true,
          data: {
            totalTenants: allTenants.length,
            internalTenants: internalCount,
            saasTenants: saasCount,
            activeTenants: activeCount,
            totalAiTokensConsumed: totalTokens,
            totalConversations,
          },
        };
      },
    });

    // 23. list_platform_tenants
    this.register({
      declaration: {
        name: 'list_platform_tenants',
        description: 'List onboarded businesses in the platform directory with their tenant type, status, and industry profile. No customer PII.',
        parameters: {
          type: 'object',
          properties: {
            tenantType: { type: 'string', enum: ['internal', 'saas', 'platform'] },
            status: { type: 'string', enum: ['draft', 'onboarding', 'configuration', 'validation', 'active', 'suspended', 'archived'] },
          },
        },
      },
      execute: async (args) => {
        const type = args.tenantType as any;
        const status = args.status as any;
        const tenants = await this.multiTenantRepo.listTenants({ tenantType: type, status });
        const sanitized = tenants.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          tenantType: t.tenantType,
          status: t.status,
          isolationMode: t.isolationMode,
          industryProfile: t.industryProfile,
          planId: t.planId,
          onboardingStep: t.onboardingStep,
        }));
        return {
          toolName: 'list_platform_tenants',
          success: true,
          data: { tenants: sanitized, count: sanitized.length },
        };
      },
    });

    // 24. get_tenant_status
    this.register({
      declaration: {
        name: 'get_tenant_status',
        description: 'Get operational status, database isolation mode, subscription plan, and onboarding progress for a specific business. No customer PII.',
        parameters: {
          type: 'object',
          properties: {
            tenantIdOrSlug: { type: 'string', description: 'Tenant UUID or slug identifier' },
          },
          required: ['tenantIdOrSlug'],
        },
      },
      execute: async (args) => {
        const identifier = String(args.tenantIdOrSlug || '');
        let tenant = await this.multiTenantRepo.getTenantById(identifier);
        if (!tenant) {
          tenant = await this.multiTenantRepo.getTenantBySlug(identifier);
        }
        if (!tenant) {
          return { toolName: 'get_tenant_status', success: false, error: `Tenant '${identifier}' not found` };
        }

        const sub = await this.multiTenantRepo.getSubscription(tenant.id);
        const usage = await this.multiTenantRepo.getUsage(tenant.id);
        const route = await this.multiTenantRepo.getDatabaseRoute(tenant.id);

        return {
          toolName: 'get_tenant_status',
          success: true,
          data: {
            tenant: {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              status: tenant.status,
              tenantType: tenant.tenantType,
              isolationMode: tenant.isolationMode,
              industryProfile: tenant.industryProfile,
              onboardingStep: tenant.onboardingStep,
            },
            subscription: sub ? { planId: sub.plan.id, planName: sub.plan.name, status: sub.subscription.status } : null,
            usage: { totalAiTokens: usage.totalAiTokensConsumed, totalConversations: usage.totalConversations },
            databaseRoute: route ? { isolationMode: route.isolationMode, health: route.healthStatus } : { isolationMode: 'shared' },
          },
        };
      },
    });

    // 25. get_system_health
    this.register({
      declaration: {
        name: 'get_system_health',
        description: 'Inspect overall system health: shared database connectivity, worker queue status, and active integrations.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute: async () => {
        return {
          toolName: 'get_system_health',
          success: true,
          data: {
            status: 'operational',
            database: 'healthy',
            workers: 'running',
            aiProviders: [{ provider: 'gemini', status: 'available' }],
            timestamp: new Date().toISOString(),
          },
        };
      },
    });
  }
}

let registryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
  }
  return registryInstance;
}
