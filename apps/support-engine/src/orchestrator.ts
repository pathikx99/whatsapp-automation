import { createLogger } from '@whatsapp-platform/shared';
import {
  createEcommerceAdapter,
  EcommerceAdapter,
  EcommerceCustomer,
  EcommerceOrder,
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
}

export interface SupportResolutionResult {
  action: 'answered' | 'escalated' | 'delivery_redirect' | 'ignored' | 'escalated_muted';
  responseText?: string;
  customerIdentified: boolean;
  customerId?: string;
  conversationId?: string;
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
    this.defaultButtons = this.businessProfile.quickButtons;
  }

  // Regex patterns for human escalation
  private escalationRegex =
    /\b(human|agent|representative|talk to person|real person|call me|speak with human|talk to human|complaint|scam|fraud|manager)\b/i;

  // Regex patterns for delivery status queries
  private deliveryStatusRegex =
    /\b(where is my order|track|tracking|delivery status|courier|shipment status|when will my order arrive|has it shipped|dispatch status|order location)\b/i;

  // Regex patterns for resuming bot from escalated state
  private resumeBotRegex = /^(start|restart|bot|menu|hello|hi|hey|\/start|\/restart)$/i;

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

        const resumeMsg =
          `Welcome back, ${customerName}! ✨\n\n` +
          `Our automated assistant is back online. How can I help you today?`;

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
    // 4. CHECK RULE: Human Agent Escalation Trigger
    // -------------------------------------------------------------------------
    if (this.escalationRegex.test(rawText) || buttonId === 'btn_talk_human') {
      logger.warn({ fromPhone, customerName }, 'Customer requested human agent escalation');

      // Update conversation state to escalated
      await this.platformRepo.updateConversationStatus(fromPhone, 'escalated');

      // Create persistent escalation ticket
      const ticket = await this.platformRepo.createEscalationTicket(
        conversation.id,
        fromPhone,
        customerName,
        rawText || 'Customer tapped [Talk to Agent]',
      );

      // Notify Store Admin via WhatsApp if configured
      const config = getConfig();
      if (config.ADMIN_ALERT_PHONE_NUMBER) {
        void this.whatsappProvider
          .sendMessage({
            type: 'text',
            to: config.ADMIN_ALERT_PHONE_NUMBER,
            body:
              `🚨 *${this.businessProfile.brand.name} - Support Escalation Alert*\n\n` +
              `• *Customer:* ${customerName} (+${fromPhone})\n` +
              `• *Ticket ID:* ${ticket.id}\n` +
              `• *Message:* "${rawText}"\n` +
              `• *Action:* Direct chat: https://wa.me/${fromPhone}\n\n` +
              `AI assistant is now MUTED for this customer until resolved.`,
          })
          .catch((err) => {
            logger.error({ err }, 'Failed sending admin escalation alert');
          });
      }

      const escalationMessage =
        `Hello ${customerName}! 🙏\n\n` +
        `I have flagged this for our human support team at ${this.businessProfile.brand.name}. A support representative will take over this chat shortly to assist you personally.\n\n` +
        `You can also reach us directly via email at ${this.businessProfile.brand.supportEmail}.\n\n` +
        `*(To resume automated answers anytime, reply with "start" or tap below).*`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: escalationMessage,
        buttons: [{ id: 'btn_resume_bot', title: '🤖 Resume AI Bot' }],
      });

      await this.platformRepo.appendMessage(
        conversation.id,
        fromPhone,
        'assistant',
        escalationMessage,
      );

      return {
        action: 'escalated',
        responseText: escalationMessage,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
        conversationId: conversation.id,
      };
    }

    // -------------------------------------------------------------------------
    // 5. CHECK RULE: Strictly DO NOT send delivery status on WhatsApp
    // -------------------------------------------------------------------------
    if (this.deliveryStatusRegex.test(rawText) || buttonId === 'btn_track_order') {
      logger.info(
        { fromPhone, customerName },
        'Delivery tracking inquiry intercepted: redirecting to web portal',
      );

      const redirectMessage =
        `Hi ${customerName}! 📦\n\n` +
        `For real-time delivery status and live courier tracking, please check your order dashboard directly on our store:\n` +
        `👉 ${this.businessProfile.brand.orderTrackingUrl}\n\n` +
        `*(For your privacy, account security, and real-time carrier sync, live delivery tracking is viewed directly on our web dashboard rather than WhatsApp).* \n\n` +
        `Feel free to ask if you have any questions about our products, ingredients, or storage! ✨`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: redirectMessage,
        buttons: [
          { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
          { id: 'btn_talk_human', title: '🙋 Talk to Agent' },
        ],
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
    // 6. Interactive Catalog Browse Action
    // -------------------------------------------------------------------------
    if (buttonId === 'btn_browse_catalog') {
      const activeProducts = await this.ecommerceAdapter.getAllActiveProducts();
      const productList =
        activeProducts.length > 0
          ? activeProducts
              .map((p) => `• *${p.title}* (${p.category}): ₹${p.variants[0]?.salePrice || 'N/A'}`)
              .join('\n')
          : this.businessProfile.products
              .map((p) => `• *${p.title}* (${p.category}): ${p.price}`)
              .join('\n');

      const catalogMsg =
        `${this.businessProfile.catalogBrowse.header}\n\n` +
        `${productList}\n\n` +
        `${this.businessProfile.catalogBrowse.footer}`;

      await this.whatsappProvider.sendMessage({
        type: 'interactive',
        to: fromPhone,
        body: catalogMsg,
        buttons: [
          { id: 'btn_track_order', title: '📦 Track on Web' },
          { id: 'btn_talk_human', title: '🙋 Talk to Agent' },
        ],
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
    // 7. Multi-Turn AI Support Answer using Gemini
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

      // Dispatch response via WhatsApp with interactive quick reply buttons
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

      const fallbackMsg =
        `Thank you for contacting ${this.businessProfile.brand.name}! 🙏\n\n` +
        `We received your message and our team is looking into it. If you need immediate assistance, please visit ${this.businessProfile.brand.websiteUrl} or email ${this.businessProfile.brand.supportEmail}.`;

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
