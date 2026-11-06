import { createLogger } from '@whatsapp-platform/shared';
import {
  createEcommerceAdapter,
  EcommerceAdapter,
  EcommerceCustomer,
  EcommerceOrder,
  calculateConsumptionVelocity,
  generatePrefilledCheckoutUrl,
} from '@whatsapp-platform/ecommerce-adapter';
import { createAiProvider, AiProvider, AiChatMessage } from '@whatsapp-platform/ai';
import {
  createWhatsAppProvider,
  WhatsAppProvider,
  WhatsAppButtonAction,
} from '@whatsapp-platform/whatsapp';
import { getPlatformRepository, PlatformRepository } from '@whatsapp-platform/database';
import {
  getConfig,
  getBusinessProfile,
  buildBusinessSystemPrompt,
  formatTemplate,
  BusinessProfile,
} from '@whatsapp-platform/config';

const logger = createLogger({ name: 'support-orchestrator' });

export interface IncomingMessagePayload {
  from: string;
  messageId: string;
  body: string;
  senderName?: string;
  timestamp?: string;
  interactiveButtonId?: string;
  referral?: {
    sourceId?: string;
    adId?: string;
    headline?: string;
    body?: string;
    sourceType?: string;
    sourceUrl?: string;
    mediaType?: string;
    imageUrl?: string;
    ctwaClid?: string;
  };
  catalogOrder?: {
    catalogId?: string;
    text?: string;
    items: Array<{ productRetailerId: string; quantity: number; itemPrice?: number }>;
  };
}

export interface SupportResolutionResult {
  action: 'answered' | 'escalated' | 'delivery_redirect' | 'ignored' | 'escalated_muted';
  responseText?: string;
  customerIdentified: boolean;
  customerId?: string;
  conversationId?: string;
  checkoutUrl?: string;
}

export interface SupportOrchestratorOptions {
  ecommerceAdapter?: EcommerceAdapter;
  aiProvider?: AiProvider;
  whatsappProvider?: WhatsAppProvider;
  platformRepository?: PlatformRepository;
  businessProfile?: BusinessProfile;
}

export class SupportOrchestrator {
  private ecommerceAdapter: EcommerceAdapter;
  private aiProvider: AiProvider;
  private whatsappProvider: WhatsAppProvider;
  private platformRepo: PlatformRepository;
  private businessProfile: BusinessProfile;
  private defaultButtons: WhatsAppButtonAction[];

  constructor(options: SupportOrchestratorOptions = {}) {
    this.ecommerceAdapter = options.ecommerceAdapter || createEcommerceAdapter();
    this.aiProvider = options.aiProvider || createAiProvider();
    this.whatsappProvider = options.whatsappProvider || createWhatsAppProvider();
    this.platformRepo = options.platformRepository || getPlatformRepository();
    this.businessProfile = options.businessProfile || getBusinessProfile();
    // Exclude any legacy human agent buttons
    this.defaultButtons = (this.businessProfile.quickButtons || []).filter(
      (b) => b.id !== 'btn_talk_human',
    );
  }

  // Regex patterns for manual human escalation
  private escalationRegex =
    /\b(human|agent|representative|talk to person|real person|call me|speak with human|talk to human|complaint|scam|fraud|manager)\b/i;

  // Regex patterns for delivery status queries
  private deliveryStatusRegex =
    /\b(where is my order|track|tracking|delivery status|courier|shipment status|when will my order arrive|has it shipped|dispatch status|order location)\b/i;

  // Regex patterns for resuming bot from escalated state
  private resumeBotRegex = /^(start|restart|bot|menu|hello|hi|hey|\/start|\/restart)$/i;

