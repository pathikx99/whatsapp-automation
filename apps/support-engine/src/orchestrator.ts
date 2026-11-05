import { createLogger } from '@whatsapp-platform/shared';
import { createEcommerceAdapter, EcommerceAdapter, EcommerceCustomer, EcommerceOrder } from '@whatsapp-platform/ecommerce-adapter';
import { createAiProvider, AiProvider } from '@whatsapp-platform/ai';
import { createWhatsAppProvider, WhatsAppProvider } from '@whatsapp-platform/whatsapp';

const logger = createLogger({ name: 'support-orchestrator' });

export interface IncomingMessagePayload {
  from: string;
  messageId: string;
  body: string;
  senderName?: string;
  timestamp?: string;
}

export interface SupportResolutionResult {
  action: 'answered' | 'escalated' | 'delivery_redirect' | 'ignored';
  responseText?: string;
  customerIdentified: boolean;
  customerId?: string;
}

export interface SupportOrchestratorOptions {
  ecommerceAdapter?: EcommerceAdapter;
  aiProvider?: AiProvider;
  whatsappProvider?: WhatsAppProvider;
}

export class SupportOrchestrator {
  private ecommerceAdapter: EcommerceAdapter;
  private aiProvider: AiProvider;
  private whatsappProvider: WhatsAppProvider;

  constructor(options: SupportOrchestratorOptions = {}) {
    this.ecommerceAdapter = options.ecommerceAdapter || createEcommerceAdapter();
    this.aiProvider = options.aiProvider || createAiProvider();
    this.whatsappProvider = options.whatsappProvider || createWhatsAppProvider();
  }

  // Regex patterns for human escalation
  private escalationRegex = /\b(human|agent|representative|talk to person|real person|call me|speak with human|talk to human|complaint|scam|fraud|manager)\b/i;

  // Regex patterns for delivery status queries
  private deliveryStatusRegex = /\b(where is my order|track|tracking|delivery status|courier|shipment status|when will my order arrive|has it shipped|dispatch status|order location)\b/i;

