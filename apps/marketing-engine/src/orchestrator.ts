import { createLogger } from '@whatsapp-platform/shared';
import {
  createEcommerceAdapter,
  EcommerceAdapter,
  MarketingSegmentCandidate,
} from '@whatsapp-platform/ecommerce-adapter';
import { createAiProvider, AiProvider } from '@whatsapp-platform/ai';
import { createWhatsAppProvider, WhatsAppProvider } from '@whatsapp-platform/whatsapp';
import {
  getPlatformRepository,
  PlatformRepository,
  getEnterpriseRepository,
  EnterpriseRepository,
} from '@whatsapp-platform/database';
import { getBusinessProfile, BusinessProfile, formatTemplate } from '@whatsapp-platform/config';

const logger = createLogger({ name: 'marketing-orchestrator' });

export interface MarketingCampaignReport {
  totalCandidates: number;
  dispatchedCount: number;
  skippedCount: number;
  details: Array<{
    phoneNumber: string;
    segment: string;
    status: 'sent' | 'skipped' | 'failed';
    preview?: string;
  }>;
}

export interface MarketingOrchestratorOptions {
  ecommerceAdapter?: EcommerceAdapter;
  aiProvider?: AiProvider;
  whatsappProvider?: WhatsAppProvider;
  platformRepository?: PlatformRepository;
  enterpriseRepository?: EnterpriseRepository;
  businessProfile?: BusinessProfile;
}

export class MarketingOrchestrator {
  private ecommerceAdapter: EcommerceAdapter;
  private aiProvider: AiProvider;
  private whatsappProvider: WhatsAppProvider;
  private platformRepo: PlatformRepository;
  private enterpriseRepo: EnterpriseRepository;
  private businessProfile: BusinessProfile;

  private customBusinessProfileProvided: boolean = false;

  constructor(options: MarketingOrchestratorOptions = {}) {
    this.ecommerceAdapter = options.ecommerceAdapter || createEcommerceAdapter();
    this.aiProvider = options.aiProvider || createAiProvider();
    this.whatsappProvider = options.whatsappProvider || createWhatsAppProvider();
    this.platformRepo = options.platformRepository || getPlatformRepository();
    this.enterpriseRepo = options.enterpriseRepository || getEnterpriseRepository();
    if (options.businessProfile) {
      this.customBusinessProfileProvided = true;
      this.businessProfile = options.businessProfile;
    } else {
      this.businessProfile = getBusinessProfile();
    }
  }

  public reloadBusinessProfile(newProfile?: BusinessProfile): void {
    if (newProfile) {
      this.customBusinessProfileProvided = true;
      this.businessProfile = newProfile;
    } else {
      this.customBusinessProfileProvided = false;
      this.businessProfile = getBusinessProfile();
    }
  }

