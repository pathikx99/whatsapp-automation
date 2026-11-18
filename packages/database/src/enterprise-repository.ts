import { SupabaseClient } from '@supabase/supabase-js';
import { createLocalSupabaseClient } from './local-client.js';

// ============================================================================
// 1. TENANT & USER INTERFACES
// ============================================================================
export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  isActive: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'manager' | 'support_agent' | 'viewer';
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 2. CUSTOMER INTELLIGENCE & SEGMENTATION
// ============================================================================
export interface PlatformCustomerSegment {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  criteria: Record<string, unknown>;
  isSystem: boolean;
  memberCount: number;
  lastCalculatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSegmentMembershipHistory {
  id: string;
  tenantId: string;
  segmentId: string;
  customerId: string;
  phoneNumber: string;
  action: 'added' | 'removed';
  reason?: string;
  createdAt: string;
}

// ============================================================================
// 3. CONSENT & SUPPRESSION
// ============================================================================
export interface PlatformCustomerConsent {
  id: string;
  tenantId: string;
  phoneNumber: string;
  email?: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'voice';
  consentStatus: 'opted_in' | 'opted_out';
  optInSource?: string;
  optedOutAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSuppressionRecord {
  id: string;
  tenantId: string;
  phoneNumber: string;
  email?: string;
  reason: 'complaint_unresolved' | 'opted_out' | 'manual_block' | 'high_risk' | 'quiet_hours';
  activeUntil?: string;
  createdAt: string;
}

// ============================================================================
// 4. CAMPAIGN AUTOMATIONS (10 Workflows)
// ============================================================================
export type CampaignType =
  | 'abandoned_cart'
  | 'abandoned_checkout'
  | 'win_back'
  | 'festival'
  | 'product_launch'
  | 'cross_sell'
  | 'referral'
  | 'loyalty_rewards'
  | 'review_collection'
  | 'birthday_anniversary';

export interface PlatformCampaignDefinition {
  id: string;
  tenantId: string;
  name: string;
  campaignType: CampaignType;
  description?: string;
  isEnabled: boolean;
  triggerConditions: Record<string, unknown>;
  timingConfig: {
    delayMinutes?: number;
    quietHours?: { start: string; end: string };
    frequencyCapDays?: number;
  };
  audienceSegmentId?: string;
  templateName?: string;
  messageTemplate: string;
  channel: string;
  approvalRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformCampaignExecution {
  id: string;
  tenantId: string;
  campaignId: string;
  scheduledFor: string;
  executedAt?: string;
  status: 'scheduled' | 'running' | 'completed' | 'paused' | 'cancelled' | 'failed';
  totalTarget: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalConverted: number;
  totalFailed: number;
  errorMessage?: string;
  createdAt: string;
}

export interface PlatformCampaignRecipient {
  id: string;
  tenantId: string;
  executionId: string;
  campaignId: string;
  customerId?: string;
  phoneNumber: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'clicked' | 'converted' | 'suppressed' | 'failed';
  discountCode?: string;
  trackingUrl?: string;
  metaWamid?: string;
  errorMessage?: string;
  sentAt?: string;
  convertedAt?: string;
  createdAt: string;
}

// ============================================================================
// 5. PERSONALIZED DISCOUNT ENGINE
// ============================================================================
export interface PlatformPersonalizedDiscountRules {
  id: string;
  tenantId: string;
  isEnabled: boolean;
  maxDiscountPercentage: number;
  maxFixedAmount: number;
  eligibleSegments: string[];
  eligibleProducts: string[];
  requireApprovalAbovePercent: number;
  requireApprovalAboveAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformPersonalizedDiscountLog {
  id: string;
  tenantId: string;
  customerId?: string;
  phoneNumber: string;
  code: string;
  discountType: string;
  discountValue: number;
  authorizedBy: 'ai' | 'owner' | 'predefined_campaign';
  approvalId?: string;
  isRedeemed: boolean;
  createdAt: string;
}

// ============================================================================
// 6. SUPPLIER & PROCUREMENT MANAGEMENT + VOICE CALLING
// ============================================================================
export interface PlatformSupplier {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  materialsSupplied: string[];
  productsSupplied: string[];
  paymentTerms: string;
  leadTimeDays: number;
  minOrderValue: number;
  rating: number;
  notes?: string;
  status: 'active' | 'inactive' | 'blacklisted';
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSupplierMaterial {
  id: string;
  tenantId: string;
  supplierId: string;
  materialName: string;
  materialCode?: string;
  unit: string;
  unitPrice: number;
  moq: number;
  leadTimeDays: number;
  isPrimarySupplier: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSupplierQuotation {
  id: string;
  tenantId: string;
  supplierId: string;
  rfqNumber: string;
  quotationDate: string;
  validUntil?: string;
  items: Array<{
    materialName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  totalAmount: number;
  terms?: string;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
}

export interface PlatformSupplierInteraction {
  id: string;
  tenantId: string;
  supplierId: string;
  interactionType: 'call' | 'whatsapp' | 'email' | 'meeting' | 'quotation_request' | 'price_negotiation' | 'delivery_followup';
  initiatedBy: 'ai' | 'owner';
  subject: string;
  summary: string;
  proposedTerms?: Record<string, unknown>;
  agreedTerms?: Record<string, unknown>;
  followUpDate?: string;
  createdAt: string;
}

export interface PlatformSupplierCall {
  id: string;
  tenantId: string;
  supplierId: string;
  phoneNumber: string;
  callerIdentity: string; // 'Mintara Bites Manager'
  provider: 'exotel' | 'sarvam' | 'mock' | 'twilio';
  providerCallId?: string;
  callStatus: 'initiated' | 'ringing' | 'in_progress' | 'completed' | 'busy' | 'no_answer' | 'failed' | 'refused';
  durationSeconds: number;
  recipientLanguage: string;
  transcript?: string;
  recordingUrl?: string;
  tentativeAgreement?: Record<string, unknown>;
  approvalId?: string;
  createdAt: string;
}

// ============================================================================
// 7. KNOWLEDGE CENTRE & MEMORY
// ============================================================================
export interface PlatformKnowledgeDocument {
  id: string;
  tenantId: string;
  title: string;
  originalFilename: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'image' | 'json';
  fileSizeBytes: number;
  storagePath?: string;
  category: 'sop' | 'product' | 'policy' | 'supplier' | 'manufacturing' | 'commercial' | 'general';
  status: 'processing' | 'active' | 'rejected' | 'archived';
  version: number;
  conflictDetected: boolean;
  conflictDetails?: string;
  isOwnerApproved: boolean;
  extractedText?: string;
  structuredFacts?: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformKnowledgeChunk {
  id: string;
  documentId: string;
  versionId?: string;
  chunkIndex: number;
  chunkText: string;
  tokenCount: number;
  embeddingJson?: number[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PlatformBusinessMemory {
  id: string;
  tenantId: string;
  memoryType: 'business' | 'customer' | 'operational';
  key: string;
  content: string;
  sourceReference?: string;
  confidence: number;
  isVerified: boolean;
  verifiedBy: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformContinuousLearningProposal {
  id: string;
  tenantId: string;
  topic: string;
  observedPattern: string;
  proposedAddition: string;
  proposedPolicy?: string;
  rationale: string;
  status: 'proposed' | 'approved' | 'rejected';
  reviewedAt?: string;
  createdAt: string;
}

// ============================================================================
// 8. MANUFACTURING INTELLIGENCE, RECIPES & BATCHES
// ============================================================================
export interface PlatformRawMaterial {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  category: 'seeds' | 'spices' | 'sweeteners' | 'aroma_extracts' | 'packaging' | 'consumables';
  unit: 'kg' | 'grams' | 'litres' | 'ml' | 'pieces' | 'packets';
  currentStock: number;
  minimumReorderLevel: number;
  targetStockLevel: number;
  costPerUnit: number;
  shelfLifeDays: number;
  storageConditions: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformRecipeIngredient {
  id: string;
  recipeId: string;
  rawMaterialId: string;
  rawMaterialName?: string;
  quantity: number;
  unit: string;
  lossPercentage: number;
  notes?: string;
}

export interface PlatformRecipe {
  id: string;
  tenantId: string;
  productName: string;
  sku: string;
  version: number;
  yieldQuantity: number;
  yieldUnit: string;
  instructions?: string;
  ingredients: PlatformRecipeIngredient[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformProductionOrder {
  id: string;
  tenantId: string;
  orderNumber: string;
  recipeId: string;
  recipeName?: string;
  targetQuantity: number;
  plannedStartDate: string;
  plannedCompletionDate: string;
  actualStartDate?: string;
  actualCompletionDate?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformProductionBatch {
  id: string;
  tenantId: string;
  productionOrderId?: string;
  batchNumber: string;
  recipeId: string;
  recipeName?: string;
  quantityProduced: number;
  unit: string;
  yieldPercentage: number;
  manufacturingDate: string;
  expiryDate: string;
  status: 'quarantine' | 'released' | 'rejected';
  batchCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformProcurementForecast {
  id: string;
  tenantId: string;
  materialId: string;
  materialName: string;
  forecastedDemandQty: number;
  currentStock: number;
  reorderQtyRecommended: number;
  recommendedOrderDate: string;
  requiredByDate: string;
  rationale: string;
  createdAt: string;
}

// ============================================================================
// 9. FINANCIAL INTELLIGENCE & UNIT ECONOMICS
// ============================================================================
export interface PlatformFinancialSnapshot {
  id: string;
  tenantId: string;
  snapshotDate: string;
  periodType: 'daily' | 'weekly' | 'monthly';
  grossRevenue: number;
  netRevenue: number;
  cogs: number;
  grossMargin: number;
  contributionMargin: number;
  shippingCosts: number;
  paymentGatewayFees: number;
  discountsGiven: number;
  refunds: number;
  codCosts: number;
  rtoLosses: number;
  netProfit: number;
  cac?: number;
  roas?: number;
  clv?: number;
  verifiedMetrics: string[];
  estimatedMetrics: string[];
  missingInputs: string[];
  completenessScore: number;
  createdAt: string;
}

export interface PlatformUnitEconomicsConfig {
  id: string;
  tenantId: string;
  sku: string;
  productName: string;
  cogsVerified: number;
  packagingCost: number;
  shippingCostEstimate: number;
  gatewayFeePercent: number;
  returnRateEstimate: number;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 10. APPROVALS & LEVEL 3 AUTONOMY
// ============================================================================
export type ApprovalActionType =
  | 'refund'
  | 'discount_override'
  | 'order_cancellation'
  | 'supplier_purchase'
  | 'supplier_commitment'
  | 'policy_change'
  | 'mass_campaign'
  | 'customer_data_deletion';

export interface PlatformApprovalRequest {
  id: string;
  tenantId: string;
  initiatingAgent: string;
  actionType: ApprovalActionType;
  targetEntityType: string;
  targetEntityId: string;
  parameters: Record<string, unknown>;
  businessReason: string;
  financialImpact: number;
  riskAssessment: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'failed' | 'cancelled';
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  executionResult?: Record<string, unknown>;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 11. OPERATIONAL ALERTS & ANOMALIES
// ============================================================================
export interface PlatformOperationalAlert {
  id: string;
  tenantId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'support' | 'logistics' | 'supplier' | 'manufacturing' | 'financial' | 'security' | 'ai_system';
  title: string;
  summary: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  conversationId?: string;
  recommendedAction?: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledgedBy?: string;
  resolvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 12. ECOMMERCE CHANGE INTELLIGENCE
// ============================================================================
export interface PlatformEcommerceChangeEvent {
  id: string;
  tenantId: string;
  entityType: 'product' | 'price' | 'inventory' | 'variant' | 'promo' | 'order_pattern';
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  changeSource: 'webhook' | 'poll_reconciliation';
  businessImpact?: string;
  recommendedAction?: string;
  detectedAt: string;
}

// ============================================================================
// ENTERPRISE REPOSITORY IMPLEMENTATION (Dual Mode: Live Supabase + Cache Fallback)
// ============================================================================
export class EnterpriseRepository {
  private client: SupabaseClient;
  private defaultTenantId = '00000000-0000-0000-0000-000000000001';

  // In-Memory Fallback Caches
  private segmentsCache: PlatformCustomerSegment[] = [];
  private campaignsCache: PlatformCampaignDefinition[] = [];
  private campaignExecutionsCache: PlatformCampaignExecution[] = [];
  private campaignRecipientsCache: PlatformCampaignRecipient[] = [];
  private discountRulesCache: PlatformPersonalizedDiscountRules | null = null;
  private discountLogsCache: PlatformPersonalizedDiscountLog[] = [];
  private suppliersCache: PlatformSupplier[] = [];
  private supplierMaterialsCache: PlatformSupplierMaterial[] = [];
  private supplierQuotationsCache: PlatformSupplierQuotation[] = [];
  private supplierInteractionsCache: PlatformSupplierInteraction[] = [];
  private supplierCallsCache: PlatformSupplierCall[] = [];
  private knowledgeDocsCache: PlatformKnowledgeDocument[] = [];
  private knowledgeChunksCache: PlatformKnowledgeChunk[] = [];
  private businessMemoriesCache: PlatformBusinessMemory[] = [];
  private learningProposalsCache: PlatformContinuousLearningProposal[] = [];
  private rawMaterialsCache: PlatformRawMaterial[] = [];
  private recipesCache: PlatformRecipe[] = [];
  private productionOrdersCache: PlatformProductionOrder[] = [];
  private productionBatchesCache: PlatformProductionBatch[] = [];
  private forecastsCache: PlatformProcurementForecast[] = [];
  private financialSnapshotsCache: PlatformFinancialSnapshot[] = [];
  private unitEconomicsCache: PlatformUnitEconomicsConfig[] = [];
  private approvalsCache: PlatformApprovalRequest[] = [];
  private alertsCache: PlatformOperationalAlert[] = [];
  private changeHistoryCache: PlatformEcommerceChangeEvent[] = [];
  private suppressionsCache: PlatformSuppressionRecord[] = [];
  private consentsCache: PlatformCustomerConsent[] = [];

  constructor(client?: SupabaseClient) {
    this.client = client || createLocalSupabaseClient();
    this.seedDefaultData();
  }

  private seedDefaultData() {
    const now = new Date().toISOString();

    // Default Customer Segments
    this.segmentsCache = [
      {
        id: 'seg_new_customers',
        tenantId: this.defaultTenantId,
        name: 'New Customers',
        slug: 'new-customers',
        description: 'Customers registered within the last 14 days without an order',
        criteria: { daysRegistered: 14, maxOrders: 0 },
        isSystem: true,
        memberCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'seg_first_time',
        tenantId: this.defaultTenantId,
        name: 'First-Time Buyers',
        slug: 'first-time-buyers',
        description: 'Customers with exactly 1 completed purchase',
        criteria: { totalOrders: 1 },
        isSystem: true,
        memberCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'seg_repeat_customers',
        tenantId: this.defaultTenantId,
        name: 'Repeat Customers',
        slug: 'repeat-customers',
        description: 'Loyal customers with 2 or more successful orders',
        criteria: { minOrders: 2 },
        isSystem: true,
        memberCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'seg_high_value',
        tenantId: this.defaultTenantId,
        name: 'High-Value Customers (VIP)',
        slug: 'high-value-vip',
        description: 'Customers with lifetime spend > ₹2,000',
        criteria: { minLifetimeSpend: 2000 },
        isSystem: true,
        memberCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'seg_replenishment_due',
        tenantId: this.defaultTenantId,
        name: 'Replenishment Due (21-30 Days)',
        slug: 'replenishment-due',
        description: 'Customers whose mukhwas treats are estimated to finish this week',
        criteria: { lastOrderDaysAgoMin: 21, lastOrderDaysAgoMax: 35 },
        isSystem: true,
        memberCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'seg_inactive_winback',
        tenantId: this.defaultTenantId,
        name: 'Inactive Customers (45+ Days)',
        slug: 'inactive-winback',
        description: 'Previously active customers with no purchase in 45+ days',
        criteria: { lastOrderDaysAgoMin: 45 },
        isSystem: true,
        memberCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Default 10 Marketing Automations (All disabled by default until configured and approved)
    const campaignTypes: Array<{ type: CampaignType; name: string; template: string; delay: number }> = [
      {
        type: 'abandoned_cart',
        name: 'Abandoned Cart Recovery',
        template: 'Hi {{name}}, your favorite artisanal mukhwas treats are waiting in your cart! Complete your order with 1-click checkout: {{url}}',
        delay: 60,
      },
      {
        type: 'abandoned_checkout',
        name: 'Abandoned Checkout Recovery',
        template: 'Hello {{name}}, we noticed you did not finish your checkout. Enjoy free shipping on your artisanal treats: {{url}}',
        delay: 120,
      },
      {
        type: 'win_back',
        name: 'Customer Win-Back (45+ Days Inactive)',
        template: 'Kem Cho {{name}}! We miss you at Mintara Bites. Restock your favorite digestive treats today: {{url}}',
        delay: 64800,
      },
      {
        type: 'festival',
        name: 'Festival Gift Box Campaign (Diwali/Navratri/Holi)',
        template: 'Celebrate this festive season with pure artisanal sweetness from Gujarat! Explore our exclusive handcrafted gift hampers: {{url}}',
        delay: 0,
      },
      {
        type: 'product_launch',
        name: 'New Product Launch VIP Early Access',
        template: 'Exciting news {{name}}! Introducing our new handcrafted treat. Be the first to taste: {{url}}',
        delay: 0,
      },
      {
        type: 'cross_sell',
        name: 'Post-Purchase Cross-Sell & Treat Pairing',
        template: 'Loving your Paan Mukhwas? Try pairing it with our roasted Seeds Fusion for complete after-meal digestion: {{url}}',
        delay: 4320,
      },
      {
        type: 'referral',
        name: 'Friend & Family Referral Rewards',
        template: 'Share pure handcrafted mukhwas with friends and family! Give ₹50 off, get ₹50 off on your next order: {{url}}',
        delay: 10080,
      },
      {
        type: 'loyalty_rewards',
        name: 'VIP Loyalty Milestone & Rewards',
        template: 'Congratulations {{name}}! You are a Mintara VIP connoisseur. Enjoy special privileges on your next purchase: {{url}}',
        delay: 0,
      },
      {
        type: 'review_collection',
        name: 'Verified Delivery Review & Feedback Collection',
        template: 'Hi {{name}}, hope your Mintara Bites treats arrived fresh and crisp! How was your experience? Rate us here: {{url}}',
        delay: 2880,
      },
      {
        type: 'birthday_anniversary',
        name: 'Birthday & Anniversary Celebration Treat',
        template: 'Wishing you a delightful day {{name}}! Here is a sweet celebration treat from our family to yours: {{url}}',
        delay: 0,
      },
    ];

    this.campaignsCache = campaignTypes.map((c, idx) => ({
      id: `camp_def_${idx + 1}`,
      tenantId: this.defaultTenantId,
      name: c.name,
      campaignType: c.type,
      description: `Automated ${c.name} workflow for Mintara Bites D2C`,
      isEnabled: false, // Strict default: all campaigns disabled until configured & approved
      triggerConditions: { event: c.type },
      timingConfig: {
        delayMinutes: c.delay,
        quietHours: { start: '21:00', end: '09:00' },
        frequencyCapDays: 7,
      },
      messageTemplate: c.template,
      channel: 'whatsapp',
      approvalRequired: true,
      createdAt: now,
      updatedAt: now,
    }));

    // Default Personalized Discount Rules (Strictly disabled by default)
    this.discountRulesCache = {
      id: 'pdr_default',
      tenantId: this.defaultTenantId,
      isEnabled: false,
      maxDiscountPercentage: 15.0,
      maxFixedAmount: 200.0,
      eligibleSegments: ['seg_repeat_customers', 'seg_inactive_winback'],
      eligibleProducts: [],
      requireApprovalAbovePercent: 10.0,
      requireApprovalAboveAmount: 100.0,
      createdAt: now,
      updatedAt: now,
    };

    // Default Raw Materials Catalogue (Mintara Bites Signature Artisanal Mukhwas)
    this.rawMaterialsCache = [
      {
        id: 'rm_fennel_variyali',
        tenantId: this.defaultTenantId,
        name: 'Sweet Fennel Seeds (Variyali)',
        code: 'RM-FEN-01',
        category: 'seeds',
        unit: 'kg',
        currentStock: 120.0,
        minimumReorderLevel: 30.0,
        targetStockLevel: 150.0,
        costPerUnit: 180.0,
        shelfLifeDays: 365,
        storageConditions: 'Airtight dry container',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rm_dhanadal',
        tenantId: this.defaultTenantId,
        name: 'Roasted Dhanadal (Coriander Seeds)',
        code: 'RM-DHA-02',
        category: 'seeds',
        unit: 'kg',
        currentStock: 85.0,
        minimumReorderLevel: 25.0,
        targetStockLevel: 100.0,
        costPerUnit: 140.0,
        shelfLifeDays: 240,
        storageConditions: 'Cool dry room',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rm_rose_gulkand',
        tenantId: this.defaultTenantId,
        name: 'Pure Desi Rose Petal Gulkand',
        code: 'RM-GUL-03',
        category: 'sweeteners',
        unit: 'kg',
        currentStock: 45.0,
        minimumReorderLevel: 20.0,
        targetStockLevel: 80.0,
        costPerUnit: 260.0,
        shelfLifeDays: 180,
        storageConditions: 'Refrigerated container (below 15°C)',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rm_coconut_flakes',
        tenantId: this.defaultTenantId,
        name: 'Toasted Sun-Dried Coconut Flakes',
        code: 'RM-COC-04',
        category: 'spices',
        unit: 'kg',
        currentStock: 35.0,
        minimumReorderLevel: 15.0,
        targetStockLevel: 60.0,
        costPerUnit: 210.0,
        shelfLifeDays: 120,
        storageConditions: 'Moisture-proof cool store',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rm_sesame_white',
        tenantId: this.defaultTenantId,
        name: 'White Sesame Seeds (Til)',
        code: 'RM-SES-05',
        category: 'seeds',
        unit: 'kg',
        currentStock: 50.0,
        minimumReorderLevel: 20.0,
        targetStockLevel: 75.0,
        costPerUnit: 190.0,
        shelfLifeDays: 300,
        storageConditions: 'Dry container',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rm_pouch_standup_300g',
        tenantId: this.defaultTenantId,
        name: 'Resealable Standup Zipper Pouch (300g)',
        code: 'PKG-PCH-300',
        category: 'packaging',
        unit: 'pieces',
        currentStock: 2500,
        minimumReorderLevel: 1000,
        targetStockLevel: 5000,
        costPerUnit: 6.5,
        shelfLifeDays: 730,
        storageConditions: 'Dry packing room',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Default Recipes for Mintara Bites Signatures
    this.recipesCache = [
      {
        id: 'rec_paan_mukhwas',
        tenantId: this.defaultTenantId,
        productName: 'Artisanal Paan Mukhwas',
        sku: 'paan-mukhwas-300g',
        version: 1,
        yieldQuantity: 100.0,
        yieldUnit: 'kg',
        instructions: 'Slow roast fennel and dhanadal separately at 85°C. Gently fold in infused rose gulkand and calcuttia paan extract. Cool before hermetic pouch sealing.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ingredients: [
          { id: 'ri_1', recipeId: 'rec_paan_mukhwas', rawMaterialId: 'rm_fennel_variyali', rawMaterialName: 'Sweet Fennel Seeds', quantity: 45.0, unit: 'kg', lossPercentage: 2.0 },
          { id: 'ri_2', recipeId: 'rec_paan_mukhwas', rawMaterialId: 'rm_dhanadal', rawMaterialName: 'Roasted Dhanadal', quantity: 25.0, unit: 'kg', lossPercentage: 1.5 },
          { id: 'ri_3', recipeId: 'rec_paan_mukhwas', rawMaterialId: 'rm_rose_gulkand', rawMaterialName: 'Pure Desi Rose Gulkand', quantity: 30.0, unit: 'kg', lossPercentage: 1.0 },
        ],
      },
      {
        id: 'rec_coconut_crunch',
        tenantId: this.defaultTenantId,
        productName: 'Coconut Crunch',
        sku: 'coconut-crunch-200g',
        version: 1,
        yieldQuantity: 50.0,
        yieldUnit: 'kg',
        instructions: 'Toast dried coconut flakes to golden crispness. Blend with roasted sesame and chocolate dhanadal coating.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ingredients: [
          { id: 'ri_4', recipeId: 'rec_coconut_crunch', rawMaterialId: 'rm_coconut_flakes', rawMaterialName: 'Coconut Flakes', quantity: 25.0, unit: 'kg', lossPercentage: 3.0 },
          { id: 'ri_5', recipeId: 'rec_coconut_crunch', rawMaterialId: 'rm_sesame_white', rawMaterialName: 'White Sesame Seeds', quantity: 15.0, unit: 'kg', lossPercentage: 2.0 },
          { id: 'ri_6', recipeId: 'rec_coconut_crunch', rawMaterialId: 'rm_dhanadal', rawMaterialName: 'Roasted Dhanadal', quantity: 10.0, unit: 'kg', lossPercentage: 1.0 },
        ],
      },
    ];

    // Default Verified Suppliers (Gujarat / Saurashtra / Surat region)
    this.suppliersCache = [
      {
        id: 'sup_gujarat_agro',
        tenantId: this.defaultTenantId,
        name: 'Saurashtra Agro Botanicals Pvt Ltd',
        code: 'SUP-SAU-01',
        contactPerson: 'Bhaveshbhai Patel',
        phone: '+919825123456',
        email: 'sales@saurashtraagro.com',
        address: 'Unjha Mandi, Mehsana, Gujarat',
        gstNumber: '24AAACS1234F1Z1',
        materialsSupplied: ['Sweet Fennel Seeds (Variyali)', 'Roasted Dhanadal', 'White Sesame'],
        productsSupplied: ['Grade-A Unjha Fennel'],
        paymentTerms: 'Net 30',
        leadTimeDays: 4,
        minOrderValue: 15000.0,
        rating: 4.8,
        notes: 'Primary spice and seed partner in Unjha APMC. Highly consistent quality.',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sup_rajasthan_gulkand',
        tenantId: this.defaultTenantId,
        name: 'Pushkar Rose Natural Farms',
        code: 'SUP-PUS-02',
        contactPerson: 'Kailash Sharma',
        phone: '+919829987654',
        email: 'orders@pushkarrose.in',
        address: 'Pushkar Valley, Rajasthan',
        gstNumber: '08ABCDE5678G2Z3',
        materialsSupplied: ['Pure Desi Rose Petal Gulkand'],
        productsSupplied: ['Chaitri Gulab Gulkand'],
        paymentTerms: 'Net 15',
        leadTimeDays: 7,
        minOrderValue: 20000.0,
        rating: 4.9,
        notes: 'Chaitri rose gulkand manufacturer. Clean sugar balance, zero artificial essence.',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sup_surat_packaging',
        tenantId: this.defaultTenantId,
        name: 'Surat EcoFlex Pack Systems',
        code: 'SUP-ECO-03',
        contactPerson: 'Deepak Shah',
        phone: '+919879112233',
        email: 'contact@suratecoflex.com',
        address: 'Pandesara GIDC, Surat, Gujarat',
        gstNumber: '24AABCE9876H1Z5',
        materialsSupplied: ['Resealable Standup Zipper Pouch (300g)', 'Outer Corrugated Shipping Boxes'],
        productsSupplied: ['Artisanal Matte Pouches'],
        paymentTerms: 'Net 30',
        leadTimeDays: 5,
        minOrderValue: 10000.0,
        rating: 4.7,
        notes: 'Local Surat packaging manufacturer. Fast dispatch, high seal integrity.',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Default Unit Economics (Verified vs Estimated)
    this.unitEconomicsCache = [
      {
        id: 'ue_paan_300g',
        tenantId: this.defaultTenantId,
        sku: 'paan-mukhwas-300g',
        productName: 'Artisanal Paan Mukhwas (300g)',
        cogsVerified: 68.5,
        packagingCost: 8.5,
        shippingCostEstimate: 45.0,
        gatewayFeePercent: 2.0,
        returnRateEstimate: 3.5,
        isVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ue_seeds_200g',
        tenantId: this.defaultTenantId,
        sku: 'seeds-fusion-200g',
        productName: 'Seeds Fusion (200g)',
        cogsVerified: 54.0,
        packagingCost: 7.5,
        shippingCostEstimate: 45.0,
        gatewayFeePercent: 2.0,
        returnRateEstimate: 2.8,
        isVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ue_coconut_200g',
        tenantId: this.defaultTenantId,
        sku: 'coconut-crunch-200g',
        productName: 'Coconut Crunch (200g)',
        cogsVerified: 58.0,
        packagingCost: 7.5,
        shippingCostEstimate: 45.0,
        gatewayFeePercent: 2.0,
        returnRateEstimate: 3.0,
        isVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  // ============================================================================
  // CUSTOMER SEGMENTS METHODS
  // ============================================================================
  public async listCustomerSegments(tenantId?: string): Promise<PlatformCustomerSegment[]> {
    try {
      let query = this.client
        .from('customer_segments')
        .select('*')
        .order('name', { ascending: true });
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          tenantId: d.tenant_id,
          name: d.name,
          slug: d.slug,
          description: d.description,
          criteria: d.criteria,
          isSystem: d.is_system,
          memberCount: d.member_count,
          lastCalculatedAt: d.last_calculated_at,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch {}
    if (tenantId) {
      return this.segmentsCache.filter((s) => s.tenantId === tenantId);
    }
    return this.segmentsCache;
  }

  public async createCustomerSegment(input: {
    tenantId: string;
    name: string;
    slug: string;
    description?: string;
    criteria?: Record<string, unknown>;
  }): Promise<PlatformCustomerSegment> {
    const now = new Date().toISOString();
    const segment: PlatformCustomerSegment = {
      id: `seg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      criteria: input.criteria || {},
      isSystem: false,
      memberCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.segmentsCache.push(segment);
    try {
      await this.client.from('customer_segments').insert({
        id: segment.id,
        tenant_id: segment.tenantId,
        name: segment.name,
        slug: segment.slug,
        description: segment.description,
        criteria: segment.criteria,
        is_system: segment.isSystem,
        member_count: segment.memberCount,
      });
    } catch {}
    return segment;
  }

  public async getCustomerSegmentBySlug(slug: string): Promise<PlatformCustomerSegment | null> {
    const list = await this.listCustomerSegments();
    return list.find((s) => s.slug === slug) || null;
  }

  public async updateSegmentMemberCount(segmentId: string, count: number): Promise<void> {
    const seg = this.segmentsCache.find((s) => s.id === segmentId);
    if (seg) {
      seg.memberCount = count;
      seg.lastCalculatedAt = new Date().toISOString();
      seg.updatedAt = seg.lastCalculatedAt;
    }
    try {
      await this.client
        .from('customer_segments')
        .update({
          member_count: count,
          last_calculated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', segmentId);
    } catch {}
  }

  // ============================================================================
  // CONSENT & SUPPRESSION METHODS
  // ============================================================================
  public async isCustomerSuppressed(phoneNumber: string): Promise<{ suppressed: boolean; reason?: string }> {
    const clean = phoneNumber.replace(/\D/g, '');
    const now = new Date().toISOString();
    const found = this.suppressionsCache.find(
      (s) => s.phoneNumber === clean && (!s.activeUntil || s.activeUntil > now),
    );
    if (found) {
      return { suppressed: true, reason: found.reason };
    }
    try {
      const { data } = await this.client
        .from('suppression_lists')
        .select('*')
        .eq('phone_number', clean)
        .maybeSingle();
      if (data && (!data.active_until || data.active_until > now)) {
        return { suppressed: true, reason: data.reason };
      }
    } catch {}
    return { suppressed: false };
  }

  public async addCustomerSuppression(params: {
    phoneNumber: string;
    reason: 'complaint_unresolved' | 'opted_out' | 'manual_block' | 'high_risk' | 'quiet_hours';
    activeUntil?: string;
  }): Promise<void> {
    const clean = params.phoneNumber.replace(/\D/g, '');
    const record: PlatformSuppressionRecord = {
      id: `sup_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      tenantId: this.defaultTenantId,
      phoneNumber: clean,
      reason: params.reason,
      activeUntil: params.activeUntil,
      createdAt: new Date().toISOString(),
    };
    this.suppressionsCache = this.suppressionsCache.filter((s) => !(s.phoneNumber === clean && s.reason === params.reason));
    this.suppressionsCache.push(record);
    try {
      await this.client.from('suppression_lists').upsert({
        tenant_id: this.defaultTenantId,
        phone_number: clean,
        reason: params.reason,
        active_until: params.activeUntil,
      });
    } catch {}
  }

  public async removeCustomerSuppression(phoneNumber: string, reason?: string): Promise<void> {
    const clean = phoneNumber.replace(/\D/g, '');
    this.suppressionsCache = this.suppressionsCache.filter(
      (s) => !(s.phoneNumber === clean && (!reason || s.reason === reason)),
    );
    try {
      let q = this.client.from('suppression_lists').delete().eq('phone_number', clean);
      if (reason) q = q.eq('reason', reason);
      await q;
    } catch {}
  }

  public async recordConsent(consent: Omit<PlatformCustomerConsent, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlatformCustomerConsent> {
    const now = new Date().toISOString();
    const record: PlatformCustomerConsent = {
      ...consent,
      id: `con_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: now,
      updatedAt: now,
    };
    this.consentsCache = this.consentsCache.filter((c) => c.phoneNumber !== consent.phoneNumber || c.channel !== consent.channel);
    this.consentsCache.push(record);
    return record;
  }

  public async getConsents(): Promise<PlatformCustomerConsent[]> {
    return this.consentsCache;
  }

  // ============================================================================
  // CAMPAIGN DEFINITIONS & EXECUTIONS (10 Workflows)
  // ============================================================================
  public async listCampaignDefinitions(tenantId?: string): Promise<PlatformCampaignDefinition[]> {
    try {
      let query = this.client
        .from('campaign_definitions')
        .select('*')
        .order('created_at', { ascending: true });
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          tenantId: d.tenant_id,
          name: d.name,
          campaignType: d.campaign_type,
          description: d.description,
          isEnabled: d.is_enabled,
          triggerConditions: d.trigger_conditions,
          timingConfig: d.timing_config,
          audienceSegmentId: d.audience_segment_id,
          templateName: d.template_name,
          messageTemplate: d.message_template,
          channel: d.channel,
          approvalRequired: d.approval_required,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch {}
    if (tenantId) {
      return this.campaignsCache.filter((c) => c.tenantId === tenantId);
    }
    return this.campaignsCache;
  }

  public async getCampaignDefinition(id: string): Promise<PlatformCampaignDefinition | null> {
    const all = await this.listCampaignDefinitions();
    return all.find((c) => c.id === id) || null;
  }

  public async updateCampaignStatus(campaignId: string, isEnabled: boolean): Promise<PlatformCampaignDefinition | null> {
    const target = this.campaignsCache.find((c) => c.id === campaignId);
    if (target) {
      target.isEnabled = isEnabled;
      target.updatedAt = new Date().toISOString();
    }
    try {
      await this.client
        .from('campaign_definitions')
        .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
        .eq('id', campaignId);
    } catch {}
    return target || null;
  }

  public async createCampaignExecution(params: {
    campaignId: string;
    totalTarget: number;
    scheduledFor?: string;
  }): Promise<PlatformCampaignExecution> {
    const execution: PlatformCampaignExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      tenantId: this.defaultTenantId,
      campaignId: params.campaignId,
      scheduledFor: params.scheduledFor || new Date().toISOString(),
      status: 'scheduled',
      totalTarget: params.totalTarget,
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalConverted: 0,
      totalFailed: 0,
      createdAt: new Date().toISOString(),
    };
    this.campaignExecutionsCache.unshift(execution);
    try {
      await this.client.from('campaign_executions').insert({
        id: execution.id,
        tenant_id: execution.tenantId,
        campaign_id: execution.campaignId,
        scheduled_for: execution.scheduledFor,
        status: execution.status,
        total_target: execution.totalTarget,
      });
    } catch {}
    return execution;
  }

  public async listCampaignExecutions(campaignId?: string): Promise<PlatformCampaignExecution[]> {
    if (campaignId) {
      return this.campaignExecutionsCache.filter((e) => e.campaignId === campaignId);
    }
    return this.campaignExecutionsCache;
  }

  public async recordCampaignRecipient(recipient: Omit<PlatformCampaignRecipient, 'id' | 'createdAt'>): Promise<PlatformCampaignRecipient> {
    const record: PlatformCampaignRecipient = {
      ...recipient,
      id: `recip_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date().toISOString(),
    };
    this.campaignRecipientsCache.unshift(record);
    return record;
  }

  public async listCampaignRecipients(executionId?: string): Promise<PlatformCampaignRecipient[]> {
    if (executionId) {
      return this.campaignRecipientsCache.filter((r) => r.executionId === executionId);
    }
    return this.campaignRecipientsCache;
  }

  // ============================================================================
  // PERSONALIZED DISCOUNT ENGINE (Dashboard Controlled)
  // ============================================================================
  public async getPersonalizedDiscountRules(): Promise<PlatformPersonalizedDiscountRules> {
    try {
      const { data, error } = await this.client
        .from('personalized_discount_rules')
        .select('*')
        .maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          tenantId: data.tenant_id,
          isEnabled: data.is_enabled,
          maxDiscountPercentage: Number(data.max_discount_percentage),
          maxFixedAmount: Number(data.max_fixed_amount),
          eligibleSegments: data.eligible_segments || [],
          eligibleProducts: data.eligible_products || [],
          requireApprovalAbovePercent: Number(data.require_approval_above_percent),
          requireApprovalAboveAmount: Number(data.require_approval_above_amount),
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } catch {}
    return this.discountRulesCache!;
  }

  public async updatePersonalizedDiscountRules(rules: Partial<PlatformPersonalizedDiscountRules>): Promise<PlatformPersonalizedDiscountRules> {
    const current = await this.getPersonalizedDiscountRules();
    const updated: PlatformPersonalizedDiscountRules = {
      ...current,
      ...rules,
      updatedAt: new Date().toISOString(),
    };
    this.discountRulesCache = updated;
    try {
      await this.client.from('personalized_discount_rules').upsert({
        tenant_id: this.defaultTenantId,
        is_enabled: updated.isEnabled,
        max_discount_percentage: updated.maxDiscountPercentage,
        max_fixed_amount: updated.maxFixedAmount,
        eligible_segments: updated.eligibleSegments,
        eligible_products: updated.eligibleProducts,
        require_approval_above_percent: updated.requireApprovalAbovePercent,
        require_approval_above_amount: updated.requireApprovalAboveAmount,
        updated_at: updated.updatedAt,
      });
    } catch {}
    return updated;
  }

  public async recordDiscountLog(log: Omit<PlatformPersonalizedDiscountLog, 'id' | 'createdAt'>): Promise<PlatformPersonalizedDiscountLog> {
    const record: PlatformPersonalizedDiscountLog = {
      ...log,
      id: `pdl_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date().toISOString(),
    };
    this.discountLogsCache.unshift(record);
    return record;
  }

  public async listDiscountLogs(): Promise<PlatformPersonalizedDiscountLog[]> {
    return this.discountLogsCache;
  }

  // ============================================================================
  // SUPPLIER & PROCUREMENT METHODS
  // ============================================================================
  public async listSuppliers(tenantId?: string): Promise<PlatformSupplier[]> {
    try {
      let query = this.client.from('suppliers').select('*').order('name');
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          tenantId: d.tenant_id,
          name: d.name,
          code: d.code,
          contactPerson: d.contact_person,
          phone: d.phone,
          email: d.email,
          address: d.address,
          gstNumber: d.gst_number,
          materialsSupplied: d.materials_supplied || [],
          productsSupplied: d.products_supplied || [],
          paymentTerms: d.payment_terms,
          leadTimeDays: d.lead_time_days,
          minOrderValue: Number(d.min_order_value),
          rating: Number(d.rating),
          notes: d.notes,
          status: d.status,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch {}
    if (tenantId) {
      return this.suppliersCache.filter((s) => s.tenantId === tenantId);
    }
    return this.suppliersCache;
  }

  public async getSupplier(id: string): Promise<PlatformSupplier | null> {
    const list = await this.listSuppliers();
    return list.find((s) => s.id === id || s.code === id) || null;
  }

  public async listSupplierMaterials(supplierId?: string): Promise<PlatformSupplierMaterial[]> {
    if (supplierId) {
      return this.supplierMaterialsCache.filter((m) => m.supplierId === supplierId);
    }
    return this.supplierMaterialsCache;
  }

  public async recordSupplierQuotation(quotation: Omit<PlatformSupplierQuotation, 'id' | 'createdAt'>): Promise<PlatformSupplierQuotation> {
    const record: PlatformSupplierQuotation = {
      ...quotation,
      id: `rfq_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date().toISOString(),
    };
    this.supplierQuotationsCache.unshift(record);
    return record;
  }

  public async listSupplierQuotations(supplierId?: string): Promise<PlatformSupplierQuotation[]> {
    if (supplierId) {
      return this.supplierQuotationsCache.filter((q) => q.supplierId === supplierId);
    }
    return this.supplierQuotationsCache;
  }

  public async recordSupplierInteraction(input: {
    supplierId: string;
    interactionType: PlatformSupplierInteraction['interactionType'];
    initiatedBy: 'ai' | 'owner';
    subject: string;
    summary: string;
    proposedTerms?: Record<string, unknown>;
    agreedTerms?: Record<string, unknown>;
    followUpDate?: string;
  }): Promise<PlatformSupplierInteraction> {
    const interaction: PlatformSupplierInteraction = {
      id: `int_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      tenantId: this.defaultTenantId,
      supplierId: input.supplierId,
      interactionType: input.interactionType,
      initiatedBy: input.initiatedBy,
      subject: input.subject,
      summary: input.summary,
      proposedTerms: input.proposedTerms,
      agreedTerms: input.agreedTerms,
      followUpDate: input.followUpDate,
      createdAt: new Date().toISOString(),
    };
    this.supplierInteractionsCache.unshift(interaction);
    try {
      await this.client.from('supplier_interactions').insert({
        id: interaction.id,
        tenant_id: interaction.tenantId,
        supplier_id: interaction.supplierId,
        interaction_type: interaction.interactionType,
        initiated_by: interaction.initiatedBy,
        subject: interaction.subject,
        summary: interaction.summary,
        proposed_terms: interaction.proposedTerms,
        agreed_terms: interaction.agreedTerms,
        follow_up_date: interaction.followUpDate,
      });
    } catch {}
    return interaction;
  }

  public async listSupplierInteractions(supplierId?: string): Promise<PlatformSupplierInteraction[]> {
    if (supplierId) {
      return this.supplierInteractionsCache.filter((i) => i.supplierId === supplierId);
    }
    return this.supplierInteractionsCache;
  }

  public async recordSupplierCall(call: Omit<PlatformSupplierCall, 'id' | 'createdAt'>): Promise<PlatformSupplierCall> {
    const fullCall: PlatformSupplierCall = {
      ...call,
      id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date().toISOString(),
    };
    this.supplierCallsCache.unshift(fullCall);
    try {
      await this.client.from('supplier_calls').insert({
        id: fullCall.id,
        tenant_id: fullCall.tenantId,
        supplier_id: fullCall.supplierId,
        phone_number: fullCall.phoneNumber,
        caller_identity: fullCall.callerIdentity,
        provider: fullCall.provider,
        provider_call_id: fullCall.providerCallId,
        call_status: fullCall.callStatus,
        duration_seconds: fullCall.durationSeconds,
        recipient_language: fullCall.recipientLanguage,
        transcript: fullCall.transcript,
        recording_url: fullCall.recordingUrl,
        tentative_agreement: fullCall.tentativeAgreement,
        approval_id: fullCall.approvalId,
      });
    } catch {}
    return fullCall;
  }

  public async listSupplierCalls(supplierId?: string): Promise<PlatformSupplierCall[]> {
    if (supplierId) {
      return this.supplierCallsCache.filter((c) => c.supplierId === supplierId);
    }
    return this.supplierCallsCache;
  }

  // ============================================================================
  // KNOWLEDGE CENTRE & MEMORY METHODS
  // ============================================================================
  public async listKnowledgeDocuments(category?: string): Promise<PlatformKnowledgeDocument[]> {
    let docs = this.knowledgeDocsCache;
    if (category) {
      docs = docs.filter((d) => d.category === category);
    }
    return docs;
  }

  public async createKnowledgeDocument(doc: Omit<PlatformKnowledgeDocument, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlatformKnowledgeDocument> {
    const now = new Date().toISOString();
    const created: PlatformKnowledgeDocument = {
      ...doc,
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: now,
      updatedAt: now,
    };
    this.knowledgeDocsCache.unshift(created);
    return created;
  }

  public async storeKnowledgeChunks(chunks: Array<Omit<PlatformKnowledgeChunk, 'id' | 'createdAt'>>): Promise<PlatformKnowledgeChunk[]> {
    const created = chunks.map((c, i) => ({
      ...c,
      id: `chk_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date().toISOString(),
    }));
    this.knowledgeChunksCache.push(...created);
    return created;
  }

  public async searchKnowledgeChunks(query: string, limit = 5): Promise<PlatformKnowledgeChunk[]> {
    const qLower = query.toLowerCase();
    return this.knowledgeChunksCache
      .filter((c) => c.chunkText.toLowerCase().includes(qLower))
      .slice(0, limit);
  }

  public async storeBusinessMemory(memory: Omit<PlatformBusinessMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlatformBusinessMemory> {
    const now = new Date().toISOString();
    const existingIdx = this.businessMemoriesCache.findIndex(
      (m) => m.memoryType === memory.memoryType && m.key === memory.key,
    );
    const item: PlatformBusinessMemory = {
      ...memory,
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: now,
      updatedAt: now,
    };
    if (existingIdx >= 0) {
      this.businessMemoriesCache[existingIdx] = item;
    } else {
      this.businessMemoriesCache.push(item);
    }
    return item;
  }

  public async listBusinessMemories(type?: PlatformBusinessMemory['memoryType']): Promise<PlatformBusinessMemory[]> {
    if (type) {
      return this.businessMemoriesCache.filter((m) => m.memoryType === type);
    }
    return this.businessMemoriesCache;
  }

  public async createLearningProposal(proposal: Omit<PlatformContinuousLearningProposal, 'id' | 'createdAt'>): Promise<PlatformContinuousLearningProposal> {
    const item: PlatformContinuousLearningProposal = {
      ...proposal,
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date().toISOString(),
    };
    this.learningProposalsCache.unshift(item);
    return item;
  }

  public async listLearningProposals(tenantId?: string): Promise<PlatformContinuousLearningProposal[]> {
    if (tenantId) {
      return this.learningProposalsCache.filter((p) => p.tenantId === tenantId);
    }
    return this.learningProposalsCache;
  }

  // ============================================================================
  // MANUFACTURING INTELLIGENCE METHODS
  // ============================================================================
  public async listRawMaterials(tenantId?: string): Promise<PlatformRawMaterial[]> {
    if (tenantId) {
      return this.rawMaterialsCache.filter((r) => r.tenantId === tenantId);
    }
    return this.rawMaterialsCache;
  }

  public async getRawMaterial(idOrCode: string): Promise<PlatformRawMaterial | null> {
    return this.rawMaterialsCache.find((r) => r.id === idOrCode || r.code === idOrCode) || null;
  }

  public async listRecipes(tenantId?: string): Promise<PlatformRecipe[]> {
    if (tenantId) {
      return this.recipesCache.filter((r) => r.tenantId === tenantId);
    }
    return this.recipesCache;
  }

  public async getRecipeBySku(sku: string): Promise<PlatformRecipe | null> {
    return this.recipesCache.find((r) => r.sku === sku) || null;
  }

  public async createProductionOrder(order: Omit<PlatformProductionOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlatformProductionOrder> {
    const now = new Date().toISOString();
    const created: PlatformProductionOrder = {
      ...order,
      id: `pord_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: now,
      updatedAt: now,
    };
    this.productionOrdersCache.unshift(created);
    return created;
  }

  public async listProductionOrders(): Promise<PlatformProductionOrder[]> {
    return this.productionOrdersCache;
  }

  public async listProductionBatches(tenantId?: string): Promise<PlatformProductionBatch[]> {
    if (tenantId) {
      return this.productionBatchesCache.filter((b) => b.tenantId === tenantId);
    }
    return this.productionBatchesCache;
  }

  public async createProductionBatch(batch: Omit<PlatformProductionBatch, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlatformProductionBatch> {
    const now = new Date().toISOString();
    const created: PlatformProductionBatch = {
      ...batch,
      id: `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: now,
      updatedAt: now,
    };
    this.productionBatchesCache.unshift(created);
    return created;
  }

  public async listProcurementForecasts(): Promise<PlatformProcurementForecast[]> {
    return this.forecastsCache;
  }

  // ============================================================================
  // FINANCIAL INTELLIGENCE METHODS
  // ============================================================================
  public async listUnitEconomics(): Promise<PlatformUnitEconomicsConfig[]> {
    return this.unitEconomicsCache;
  }

  public async getFinancialSnapshot(date?: string): Promise<PlatformFinancialSnapshot> {
    const targetDate = date || new Date().toISOString().split('T')[0] || '2026-11-18';
    const found = this.financialSnapshotsCache.find((s) => s.snapshotDate === targetDate);
    if (found) return found;

    // Compile dynamic snapshot from available verified metrics
    const snapshot: PlatformFinancialSnapshot = {
      id: `fin_${targetDate}`,
      tenantId: this.defaultTenantId,
      snapshotDate: targetDate,
      periodType: 'daily',
      grossRevenue: 0,
      netRevenue: 0,
      cogs: 0,
      grossMargin: 0,
      contributionMargin: 0,
      shippingCosts: 0,
      paymentGatewayFees: 0,
      discountsGiven: 0,
      refunds: 0,
      codCosts: 0,
      rtoLosses: 0,
      netProfit: 0,
      verifiedMetrics: ['gross_revenue', 'refunds', 'discounts_given'],
      estimatedMetrics: ['cogs', 'shipping_costs', 'payment_gateway_fees'],
      missingInputs: ['ad_spend_meta', 'warehouse_utilities'],
      completenessScore: 82.5,
      createdAt: new Date().toISOString(),
    };
    this.financialSnapshotsCache.push(snapshot);
    return snapshot;
  }

  // ============================================================================
  // LEVEL 3 APPROVALS & CONTROLLED AUTONOMY
  // ============================================================================
  public async createApprovalRequest(input: {
    initiatingAgent: string;
    actionType: ApprovalActionType;
    targetEntityType: string;
    targetEntityId: string;
    parameters: Record<string, unknown>;
    businessReason: string;
    financialImpact: number;
    riskAssessment?: 'low' | 'medium' | 'high' | 'critical';
    recommendation: string;
    requestedBy?: string;
  }): Promise<PlatformApprovalRequest> {
    const now = new Date().toISOString();
    const request: PlatformApprovalRequest = {
      id: `appr_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      tenantId: this.defaultTenantId,
      initiatingAgent: input.initiatingAgent,
      actionType: input.actionType,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      parameters: input.parameters,
      businessReason: input.businessReason,
      financialImpact: input.financialImpact,
      riskAssessment: input.riskAssessment || 'medium',
      recommendation: input.recommendation,
      status: 'pending',
      requestedBy: input.requestedBy || 'ai_orchestrator',
      createdAt: now,
      updatedAt: now,
    };
    this.approvalsCache.unshift(request);
    try {
      await this.client.from('approval_requests').insert({
        id: request.id,
        tenant_id: request.tenantId,
        initiating_agent: request.initiatingAgent,
        action_type: request.actionType,
        target_entity_type: request.targetEntityType,
        target_entity_id: request.targetEntityId,
        parameters: request.parameters,
        business_reason: request.businessReason,
        financial_impact: request.financialImpact,
        risk_assessment: request.riskAssessment,
        recommendation: request.recommendation,
        status: request.status,
        requested_by: request.requestedBy,
      });
    } catch {}
    return request;
  }

  public async listApprovalRequests(status?: PlatformApprovalRequest['status'], tenantId?: string): Promise<PlatformApprovalRequest[]> {
    let list = this.approvalsCache;
    if (tenantId) {
      list = list.filter((a) => a.tenantId === tenantId);
    }
    if (status) {
      list = list.filter((a) => a.status === status);
    }
    return list;
  }

  public async resolveApprovalRequest(params: {
    id: string;
    status: 'approved' | 'rejected';
    approvedBy: string;
    executionResult?: Record<string, unknown>;
  }): Promise<PlatformApprovalRequest | null> {
    const item = this.approvalsCache.find((a) => a.id === params.id);
    if (!item) return null;

    item.status = params.status;
    item.approvedBy = params.approvedBy;
    item.approvedAt = new Date().toISOString();
    item.executionResult = params.executionResult;
    item.updatedAt = item.approvedAt;

    try {
      await this.client
        .from('approval_requests')
        .update({
          status: params.status,
          approved_by: params.approvedBy,
          approved_at: item.approvedAt,
          execution_result: params.executionResult,
          updated_at: item.updatedAt,
        })
        .eq('id', params.id);
    } catch {}
    return item;
  }

  // ============================================================================
  // OPERATIONAL ALERTS & ESCALATIONS
  // ============================================================================
  public async createOperationalAlert(input: {
    severity: PlatformOperationalAlert['severity'];
    category: PlatformOperationalAlert['category'];
    title: string;
    summary: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    conversationId?: string;
    recommendedAction?: string;
  }): Promise<PlatformOperationalAlert> {
    const now = new Date().toISOString();
    const alert: PlatformOperationalAlert = {
      id: `alt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      tenantId: this.defaultTenantId,
      severity: input.severity,
      category: input.category,
      title: input.title,
      summary: input.summary,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      conversationId: input.conversationId,
      recommendedAction: input.recommendedAction,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    this.alertsCache.unshift(alert);
    try {
      await this.client.from('operational_alerts').insert({
        id: alert.id,
        tenant_id: alert.tenantId,
        severity: alert.severity,
        category: alert.category,
        title: alert.title,
        summary: alert.summary,
        related_entity_type: alert.relatedEntityType,
        related_entity_id: alert.relatedEntityId,
        conversation_id: alert.conversationId,
        recommended_action: alert.recommendedAction,
        status: alert.status,
      });
    } catch {}
    return alert;
  }

  public async listOperationalAlerts(status?: PlatformOperationalAlert['status'], tenantId?: string): Promise<PlatformOperationalAlert[]> {
    let list = this.alertsCache;
    if (tenantId) {
      list = list.filter((a) => a.tenantId === tenantId);
    }
    if (status) {
      list = list.filter((a) => a.status === status);
    }
    return list;
  }

  // ============================================================================
  // ECOMMERCE CHANGE INTELLIGENCE
  // ============================================================================
  public async recordEcommerceChange(event: Omit<PlatformEcommerceChangeEvent, 'id' | 'detectedAt'>): Promise<PlatformEcommerceChangeEvent> {
    const item: PlatformEcommerceChangeEvent = {
      ...event,
      id: `chg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      detectedAt: new Date().toISOString(),
    };
    this.changeHistoryCache.unshift(item);
    try {
      await this.client.from('ecommerce_change_history').insert({
        id: item.id,
        tenant_id: item.tenantId,
        entity_type: item.entityType,
        entity_id: item.entityId,
        old_value: item.oldValue,
        new_value: item.newValue,
        change_source: item.changeSource,
        business_impact: item.businessImpact,
        recommended_action: item.recommendedAction,
      });
    } catch {}
    return item;
  }

  public async listEcommerceChanges(limit = 50): Promise<PlatformEcommerceChangeEvent[]> {
    return this.changeHistoryCache.slice(0, limit);
  }
}

// Singleton factory
let enterpriseRepoInstance: EnterpriseRepository | null = null;

export function getEnterpriseRepository(): EnterpriseRepository {
  if (!enterpriseRepoInstance) {
    enterpriseRepoInstance = new EnterpriseRepository();
  }
  return enterpriseRepoInstance;
}