  /**
   * Executes the complete human escalation workflow:
   * 1. Updates conversation status to escalated (muting future auto-replies)
   * 2. Creates a support ticket in platform database
   * 3. Formats customer order summary
   * 4. Retrieves recent multi-turn conversation transcript
   * 5. Dispatches full context dossier alert to admin WhatsApp
   * 6. Sends reassuring customer notice with resume button
   */
  private async executeEscalation(params: {
    conversationId: string;
    fromPhone: string;
    customerName: string;
    reason: string;
    pastOrders: EcommerceOrder[];
    customer: EcommerceCustomer | null;
    customCustomerMessage?: string;
  }): Promise<SupportResolutionResult> {
    const {
      conversationId,
      fromPhone,
      customerName,
      reason,
      pastOrders,
      customer,
      customCustomerMessage,
    } = params;

    // 1. Update conversation state to escalated
    await this.platformRepo.updateConversationStatus(fromPhone, 'escalated');

    // 2. Create persistent escalation ticket
    const ticket = await this.platformRepo.createEscalationTicket(
      conversationId,
      fromPhone,
      customerName,
      reason,
    );

    // 3. Format customer order history summary
    let ordersSummary = '• Total Orders: 0 (No past orders found in store database)';
    if (pastOrders.length > 0 && pastOrders[0]) {
      const recent = pastOrders[0];
      const items =
        (recent.items || []).map((i) => `${i.productName} (${i.quantity}x)`).join(', ') || 'Items';
      ordersSummary = `• Total Orders: ${pastOrders.length}\n• Most Recent Order: #${recent.orderNumber || 'N/A'} (₹${recent.totalAmount}, ${items})\n• Status: ${recent.status}`;
    }

    // 4. Fetch recent conversation transcript (8 messages)
    const recentMessages = await this.platformRepo.getRecentMessages(fromPhone, 8);
    const transcriptLines = recentMessages.map((m) => {
      const prefix = m.role === 'customer' ? '👤 Customer:' : '🤖 Assistant:';
      return `${prefix} ${m.content}`;
    });
    const transcript =
      transcriptLines.length > 0 ? transcriptLines.join('\n') : 'No prior messages recorded.';

    // 5. Notify Store Admin via WhatsApp alert dossier
    const config = getConfig();
    if (config.ADMIN_ALERT_PHONE_NUMBER) {
      const adminDossier = formatTemplate(
        this.businessProfile.supportMessages.escalationAdminDossier,
        {
          brandName: this.businessProfile.brand.name,
          customerName,
          customerPhone: fromPhone,
          ticketId: ticket.id,
          ordersSummary,
          escalationReason: reason,
          transcript,
        },
      );

      void this.whatsappProvider
        .sendMessage({
          type: 'text',
          to: config.ADMIN_ALERT_PHONE_NUMBER,
          body: adminDossier,
        })
        .catch((err) => {
          logger.error({ err }, 'Failed sending admin escalation alert');
        });
    }

    // 6. Deliver reassurance message to customer with resume button
    const customerNotice =
      customCustomerMessage ||
      formatTemplate(this.businessProfile.supportMessages.escalationCustomerNotice, {
        customerName,
        brandName: this.businessProfile.brand.name,
      });

    const resumeButton = this.businessProfile.navigation.buttons.resumeBot || {
      id: 'btn_resume_bot',
      title: '🤖 Resume AI Bot',
    };

    await this.whatsappProvider.sendMessage({
      type: 'interactive',
      to: fromPhone,
      body: customerNotice,
      buttons: [resumeButton],
    });

    await this.platformRepo.appendMessage(
      conversationId,
      fromPhone,
      'assistant',
      customerNotice,
    );

    return {
      action: 'escalated',
      responseText: customerNotice,
      customerIdentified: Boolean(customer),
      customerId: customer?.id,
      conversationId,
    };
  }

