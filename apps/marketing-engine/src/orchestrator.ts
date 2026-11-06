import { createLogger } from '@whatsapp-platform/shared';
import {
  createEcommerceAdapter,
  EcommerceAdapter,
  MarketingSegmentCandidate,
} from '@whatsapp-platform/ecommerce-adapter';
import { createAiProvider, AiProvider } from '@whatsapp-platform/ai';
import { createWhatsAppProvider, WhatsAppProvider } from '@whatsapp-platform/whatsapp';
import { getPlatformRepository, PlatformRepository } from '@whatsapp-platform/database';
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
  businessProfile?: BusinessProfile;
}

export class MarketingOrchestrator {
  private ecommerceAdapter: EcommerceAdapter;
  private aiProvider: AiProvider;
  private whatsappProvider: WhatsAppProvider;
  private platformRepo: PlatformRepository;
  private businessProfile: BusinessProfile;

  constructor(options: MarketingOrchestratorOptions = {}) {
    this.ecommerceAdapter = options.ecommerceAdapter || createEcommerceAdapter();
    this.aiProvider = options.aiProvider || createAiProvider();
    this.whatsappProvider = options.whatsappProvider || createWhatsAppProvider();
    this.platformRepo = options.platformRepository || getPlatformRepository();
    this.businessProfile = options.businessProfile || getBusinessProfile();
  }

  /**
   * Evaluates audience segments and generates tailored WhatsApp content via Gemini AI
   */
  public async runScheduledCampaign(): Promise<MarketingCampaignReport> {
    logger.info('Starting automated AI marketing campaign evaluation...');

    const candidates = await this.ecommerceAdapter.getMarketingCandidates();
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

    let promptContext = '';
    switch (candidate.segmentType) {
      case 'FIRST_ORDER_NURTURE':
        promptContext = formatTemplate(campaigns.firstOrderNurture.promptInstruction, {
          brandName: this.businessProfile.brand.name,
          discountCode: campaigns.firstOrderNurture.discountCode,
          customerName,
        });
        break;
      case 'REPEAT_REPLENISHMENT':
        promptContext = formatTemplate(campaigns.repeatReplenishment.promptInstruction, {
          brandName: this.businessProfile.brand.name,
          customerName,
        });
        break;
      case 'CART_ABANDONED':
        promptContext = formatTemplate(campaigns.cartAbandoned.promptInstruction, {
          brandName: this.businessProfile.brand.name,
          cartItemName: candidate.contextData?.cartItemName || 'their favorite treat',
          customerName,
        });
        break;
      case 'WIN_BACK':
        promptContext = formatTemplate(campaigns.winBack.promptInstruction, {
          brandName: this.businessProfile.brand.name,
          discountCode: campaigns.winBack.discountCode,
          customerName,
        });
        break;
    }

    const websiteUrl =
      this.businessProfile.brand.links?.websiteUrl || this.businessProfile.brand.websiteUrl;

    const systemPrompt = `You are an expert, respectful WhatsApp marketing copywriter for "${this.businessProfile.brand.name}" (${this.businessProfile.brand.location}) — ${this.businessProfile.brand.tagline}.

Guidelines:
- Length: Max 3-4 short, punchy sentences.
- Tone: Warm, appetizing, friendly, non-spammy.
- Format: Clean WhatsApp styling (use *bold* for product names/codes, subtle emojis).
- Include store link: ${websiteUrl}
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