  public async processMessage(payload: IncomingMessagePayload): Promise<SupportResolutionResult> {
    const rawText = payload.body.trim();
    const fromPhone = payload.from;

    logger.info({ from: fromPhone, text: rawText }, 'Processing incoming WhatsApp message');

    if (!rawText) {
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

    // 2. CHECK RULE: Human Agent Escalation
    if (this.escalationRegex.test(rawText)) {
      logger.warn({ fromPhone, customerName }, 'Customer requested human agent escalation');

      const escalationMessage =
        `Hello ${customerName}! 🙏\n\n` +
        `I have flagged this for our human support team at Mintara Bites. A support representative will take over this chat shortly to assist you personally.\n\n` +
        `You can also reach us directly via email at contact@mintarabites.com.`;

      await this.whatsappProvider.sendMessage({
        type: 'text',
        to: fromPhone,
        body: escalationMessage,
      });

      return {
        action: 'escalated',
        responseText: escalationMessage,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
      };
    }

    // 3. CHECK RULE: Strictly DO NOT send delivery status on WhatsApp
    if (this.deliveryStatusRegex.test(rawText)) {
      logger.info({ fromPhone, customerName }, 'Delivery tracking inquiry intercepted: redirecting to web portal');

      const redirectMessage =
        `Hi ${customerName}! 📦\n\n` +
        `For real-time delivery status and live courier tracking, please check your order dashboard directly on our store:\n` +
        `👉 https://mintarabites.com/account/orders\n\n` +
        `*(For your privacy, account security, and real-time carrier sync, live delivery tracking is viewed directly on our web dashboard rather than WhatsApp).* \n\n` +
        `Feel free to ask if you have any questions about our products, ingredients, or storage! ✨`;

      await this.whatsappProvider.sendMessage({
        type: 'text',
        to: fromPhone,
        body: redirectMessage,
      });

      return {
        action: 'delivery_redirect',
        responseText: redirectMessage,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
      };
    }

    // 4. Generate AI Support Answer using Gemini 3.5 Flash Lite
    const activeProducts = await this.ecommerceAdapter.getAllActiveProducts();

    const productCatalogContext = activeProducts
      .map((p) => {
        const variantsStr = p.variants
          .map((v) => `  - ${v.flavor} (${v.weightGrams}g): ₹${v.salePrice} (MRP: ₹${v.price}, Stock: ${v.stockQty})`)
          .join('\n');
        return `* ${p.title} (${p.category}):\n  Description: ${p.description}\n  Refrigeration required: ${p.requiresRefrigeration ? 'YES (preserve crispness & aroma)' : 'No'}\n  Benefits: ${(p.benefits || []).join(', ')}\n  Ingredients: ${(p.ingredients || []).join(', ')}\n  Variants:\n${variantsStr}`;
      })
      .join('\n\n');

    let customerContextStr = `Customer Name: ${customerName}\nIdentified in Store DB: ${customer ? 'Yes' : 'Guest/New'}`;
    if (pastOrders.length > 0 && pastOrders[0]) {
      const recentOrder = pastOrders[0];
      const itemsList = (recentOrder.items || []).map((i) => `${i.productName} (${i.quantity}x)`).join(', ');
      customerContextStr += `\nPast Orders Count: ${pastOrders.length}\nMost Recent Order: ${recentOrder.orderNumber || 'N/A'} (Items: ${itemsList}, Total: ₹${recentOrder.totalAmount})`;
    }

    const systemPrompt = `You are the friendly, helpful WhatsApp AI Assistant for "Mintara Bites" (based in Surat, Gujarat), a premium brand of handcrafted, artisanal mukhwas and digestive treats.

Brand Core Highlights:
- 100% SUPARI & ARECA NUT FREE. 100% TOBACCO FREE.
- Pure natural ingredients: natural gulkand, sweet fennel (variyali), roasted coriander seeds (dhanadal), wholesome seeds.
- Paan Mukhwas requires refrigeration to preserve its crisp texture and authentic aroma.
- Seeds Fusion is a powerhouse blend of 6 seeds (white sesame, black sesame, pumpkin, watermelon, sunflower, flax) available in Regular and Lime.
- Coconut Crunch is chocolate-coated sesame, toasted coconut flakes, and dhanadal.
- Combos: Mintara Trio Pack (350g @ ₹499), Family Feast Pack (700g @ ₹699 with FREE Delivery).

STRICT INSTRUCTIONS:
1. NEVER reveal or look up carrier/delivery tracking numbers or live shipment status on WhatsApp. If asked about delivery or tracking, instruct the user to visit https://mintarabites.com/account/orders.
2. Tone: Warm, respectful, authentic, and concise. Format with WhatsApp markdown (*bold*, emoji accents, short bullet points).
3. If the customer asks questions about ingredients, allergens, refrigeration, pricing, or recommendations, answer accurately using the Product Catalog below.
4. Keep replies within 2-3 short paragraphs suitable for mobile messaging.

CUSTOMER CONTEXT:
${customerContextStr}

CURRENT PRODUCT CATALOG:
${productCatalogContext}`;

    try {
      const aiResponse = await this.aiProvider.generateResponse({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText },
        ],
        temperature: 0.3,
      });

      const replyText = aiResponse.content.trim();

      // Dispatch response via WhatsApp
      await this.whatsappProvider.sendMessage({
        type: 'text',
        to: fromPhone,
        body: replyText,
      });

      return {
        action: 'answered',
        responseText: replyText,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
      };
    } catch (err) {
      logger.error({ err, fromPhone }, 'Failed to generate and send AI response');

      const fallbackMsg =
        `Thank you for contacting Mintara Bites! 🙏\n\n` +
        `We received your message and our team is looking into it. If you need immediate assistance, please visit https://mintarabites.com or email contact@mintarabites.com.`;

      await this.whatsappProvider.sendMessage({
        type: 'text',
        to: fromPhone,
        body: fallbackMsg,
      });

      return {
        action: 'answered',
        responseText: fallbackMsg,
        customerIdentified: Boolean(customer),
        customerId: customer?.id,
      };
    }
  }
}