  public async processMessage(payload: IncomingMessagePayload): Promise<SupportResolutionResult> {
    const rawText = payload.body.trim();
    const fromPhone = payload.from;
    const buttonId = payload.interactiveButtonId;

    logger.info(
      { from: fromPhone, text: rawText, buttonId },
      'Processing incoming WhatsApp message',
    );

    if (!rawText && !buttonId) {
      return { action: 'ignored', customerIdentified: false };
    }

    // 1. Identify customer and past orders (Read-Only)
    let customer: EcommerceCustomer | null = null;
    let pastOrders: EcommerceOrder[] = [];

    try {
      customer = await this.ecommerceAdapter.getCustomerByPhone(fromPhone);
      if (customer) {
        pastOrders = await this.ecommerceAdapter.getCustomerOrders(customer.id);
      }
    } catch (err) {
      logger.warn({ err, fromPhone }, 'Non-fatal error reading customer context');
    }

    const customerName = customer?.firstName || payload.senderName || 'there';

    // 2. Load or initialize persistent conversation state
    const conversation = await this.platformRepo.getOrCreateConversation(fromPhone, customerName);

    // Save incoming user message to history
    await this.platformRepo.appendMessage(
      conversation.id,
      fromPhone,
      'customer',
      rawText || `[Button: ${buttonId}]`,
    );

    // -------------------------------------------------------------------------
    // 3. CHECK RULE: Conversation is currently ESCALATED (AI MUTE POLICY)
    // -------------------------------------------------------------------------
    if (conversation.status === 'escalated') {
      // Check if customer explicitly wants to resume automated bot
      if (this.resumeBotRegex.test(rawText) || buttonId === 'btn_resume_bot') {
        logger.info({ fromPhone }, 'Customer requested automated bot resumption');
        await this.platformRepo.updateConversationStatus(fromPhone, 'active');

        const resumeMsg = formatTemplate(this.businessProfile.supportMessages.botResumed, {
          customerName,
          brandName: this.businessProfile.brand.name,
        });

        await this.whatsappProvider.sendMessage({
          type: 'interactive',
          to: fromPhone,
          body: resumeMsg,
          buttons: this.defaultButtons,
        });

        await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', resumeMsg);

        return {
          action: 'answered',
          responseText: resumeMsg,
          customerIdentified: Boolean(customer),
          customerId: customer?.id,
          conversationId: conversation.id,
        };
      }

      // Crucial: AI MUTE POLICY
      // When a ticket is escalated, the bot remains silent to prevent sending
      // generic AI responses while the customer is waiting for / speaking with a human agent.
      logger.info(
        { fromPhone, conversationId: conversation.id },
        'Conversation is in escalated state. AI bot response muted for human agent takeover.',
      );

      return {
        action: 'escalated_muted',
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 4. CHECK RULE: Inbound Meta/Instagram Ad (CTWA) Referral Welcome Flow
    // -------------------------------------------------------------------------
    if (payload.referral) {
      const headline = payload.referral.headline || 'Artisanal Paan Mukhwas & Treats';
      logger.info(
        { fromPhone, headline, adId: payload.referral.adId },
        'Inbound message from Meta CTWA Ad: triggering ad-specific welcome flow',
      );

      const adWelcomeMsg =
        `Hi ${customerName}! 👋 Welcome to ${this.businessProfile.brand.name}!\n\n` +
        `We noticed you tapped our ad: *"${headline}"*! 🌿\n\n` +
        `All our mouth fresheners and seed blends are *100% supari-free* (no areca nut) and *100% tobacco-free*, handcrafted fresh on order in Surat, Gujarat.\n\n` +
        `Choose an option below to browse or pick your pack size:`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: adWelcomeMsg,
        buttons: [
          { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
          { id: 'btn_size_paan_300g', title: '🌿 Paan Mukhwas 300g' },
          { id: 'btn_track_order', title: '📦 Track on Web' },
        ],
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', adWelcomeMsg);

      return {
        action: 'answered',
        responseText: adWelcomeMsg,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 5. CHECK RULE: Manual Human Agent Escalation Trigger
    // -------------------------------------------------------------------------
    if (this.escalationRegex.test(rawText) || buttonId === 'btn_talk_human') {
      logger.warn({ fromPhone, customerName }, 'Customer requested human agent escalation');

      return await this.executeEscalation({
        conversationId: conversation.id,
        fromPhone,
        customerName,
        reason: rawText || 'Customer requested human agent assistance',
        pastOrders,
        customer,
      });
    }

    // -------------------------------------------------------------------------
    // 5. CHECK RULE: Strictly DO NOT send delivery status on WhatsApp
    // -------------------------------------------------------------------------
    if (this.deliveryStatusRegex.test(rawText) || buttonId === 'btn_track_order') {
      logger.info(
        { fromPhone, customerName },
        'Delivery tracking inquiry intercepted: redirecting to web portal',
      );

      const redirectMessage = formatTemplate(
        this.businessProfile.supportMessages.deliveryRedirect,
        {
          customerName,
          orderTrackingUrl:
            this.businessProfile.brand.links?.orderTrackingUrl ||
            this.businessProfile.brand.orderTrackingUrl,
          brandName: this.businessProfile.brand.name,
        },
      );

      const browseButton = this.businessProfile.navigation.buttons.browseCatalog || {
        id: 'btn_browse_catalog',
        title: '🛒 Browse Treats',
      };

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: redirectMessage,
        buttons: [browseButton],
      });

      await this.platformRepo.appendMessage(
        conversation.id,
        fromPhone,
        'assistant',
        redirectMessage,
      );

      return {
        action: 'delivery_redirect',
        responseText: redirectMessage,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 5.1 NDR (Non-Delivery Report) Resolution & Customer Landmark Update
    // -------------------------------------------------------------------------
    if (buttonId === 'btn_ndr_update_address') {
      const askLandmarkMsg =
        `Hi ${customerName}! 📍\n\n` +
        `Please reply directly to this chat with your updated address, landmark (e.g., opposite garden, near temple, flat/gate number), or preferred delivery timing.\n\n` +
        `We will instantly relay this to our courier partner so they can complete your delivery before Return to Origin (RTO) occurs!`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: askLandmarkMsg,
        buttons: [
          { id: 'btn_ndr_reattempt', title: '📦 Re-attempt Now' },
          { id: 'btn_track_order', title: '📦 Track on Web' },
        ],
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', askLandmarkMsg);

      return {
        action: 'answered',
        responseText: askLandmarkMsg,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    if (
      buttonId === 'btn_ndr_reattempt' ||
      /\b(re-attempt|reattempt delivery|try delivering again)\b/i.test(rawText)
    ) {
      await this.platformRepo.recordNdrInstruction({
        customerPhone: fromPhone,
        instructions: 'Customer requested immediate courier re-attempt',
        status: 'forwarded_to_courier',
      });

      const reattemptMsg =
        `Thank you ${customerName}! 🚚\n\n` +
        `We have instructed our courier partner to schedule a priority re-attempt for your delivery! Please keep your phone reachable during delivery hours.\n\n` +
        `If you have a nearby landmark or alternate timing, feel free to reply with it anytime.`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: reattemptMsg,
        buttons: this.defaultButtons,
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', reattemptMsg);

      return {
        action: 'answered',
        responseText: reattemptMsg,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    const isLandmarkText =
      /\b(landmark|opposite|near|behind|beside|next to|gate|floor|flat|house|block|deliver to|call before|building|deliver tomorrow|morning|evening|after 5pm|after 6pm)\b/i.test(
        rawText,
      );
    const recentNdr = await this.platformRepo.getLatestNdrInstruction(fromPhone);

    if (
      isLandmarkText ||
      (recentNdr &&
        recentNdr.status === 'submitted' &&
        rawText.length > 5 &&
        !this.escalationRegex.test(rawText))
    ) {
      await this.platformRepo.recordNdrInstruction({
        customerPhone: fromPhone,
        orderNumber: recentNdr?.orderNumber,
        instructions: rawText,
        courier: recentNdr?.courier || 'courier',
        status: 'forwarded_to_courier',
      });

      const confirmedMsg =
        `Thank you ${customerName}! 📍\n\n` +
        `We have forwarded your updated delivery instructions to our logistics partner:\n` +
        `*"${rawText}"*\n\n` +
        `Our courier partner has updated the driver to prevent Return to Origin (RTO). They will re-attempt delivery shortly! ✨`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: confirmedMsg,
        buttons: this.defaultButtons,
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', confirmedMsg);

      return {
        action: 'answered',
        responseText: confirmedMsg,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 5.2 CSAT / Review Collection Handling (1–5 Stars)
    // -------------------------------------------------------------------------
    const is5Star =
      buttonId === 'btn_csat_5_stars' ||
      /^(5\s*stars?|5\/5|⭐⭐⭐⭐⭐|five stars?)$/i.test(rawText.trim());

    const isLowStar =
      buttonId === 'btn_csat_low_stars' ||
      /^([1-3]\s*stars?|[1-3]\/5|⭐{1,3}|one star|two stars?|three stars?)$/i.test(rawText.trim());

    const is4Star =
      buttonId === 'btn_csat_4_stars' ||
      /^(4\s*stars?|4\/5|⭐⭐⭐⭐|four stars?)$/i.test(rawText.trim());

    if (is5Star) {
      await this.platformRepo.recordCustomerReview({
        customerPhone: fromPhone,
        customerName,
        rating: 5,
        comment: rawText || '5 Stars CSAT rating',
        status: 'submitted',
      });

      const googleUrl =
        this.businessProfile.brand.links?.googleReviewUrl ||
        'https://g.page/r/mintarabites/review';
      const instaUrl =
        this.businessProfile.brand.links?.instagramUrl ||
        'https://instagram.com/mintarabites';

      const fiveStarMsg =
        `Thank you so much for the 5-star rating, ${customerName}! 🌟 It means the world to our small artisanal team in Surat.\n\n` +
        `Could you take 30 seconds to share your review on Google or tag us on Instagram? It helps more families discover 100% supari-free treats!\n\n` +
        `👉 *Google Review:* ${googleUrl}\n` +
        `📸 *Instagram:* ${instaUrl}\n\n` +
        `Enjoy every fresh bite of your treats! 🌿`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: fiveStarMsg,
        buttons: [
          { id: 'btn_reorder_favorites', title: '🔄 Reorder Favorites' },
          { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
        ],
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', fiveStarMsg);

      return {
        action: 'answered',
        responseText: fiveStarMsg,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    if (isLowStar) {
      let ratingVal = 2;
      const numMatch = rawText.match(/\b([1-3])\b/);
      if (numMatch && numMatch[1]) {
        ratingVal = parseInt(numMatch[1], 10);
      } else if (rawText.includes('⭐')) {
        ratingVal = (rawText.match(/⭐/g) || []).length || 2;
      }

      await this.platformRepo.recordCustomerReview({
        customerPhone: fromPhone,
        customerName,
        rating: ratingVal,
        comment: rawText || `${ratingVal} Stars CSAT rating`,
        status: 'escalated',
      });

      const apologyMsg =
        `We're truly sorry that your experience wasn't a 5-star one, ${customerName}. 😔 We take our handcrafted freshness and customer satisfaction very seriously.\n\n` +
        `I have opened an escalation ticket for our management team so we can make this right. Could you please share more details about what went wrong with your order or treat?`;

      return await this.executeEscalation({
        conversationId: conversation.id,
        fromPhone,
        customerName,
        reason: `CSAT Rating < 4 Stars (${ratingVal} Stars): Customer reported dissatisfaction post-delivery`,
        pastOrders,
        customer,
        customCustomerMessage: apologyMsg,
      });
    }

    if (is4Star) {
      await this.platformRepo.recordCustomerReview({
        customerPhone: fromPhone,
        customerName,
        rating: 4,
        comment: rawText || '4 Stars CSAT rating',
        status: 'submitted',
      });

      const googleUrl =
        this.businessProfile.brand.links?.googleReviewUrl ||
        'https://g.page/r/mintarabites/review';
      const instaUrl =
        this.businessProfile.brand.links?.instagramUrl ||
        'https://instagram.com/mintarabites';

      const fourStarMsg =
        `Thank you for your 4-star feedback, ${customerName}! ✨ We're glad you enjoyed your treats.\n\n` +
        `We're always striving for 5 stars! If there's anything we can do better next time, feel free to let us know.\n\n` +
        `👉 *Google Review:* ${googleUrl}\n` +
        `📸 *Instagram:* ${instaUrl}`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: fourStarMsg,
        buttons: [
          { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
          { id: 'btn_reorder_favorites', title: '🔄 Reorder Favorites' },
        ],
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', fourStarMsg);

      return {
        action: 'answered',
        responseText: fourStarMsg,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 6. Interactive Catalog Browse Action & Native Catalog Dispatch
    // -------------------------------------------------------------------------
    if (buttonId === 'btn_browse_catalog') {
      const config = getConfig();

      // If Meta WhatsApp catalog is configured, dispatch native interactive product_list
      if (config.WHATSAPP_CATALOG_ID && this.whatsappProvider.isConfigured()) {
        void this.whatsappProvider
          .sendProductList(
            fromPhone,
            config.WHATSAPP_CATALOG_ID,
            'Mintara Bites Artisanal Treats',
            'Explore our 100% supari-free, tobacco-free mouth fresheners & seed blends:',
            [
              {
                title: 'Paan Mukhwas (Fresh Gulkand)',
                productRetailerIds: ['paan-mukhwas-150g', 'paan-mukhwas-300g', 'paan-mukhwas-500g'],
              },
              {
                title: 'Seeds & Sweet Crunch',
                productRetailerIds: [
                  'seeds-fusion-regular-100g',
                  'seeds-fusion-regular-200g',
                  'coconut-crunch-100g',
                  'coconut-crunch-200g',
                ],
              },
              {
                title: 'Combos & Gift Packs',
                productRetailerIds: ['combo-trio-350g', 'combo-family-700g'],
              },
            ],
            '100% Supari & Tobacco Free',
          )
          .catch((err) => logger.warn({ err }, 'Failed sending native WhatsApp product list'));
      }

      const activeProducts = await this.ecommerceAdapter.getAllActiveProducts();
      const productList =
        activeProducts.length > 0
          ? activeProducts
              .map((p) => `• *${p.title}* (${p.category}): ₹${p.variants[0]?.salePrice || 'N/A'}`)
              .join('\n')
          : this.businessProfile.products
              .map((p) => `• *${p.title}* (${p.category}): ${p.price}`)
              .join('\n');

      const footerFormatted = formatTemplate(this.businessProfile.navigation.catalogBrowse.footer, {
        websiteUrl:
          this.businessProfile.brand.links?.websiteUrl || this.businessProfile.brand.websiteUrl,
        instagram:
          this.businessProfile.brand.links?.instagram || this.businessProfile.brand.instagram,
        brandName: this.businessProfile.brand.name,
      });

      const catalogMsg =
        `${this.businessProfile.navigation.catalogBrowse.header}\n\n` +
        `${productList}\n\n` +
        `📦 *Popular Pack Sizes:*\n• Paan Mukhwas: 150g (₹149), 300g (₹249), 500g (₹399)\n• Seeds Fusion: 100g (₹149), 200g (₹249)\n• Trio Pack: 350g (₹399)\n\n` +
        `${footerFormatted}`;

      const trackButton = this.businessProfile.navigation.buttons.trackOrder || {
        id: 'btn_track_order',
        title: '📦 Track on Web',
      };

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: catalogMsg,
        buttons: [{ id: 'btn_size_paan_300g', title: '🌿 Paan 300g (₹249)' }, trackButton],
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', catalogMsg);

      return {
        action: 'answered',
        responseText: catalogMsg,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 7. Interactive Pack Size / Service Selection & In-Chat Prefilled Link
    // -------------------------------------------------------------------------
    const dynamicVariantMap: Record<
      string,
      { name: string; size: string; price: number; sku: string; url?: string }
    > = {};

    if (this.businessProfile.offerings && this.businessProfile.offerings.length > 0) {
      for (const offering of this.businessProfile.offerings) {
        if (offering.variants && offering.variants.length > 0) {
          for (const variant of offering.variants) {
            dynamicVariantMap[variant.id] = {
              name: offering.title,
              size: variant.title,
              price: variant.price,
              sku: variant.sku,
              url:
                variant.checkoutOrBookingUrl ||
                (offering.type === 'service' || this.businessProfile.businessType === 'service'
                  ? offering.bookingUrl
                  : undefined),
            };
          }
        }
      }
    }

    const defaultPackSizes: Record<
      string,
      { name: string; size: string; price: number; sku: string; url?: string }
    > = {
      btn_size_paan_150g: { name: 'Artisanal Paan Mukhwas', size: '150g', price: 149, sku: 'paan-mukhwas-150g' },
      btn_size_paan_300g: { name: 'Artisanal Paan Mukhwas', size: '300g', price: 249, sku: 'paan-mukhwas-300g' },
      btn_size_paan_500g: { name: 'Artisanal Paan Mukhwas', size: '500g', price: 399, sku: 'paan-mukhwas-500g' },
      btn_size_seeds_100g: { name: 'Seeds Fusion', size: '100g', price: 149, sku: 'seeds-fusion-regular-100g' },
      btn_size_seeds_200g: { name: 'Seeds Fusion', size: '200g', price: 249, sku: 'seeds-fusion-regular-200g' },
      btn_size_coconut_100g: { name: 'Coconut Crunch', size: '100g', price: 149, sku: 'coconut-crunch-100g' },
      btn_size_coconut_200g: { name: 'Coconut Crunch', size: '200g', price: 249, sku: 'coconut-crunch-200g' },
      btn_size_trio_350g: { name: 'Mintara Trio Pack', size: '350g', price: 399, sku: 'combo-trio-350g' },
      btn_size_family_700g: { name: 'Family Feast Pack', size: '700g', price: 699, sku: 'combo-family-700g' },
    };

    const packSizeMap = {
      ...defaultPackSizes,
      ...dynamicVariantMap,
    };

    let selectedPack = buttonId ? packSizeMap[buttonId] : undefined;
    if (!selectedPack && rawText) {
      if (/\b(paan|mukhwas)\b.*\b150g\b/i.test(rawText) || rawText.trim() === '150g') {
        selectedPack = packSizeMap.btn_size_paan_150g;
      } else if (/\b(paan|mukhwas)\b.*\b300g\b/i.test(rawText) || rawText.trim() === '300g') {
        selectedPack = packSizeMap.btn_size_paan_300g;
      } else if (/\b(paan|mukhwas)\b.*\b500g\b/i.test(rawText) || rawText.trim() === '500g') {
        selectedPack = packSizeMap.btn_size_paan_500g;
      } else if (/\btrio\b/i.test(rawText)) {
        selectedPack = packSizeMap.btn_size_trio_350g;
      }
    }

    if (selectedPack) {
      const isService = this.businessProfile.businessType === 'service';
      const checkoutUrl =
        isService && selectedPack.url
          ? selectedPack.url
          : generatePrefilledCheckoutUrl(
              [{ name: `${selectedPack.name} (${selectedPack.size})`, quantity: 1, unitPrice: selectedPack.price, sku: selectedPack.sku }],
              undefined,
              this.businessProfile.brand.links?.websiteUrl || this.businessProfile.brand.websiteUrl,
            );

      const msg = isService
        ? `✅ Selected *${selectedPack.name} (${selectedPack.size})*! ✨\n\n` +
          `• Option: ${selectedPack.size}\n` +
          `• Fee: ₹${selectedPack.price}\n\n` +
          `👉 *Tap here to schedule / book your appointment:*\n${checkoutUrl}\n\n` +
          `Need to view another service or check appointment status?`
        : `✅ Added *${selectedPack.name} (${selectedPack.size})* to your cart! 🌿\n\n` +
          `• Pack Size: ${selectedPack.size}\n` +
          `• Price: ₹${selectedPack.price}\n` +
          `• Freshness: Handcrafted fresh on order & 100% supari-free\n\n` +
          `👉 *Tap here to checkout instantly:*\n${checkoutUrl}\n\n` +
          `Need to order another treat or track a parcel?`;

      const browseBtnTitle =
        this.businessProfile.terminology?.browseButtonTitle || '🛒 Browse Treats';
      const trackBtnTitle =
        this.businessProfile.terminology?.trackingButtonTitle || '📦 Track on Web';

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: msg,
        buttons: [
          { id: 'btn_browse_catalog', title: browseBtnTitle },
          { id: 'btn_track_order', title: trackBtnTitle },
        ],
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', msg);

      return {
        action: 'answered',
        responseText: msg,
        checkoutUrl,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 8. 1-Click Reorder Button (Reorder My Favorites)
    // -------------------------------------------------------------------------
    if (
      buttonId === 'btn_reorder_favorites' ||
      /\b(reorder my favorites|reorder favorites|repeat order|reorder)\b/i.test(rawText)
    ) {
      const prediction = calculateConsumptionVelocity(pastOrders, {
        websiteUrl: this.businessProfile.brand.links?.websiteUrl || this.businessProfile.brand.websiteUrl,
      });

      const itemsList = prediction.recommendedItems
        .map((i) => `• ${i.name} (${i.quantity}x) - ₹${i.unitPrice * i.quantity}`)
        .join('\n') || `• ${prediction.favoriteProduct} (1x) - ₹249`;

      const reorderMsg =
        `🔄 *1-Click Reorder: Your Mintara Favorites*\n\n` +
        `Here is your personalized replenishment basket:\n${itemsList}\n\n` +
        `👉 *Tap here to reorder instantly:*\n${prediction.reorderCheckoutUrl}\n\n` +
        `Each batch is handcrafted fresh in Surat and dispatched directly to your door! ✨`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: reorderMsg,
        buttons: [
          { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
          { id: 'btn_track_order', title: '📦 Track on Web' },
        ],
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', reorderMsg);

      return {
        action: 'answered',
        responseText: reorderMsg,
        checkoutUrl: prediction.reorderCheckoutUrl,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 9. In-Chat WhatsApp Catalog Orders (Cart Submission from Meta Catalog)
    // -------------------------------------------------------------------------
    if (payload.catalogOrder || buttonId === 'btn_whatsapp_cart_order') {
      const rawItems = payload.catalogOrder?.items || [];
      const mappedItems = rawItems.map((item) => {
        const sku = item.productRetailerId;
        let name = sku;
        let price = item.itemPrice || 249;
        if (sku.includes('paan-mukhwas-150g')) { name = 'Artisanal Paan Mukhwas (150g)'; price = 149; }
        else if (sku.includes('paan-mukhwas-300g')) { name = 'Artisanal Paan Mukhwas (300g)'; price = 249; }
        else if (sku.includes('paan-mukhwas-500g')) { name = 'Artisanal Paan Mukhwas (500g)'; price = 399; }
        else if (sku.includes('seeds-fusion')) { name = 'Seeds Fusion'; price = 149; }
        else if (sku.includes('coconut-crunch')) { name = 'Coconut Crunch'; price = 149; }
        else if (sku.includes('combo-trio')) { name = 'Mintara Trio Pack (350g)'; price = 399; }
        else if (sku.includes('combo-family')) { name = 'Family Feast Pack (700g)'; price = 699; }
        return { name, sku, quantity: item.quantity, unitPrice: price };
      });

      const finalItems = mappedItems.length > 0 ? mappedItems : [
        { name: 'Artisanal Paan Mukhwas (300g)', sku: 'paan-mukhwas-300g', quantity: 1, unitPrice: 249 },
      ];

      const checkoutUrl = generatePrefilledCheckoutUrl(
        finalItems,
        undefined,
        this.businessProfile.brand.links?.websiteUrl || this.businessProfile.brand.websiteUrl,
      );

      const itemsSummary = finalItems
        .map((i) => `• ${i.name} (${i.quantity}x) - ₹${i.unitPrice * i.quantity}`)
        .join('\n');
      const totalAmount = finalItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

      const cartMsg =
        `🛒 *WhatsApp Cart Received!*\n\n` +
        `Here are your selected treats:\n${itemsSummary}\n\n` +
        `*Total:* ₹${totalAmount}\n\n` +
        `👉 *Tap here to complete your order instantly:*\n${checkoutUrl}\n\n` +
        `Packed fresh on order in Surat, Gujarat with free shipping on ₹699+! ✨`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: cartMsg,
        buttons: [
          { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
          { id: 'btn_track_order', title: '📦 Track on Web' },
        ],
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', cartMsg);

      return {
        action: 'answered',
        responseText: cartMsg,
        checkoutUrl,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 10. Multi-Turn AI Support Answer using Gemini
    // -------------------------------------------------------------------------
    const activeProducts = await this.ecommerceAdapter.getAllActiveProducts();

    const productCatalogContext =
      activeProducts.length > 0
        ? activeProducts
            .map((p) => {
              const variantsStr = p.variants
                .map(
                  (v) =>
                    `  - ${v.flavor} (${v.weightGrams}g): ₹${v.salePrice} (MRP: ₹${v.price}, Stock: ${v.stockQty})`,
                )
                .join('\n');
              return `* ${p.title} (${p.category}):\n  Description: ${p.description}\n  Refrigeration required: ${p.requiresRefrigeration ? 'YES (preserve crispness & aroma)' : 'No'}\n  Benefits: ${(p.benefits || []).join(', ')}\n  Ingredients: ${(p.ingredients || []).join(', ')}\n  Variants:\n${variantsStr}`;
            })
            .join('\n\n')
        : this.businessProfile.products
            .map(
              (p) =>
                `* ${p.title} (${p.category}):\n  Description: ${p.description}\n  Pricing: ${p.price}\n  Refrigeration required: ${p.requiresRefrigeration ? 'YES' : 'No'}`,
            )
            .join('\n\n');

    let customerContextStr = `Customer Name: ${customerName}\nIdentified in Store DB: ${customer ? 'Yes' : 'Guest/New'}`;
    if (pastOrders.length > 0 && pastOrders[0]) {
      const recentOrder = pastOrders[0];
      const itemsList = (recentOrder.items || [])
        .map((i) => `${i.productName} (${i.quantity}x)`)
        .join(', ');
      customerContextStr += `\nPast Orders Count: ${pastOrders.length}\nMost Recent Order: ${recentOrder.orderNumber || 'N/A'} (Items: ${itemsList}, Total: ₹${recentOrder.totalAmount})`;
    }

    const reviewSummary = await this.platformRepo.getUnifiedReviewSummary().catch(() => null);
    if (reviewSummary && reviewSummary.totalReviews > 0) {
      customerContextStr += `\nBrand Verified Omnichannel Rating: ${reviewSummary.averageRating}/5 ⭐ across ${reviewSummary.totalReviews} reviews (Website, Google, WhatsApp).`;
    }

    // Include recent verified store customer reviews so AI can quote real customer experiences
    const recentWebsiteReviews = await this.ecommerceAdapter.getWebsiteReviews().catch(() => []);
    if (recentWebsiteReviews.length > 0) {
      const topReviewsStr = recentWebsiteReviews
        .slice(0, 4)
        .map((r) => `• "${r.title ? `${r.title} - ` : ''}${r.comment}" — ${r.customerName} (${r.rating}/5 ⭐)`)
        .join('\n');
      customerContextStr += `\n\nRecent Customer Testimonials from Website:\n${topReviewsStr}`;
    }

    const systemPrompt = buildBusinessSystemPrompt({
      customerContext: customerContextStr,
      productCatalogContext,
    });

    // Load recent multi-turn conversation messages
    const recentMessages = await this.platformRepo.getRecentMessages(fromPhone, 6);
    const multiTurnMessages: AiChatMessage[] = [{ role: 'system', content: systemPrompt }];

    // Append previous dialogue turns for context
    for (const msg of recentMessages.slice(0, -1)) {
      if (msg.role === 'customer') {
        multiTurnMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        multiTurnMessages.push({ role: 'assistant', content: msg.content });
      }
    }

    // Append latest user question
    multiTurnMessages.push({ role: 'user', content: rawText });

    try {
      const aiResponse = await this.aiProvider.generateResponse({
        messages: multiTurnMessages,
        temperature: 0.3,
      });

      const replyText = aiResponse.content.trim();

      // Check for Autonomous AI Escalation trigger
      const escalateMatch = replyText.match(/\[ESCALATE:\s*([^\]]+)\]/i);
      if (escalateMatch && escalateMatch[1]) {
        const diagnosticReason = escalateMatch[1].trim();
        const cleanedCustomerText = replyText.replace(/\[ESCALATE:[^\]]+\]/i, '').trim();

        logger.warn(
          { fromPhone, diagnosticReason },
          'Autonomous AI escalation triggered by Gemini response',
        );

        return await this.executeEscalation({
          conversationId: conversation.id,
          fromPhone,
          customerName,
          reason: diagnosticReason,
          pastOrders,
          customer,
          customCustomerMessage: cleanedCustomerText || undefined,
        });
      }

      // Normal AI response dispatch via WhatsApp with interactive quick reply buttons
      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: replyText,
        buttons: this.defaultButtons,
      });

      // Save AI reply to conversation history
      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', replyText);

      return {
        action: 'answered',
        responseText: replyText,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    } catch (err) {
      logger.error({ err, fromPhone }, 'Failed to generate and send AI response');

      const fallbackMsg = formatTemplate(this.businessProfile.supportMessages.fallbackError, {
        customerName,
        brandName: this.businessProfile.brand.name,
        websiteUrl:
          this.businessProfile.brand.links?.websiteUrl || this.businessProfile.brand.websiteUrl,
        supportEmail:
          this.businessProfile.brand.links?.supportEmail || this.businessProfile.brand.supportEmail,
      });

      await this.whatsappProvider.sendMessage({
        type: 'text',
        to: fromPhone,
        body: fallbackMsg,
      });

      await this.platformRepo.appendMessage(conversation.id, fromPhone, 'assistant', fallbackMsg);

      return {
        action: 'answered',
        responseText: fallbackMsg,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }
  }
}