  /**
   * Evaluates audience segments and generates tailored WhatsApp content via Gemini AI
   */
  public async runScheduledCampaign(segmentFilter?: string): Promise<MarketingCampaignReport> {
    logger.info({ segmentFilter }, 'Starting automated AI marketing campaign evaluation...');
    if (!this.customBusinessProfileProvided) {
      this.businessProfile = getBusinessProfile();
    }

    const allCandidates = await this.ecommerceAdapter.getMarketingCandidates();
    const candidates = segmentFilter
      ? allCandidates.filter((c) => c.segmentType.toLowerCase() === segmentFilter.toLowerCase())
      : allCandidates;
    const activeProducts = await this.ecommerceAdapter.getAllActiveProducts();

    const report: MarketingCampaignReport = {
      totalCandidates: candidates.length,
      dispatchedCount: 0,
      skippedCount: 0,
      details: [],
    };

    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    for (const candidate of candidates) {
      const phone = candidate.customer.phoneNumber;
      if (!phone) {
        report.skippedCount++;
        continue;
      }

      // Check customer opt-out status
      if (typeof (this.platformRepo as any).isCustomerOptedOut === 'function') {
        const isOptedOut = await (this.platformRepo as any).isCustomerOptedOut(phone);
        if (isOptedOut) {
          logger.info(
            { phone },
            'Skipping marketing candidate due to active opt-out status (STOP compliance)',
          );
          report.skippedCount++;
          report.details.push({
            phoneNumber: phone,
            segment: candidate.segmentType,
            status: 'skipped',
          });
          continue;
        }
      }

      // Check suppression list (e.g. open unresolved complaint, high risk, manual block)
      const suppression = await this.enterpriseRepo.isCustomerSuppressed(phone);
      if (suppression.suppressed) {
        logger.info(
          { phone, reason: suppression.reason },
          'Skipping marketing candidate due to active customer suppression entry',
        );
        report.skippedCount++;
        report.details.push({
          phoneNumber: phone,
          segment: candidate.segmentType,
          status: 'skipped',
        });
        continue;
      }

      // Check persistent message fatigue from database
      const lastSentTime = await this.platformRepo.getLastMarketingDispatchTime(phone);
      if (lastSentTime && now - lastSentTime < fourteenDaysMs) {
        logger.debug(
          { phone },
          'Skipping candidate due to recent marketing contact (fatigue guardrail)',
        );
        report.skippedCount++;
        report.details.push({
          phoneNumber: phone,
          segment: candidate.segmentType,
          status: 'skipped',
        });
        continue;
      }

      // Generate AI-tailored marketing message
      try {
        const tailoredMessage = await this.generateTailoredCopy(candidate, activeProducts);

        await this.whatsappProvider.sendMessage({
          type: 'text',
          to: phone,
          body: tailoredMessage,
        });

        // Persist dispatch in database
        await this.platformRepo.logMarketingDispatch(
          phone,
          candidate.segmentType,
          tailoredMessage,
          'sent',
        );

        report.dispatchedCount++;
        report.details.push({
          phoneNumber: phone,
          segment: candidate.segmentType,
          status: 'sent',
          preview: tailoredMessage.slice(0, 80) + '...',
        });

        logger.info(
          { phone, segment: candidate.segmentType },
          'Successfully generated and dispatched AI marketing message',
        );

        // Anti-burst pacing throttle between marketing dispatches to protect Meta sender quality score
        if (process.env.NODE_ENV !== 'test') {
          await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 600));
        }
      } catch (err) {
        logger.error({ err, phone }, 'Failed generating or sending marketing message');
        await this.platformRepo.logMarketingDispatch(
          phone,
          candidate.segmentType,
          err instanceof Error ? err.message : 'Failed',
          'failed',
        );
        report.details.push({
          phoneNumber: phone,
          segment: candidate.segmentType,
          status: 'failed',
        });
      }
    }

    logger.info(
      {
        total: report.totalCandidates,
        dispatched: report.dispatchedCount,
        skipped: report.skippedCount,
      },
      'Completed automated AI marketing campaign run',
    );

    return report;
  }

  private async generateTailoredCopy(
    candidate: MarketingSegmentCandidate,
    products: Array<{ title: string; category?: string }>,
  ): Promise<string> {
    const customerName = candidate.customer.firstName || 'Friend';
    const productNames = products.map((p) => p.title).join(', ');
    const campaigns = this.businessProfile.marketingCampaigns;

    // Check website Supabase database for verified active promotions
    const dbPromo = await this.ecommerceAdapter.getActivePromotion().catch(() => null);
    const isPromoEnabled = Boolean(
      dbPromo ||
      (this.businessProfile.promotions?.enabled && this.businessProfile.promotions?.activePromo),
    );
    const activeDiscountCode =
      dbPromo?.code ||
      (isPromoEnabled ? this.businessProfile.promotions?.activePromo?.code || '' : '');
    const promoDescription =
      dbPromo?.terms ||
      this.businessProfile.promotions?.activePromo?.description ||
      `${dbPromo?.discountValue || 10}% off`;

    let promptContext = '';
    const segUpper = candidate.segmentType.toUpperCase();
    switch (segUpper) {
      case 'FIRST_ORDER_NURTURE':
        promptContext = isPromoEnabled
          ? formatTemplate(campaigns.firstOrderNurture.promptInstruction, {
              brandName: this.businessProfile.brand.name,
              discountCode: activeDiscountCode,
              customerName,
            })
          : `The customer completed their first purchase a week ago. Thank them for supporting ${this.businessProfile.brand.name}, ask how they enjoyed their fresh order, and recommend exploring signature treats without mentioning any discount.`;
        break;
      case 'REPEAT_REPLENISHMENT':
      case 'REPLENISHMENT':
        promptContext = formatTemplate(campaigns.repeatReplenishment.promptInstruction, {
          brandName: this.businessProfile.brand.name,
          customerName,
        });
        break;
      case 'CART_ABANDONED':
      case 'ABANDONED_CART':
        promptContext = formatTemplate(campaigns.cartAbandoned.promptInstruction, {
          brandName: this.businessProfile.brand.name,
          cartItemName: candidate.contextData?.cartItemName || 'their favorite treat',
          customerName,
        });
        break;
      case 'ABANDONED_CHECKOUT':
      case 'CHECKOUT_ABANDONED':
        promptContext = `The customer reached the checkout stage but did not complete the order. Remind them gently about their artisanal digestive treats with free Pan-India shipping on orders ₹699+.`;
        break;
      case 'WIN_BACK':
        promptContext = isPromoEnabled
          ? formatTemplate(campaigns.winBack.promptInstruction, {
              brandName: this.businessProfile.brand.name,
              discountCode: activeDiscountCode,
              customerName,
            })
          : `The customer hasn't ordered in over 60 days. Warmly invite them back to see our newest fresh batches and customer favorites without offering any discounts.`;
        break;
      case 'FESTIVAL':
        promptContext = `Celebrate the festive season with handcrafted mukhwas from Gujarat. Share festive gift hampers and family taster boxes.`;
        break;
      case 'PRODUCT_LAUNCH':
        promptContext = `Introduce our newly launched artisanal treat to VIP food lovers. Emphasize fresh small-batch craftsmanship.`;
        break;
      case 'CROSS_SELL':
        promptContext = `Recommend pairing their favorite Paan Mukhwas with roasted Seeds Fusion or Coconut Crunch for complete after-meal freshness.`;
        break;
      case 'REFERRAL':
        promptContext = `Encourage the customer to share their love for Mintara Bites with friends and family. Give ₹50, get ₹50 rewards.`;
        break;
      case 'LOYALTY_REWARDS':
        promptContext = `Congratulate the customer on their loyalty milestone as a Mintara connoisseur.`;
        break;
      case 'REVIEW_COLLECTION':
        promptContext = `Ask how they enjoyed their recent order and invite them to leave a verified rating or review.`;
        break;
      case 'BIRTHDAY_ANNIVERSARY':
        promptContext = `Send sweet birthday or anniversary celebration greetings with warm wishes from Mintara Bites.`;
        break;
      default:
        promptContext = `Engage the customer with appetizing recommendations of our 100% supari-free artisanal mukhwas treats.`;
        break;
    }

    const websiteUrl =
      this.businessProfile.brand.links?.websiteUrl || this.businessProfile.brand.websiteUrl;

    const promoGuideline = isPromoEnabled
      ? `- Active Promotion: Mention verified code "${activeDiscountCode}" (${promoDescription}).`
      : `- Strict Promotion Policy: Do NOT include, mention, or offer any discount codes, coupons, or promo codes. All orders are priced as shown on website.`;

    const systemPrompt = `You are an expert, witty WhatsApp marketing copywriter for "${this.businessProfile.brand.name}" (${this.businessProfile.brand.location}) — ${this.businessProfile.brand.tagline}.

Guidelines:
- Language: Natural, conversational Hinglish (Hindi written in English script + English) that resonates with urban Indian food lovers and families.
- Length: Max 3-4 short, punchy sentences.
- Tone: Appetizing, playful, witty, warm, non-spammy. Talk like a foodie friend from Surat who loves after-meal digestive treats.
- Format: Clean WhatsApp styling (use *bold* for product names/codes, subtle emojis).
- Include store link: ${websiteUrl}
${promoGuideline}
- Brand Highlights: ${(this.businessProfile.brandHighlights || []).slice(0, 3).join('; ')}`;

    const userPrompt = `Draft a personalized WhatsApp message for:
Customer Name: ${customerName}
Campaign Segment: ${candidate.segmentType}
Instructions: ${promptContext}
Available Products: ${productNames}`;

    const aiRes = await this.aiProvider.generateResponse({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
    });

    return aiRes.content.trim();
  }
}
