import { createLogger } from '@whatsapp-platform/shared';
import { businessProfileSchema, BusinessProfile } from '@whatsapp-platform/config';
import { createAiProvider } from './index.js';

const logger = createLogger({ name: 'business-synthesizer' });

export interface BusinessSynthesisHints {
  businessType?: 'ecommerce' | 'service' | 'b2b' | 'hybrid';
  brandName?: string;
  websiteUrl?: string;
  location?: string;
}

/**
 * Intelligent deterministic fallback synthesizer when live LLM is offline, unconfigured, or in test mode.
 */
export function buildDeterministicBusinessProfile(
  rawKnowledge: string,
  hints: BusinessSynthesisHints = {},
): BusinessProfile {
  const text = rawKnowledge.trim();
  const lower = text.toLowerCase();

  // 1. Detect Business Type
  let detectedType: 'ecommerce' | 'service' | 'b2b' | 'hybrid' = hints.businessType || 'ecommerce';
  if (!hints.businessType) {
    if (
      lower.includes('clinic') ||
      lower.includes('appointment') ||
      lower.includes('consultation') ||
      lower.includes('dental') ||
      lower.includes('doctor') ||
      lower.includes('salon') ||
      lower.includes('treatment')
    ) {
      detectedType = 'service';
    } else if (
      lower.includes('wholesale') ||
      lower.includes('moq') ||
      lower.includes('b2b') ||
      lower.includes('distributor') ||
      lower.includes('bulk supply') ||
      lower.includes('rfp')
    ) {
      detectedType = 'b2b';
    }
  }

  // 2. Extract Brand Name
  let brandName = hints.brandName;
  if (!brandName) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length > 0 && lines[0]) {
      const candidate = lines[0]
        .replace(/^[#*-•\s]+/, '')
        .replace(/^(welcome to|about|profile of)\s+/i, '')
        .trim();
      if (candidate.length > 2 && candidate.length < 60) {
        brandName = candidate;
      }
    }
  }
  if (!brandName) {
    brandName = detectedType === 'service' ? 'Premier Care Services' : 'Artisanal Essentials';
  }

  // 3. Terminology & UI based on business model
  const terminology =
    detectedType === 'service'
      ? {
          itemNoun: 'service',
          itemNounPlural: 'services',
          actionVerb: 'Book',
          browseButtonTitle: '🗓️ View Services',
          trackingButtonTitle: '📅 Appointments',
          reorderButtonTitle: '🔄 Rebook',
        }
      : detectedType === 'b2b'
        ? {
            itemNoun: 'product',
            itemNounPlural: 'products',
            actionVerb: 'Inquire',
            browseButtonTitle: '📋 Browse Catalog',
            trackingButtonTitle: '📦 Order Status',
            reorderButtonTitle: '🔄 Repeat Order',
          }
        : {
            itemNoun: 'item',
            itemNounPlural: 'items',
            actionVerb: 'Order',
            browseButtonTitle: '🛒 Browse Catalog',
            trackingButtonTitle: '📦 Track on Web',
            reorderButtonTitle: '🔄 Reorder',
          };

  // 4. Extract or Generate Offerings
  const offerings: BusinessProfile['offerings'] = [];
  const lines = text.split('\n');
  let currentCategory = 'Featured';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('###') || trimmed.startsWith('##')) {
      currentCategory = trimmed.replace(/^#+\s*/, '').trim();
      continue;
    }

    // Match bullet items like: - *Product Title* (₹149): Description
    if (/^[-*•]\s+/.test(trimmed)) {
      const withoutBullet = trimmed.replace(/^[-*•]\s+/, '').trim();
      const itemMatch = withoutBullet.match(/^[*_]*(.+?)[*_]*\s*(?:\(([^)]+)\))?\s*:\s*(.+)$/);
      if (itemMatch && itemMatch[1] && itemMatch[3]) {
        const title = itemMatch[1].replace(/[*_]/g, '').trim();
        const meta = itemMatch[2] ? itemMatch[2].trim() : 'Contact for pricing';
        const desc = itemMatch[3].trim();
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const websiteBase = hints.websiteUrl || 'https://mintarabites.com';

        offerings.push({
          id: slug,
          title,
          category: currentCategory,
          type: detectedType === 'service' ? 'service' : 'product',
          price: meta.startsWith('₹') ? meta : `₹${meta.replace(/\D/g, '') || '199'}`,
          description: desc,
          requiresRefrigeration:
            lower.includes('refrigerat') && title.toLowerCase().includes('paan'),
          url: `${websiteBase}/products/${slug}`,
          checkoutUrl: `${websiteBase}/products/${slug}`,
          bookingUrl: detectedType === 'service' ? `${websiteBase}/book` : undefined,
          variants: [
            {
              id: `btn_${slug}`,
              title: title,
              buttonLabel: `👉 ${title}`,
              price: parseInt(meta.replace(/\D/g, ''), 10) || 199,
              sku: slug,
              checkoutOrBookingUrl: `${websiteBase}/products/${slug}`,
            },
          ],
        });
      }
    }
  }

  // Fallback offering if none parsed from text
  if (offerings.length === 0) {
    const websiteBase = hints.websiteUrl || 'https://mintarabites.com';
    offerings.push({
      id: 'core-offering',
      title: detectedType === 'service' ? 'Primary Consultation' : 'Signature Product',
      category: 'General',
      type: detectedType === 'service' ? 'service' : 'product',
      price: '₹299',
      description: `Comprehensive ${detectedType === 'service' ? 'professional appointment' : 'handcrafted quality offering'}.`,
      requiresRefrigeration: false,
      url: `${websiteBase}/offerings`,
      checkoutUrl: `${websiteBase}/offerings`,
      variants: [],
    });
  }

  // 5. Extract FAQs if present
  const faqs: BusinessProfile['faqs'] = [];
  const faqRegex = /(?:Q|Question):\s*(.+?)\s*(?:A|Answer):\s*([^\n\r]+)/gi;
  let faqMatch: RegExpExecArray | null;
  while ((faqMatch = faqRegex.exec(text)) !== null) {
    if (faqMatch[1] && faqMatch[2]) {
      faqs.push({
        question: faqMatch[1].trim(),
        answer: faqMatch[2].trim(),
      });
    }
  }

  const websiteUrl = hints.websiteUrl || 'https://mintarabites.com';
  const location = hints.location || 'India';

  return businessProfileSchema.parse({
    businessType: detectedType,
    terminology,
    brand: {
      name: brandName,
      location,
      tagline: `Quality & Excellence in Every ${terminology.itemNoun}`,
      description: text.slice(0, 300).trim(),
      links: {
        websiteUrl,
        cartUrl: `${websiteUrl}/cart`,
        orderTrackingUrl: `${websiteUrl}/track-order`,
        supportEmail: 'contact@brand.com',
        supportPhone: '+91 9876543210',
      },
    },
    persona: {
      role: `WhatsApp AI Concierge & Assistant for ${brandName}`,
      tone: 'Warm, respectful, welcoming, authentic, and concise. Format with WhatsApp markdown.',
      rules: [
        'Strictly answer from verified business knowledge only.',
        'Never invent or promise unconfirmed discounts or fake coupons.',
        'Always provide direct product/service links when answering inquiries.',
        'Keep responses mobile-friendly and concise within 2-3 short paragraphs.',
      ],
      escalationCriteria: [
        'Customer requests cancellations, refunds, or dispute resolution.',
        'Customer reports damaged or missing deliveries.',
        'Customer explicitly requests a human supervisor.',
      ],
    },
    brandHighlights: [
      `Authentic & direct customer service`,
      `Dedicated quality assurance`,
      `Fast nationwide fulfillment`,
    ],
    knowledge: {
      values: ['Quality First', 'Honest Pricing', 'Customer Satisfaction'],
      policies: {
        fulfillment: 'Orders are processed swiftly and dispatched via express network.',
        returns: 'Please contact support within 48 hours for any quality concerns.',
      },
      customMarkdown: text,
    },
    promotions: {
      enabled: false,
      activePromo: null,
    },
    engagement: {
      maxDailyMessagesPerCustomer: 25,
      maxMonthlyMarketingDispatches: 3,
      marketingCooldownDays: 14,
      cartAbandonmentWindowHours: 4,
      dailyMessageWarningThreshold: 15,
    },
    offerings,
    products: offerings.map((o) => ({
      title: o.title,
      category: o.category,
      price: o.price,
      description: o.description,
      requiresRefrigeration: o.requiresRefrigeration,
      url: o.url,
    })),
    faqs,
  });
}

/**
 * Universal AI Business Knowledge Synthesizer:
 * Takes raw business text (brochure, website export, policies, product list),
 * prompts the Gemini AI model to structure it into the complete BusinessProfile schema,
 * validates against Zod, and returns the production-ready profile.
 */
export async function synthesizeBusinessProfile(
  rawKnowledge: string,
  hints: BusinessSynthesisHints = {},
): Promise<BusinessProfile> {
  const ai = createAiProvider();

  if (process.env.NODE_ENV === 'test' || !ai.isConfigured()) {
    return buildDeterministicBusinessProfile(rawKnowledge, hints);
  }

  const prompt = `You are a Senior Systems Architect and Business Knowledge Engineer.
Your task is to analyze the provided raw business text and synthesize it into a complete, structured JSON configuration matching the BusinessProfile schema for an automated WhatsApp concierge platform.

Rules:
1. Detect whether the business is "ecommerce" (retail/FMCG), "service" (clinics, salons, consulting, appointments), "b2b" (wholesale, distributors, quotes), or "hybrid".
2. Extract the brand name, location, tagline, comprehensive description, and links.
3. For products/services, generate detailed "offerings" with direct URLs (e.g. https://domain.com/products/slug), pricing in ₹, categories, and descriptions.
4. Extract terminology: itemNoun, itemNounPlural, actionVerb, browseButtonTitle, trackingButtonTitle.
5. Extract brand highlights, policies, values, persona rules, escalation criteria, and FAQs.
6. For "promotions": set "enabled": false and "activePromo": null by default (unless explicitly active in text).
7. For "engagement": set maxDailyMessagesPerCustomer: 25, maxMonthlyMarketingDispatches: 3, marketingCooldownDays: 14, cartAbandonmentWindowHours: 4.
8. Output ONLY valid raw JSON with NO markdown backticks, NO commentary, NO explanations.

HINTS:
${JSON.stringify(hints, null, 2)}

RAW BUSINESS KNOWLEDGE INPUT:
${rawKnowledge}`;

  try {
    const response = await ai.generateResponse({
      messages: [
        {
          role: 'system',
          content:
            'You are a strict JSON generator. You output only raw, valid JSON matching the specified schema without preamble, markdown wrapping, or trailing text.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
    });

    const content = response.content.trim();
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    let jsonString = codeBlockMatch && codeBlockMatch[1] ? codeBlockMatch[1].trim() : content;
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.slice(firstBrace, lastBrace + 1);
    }

    const parsedJson = JSON.parse(jsonString);
    if (parsedJson && typeof parsedJson === 'object') {
      // 1. Normalize brand
      if (!parsedJson.brand || typeof parsedJson.brand !== 'object') {
        parsedJson.brand = {};
      }
      const rawBrandName =
        hints.brandName ||
        parsedJson.brand.name ||
        parsedJson.brand.brandName ||
        parsedJson.brand.brand_name ||
        parsedJson.brand.company_name ||
        parsedJson.brandName ||
        parsedJson.brand_name;

      if (rawBrandName) {
        parsedJson.brand.name = rawBrandName;
      } else {
        const firstLine = rawKnowledge
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.length > 2);
        if (firstLine) {
          parsedJson.brand.name = firstLine.replace(/^[#*-•\s]+/, '').trim();
        }
      }

      // 2. Normalize offerings & products
      if (Array.isArray(parsedJson.offerings) && parsedJson.offerings.length > 0) {
        parsedJson.offerings = parsedJson.offerings.map((o: any) => ({
          ...o,
          title: o.title || o.name || 'Signature Item',
          price: typeof o.price === 'number' ? `₹${o.price}` : String(o.price || '₹199'),
          category: o.category || 'General',
          type: parsedJson.businessType === 'service' ? 'service' : o.type || 'product',
          description: o.description || '',
          url: o.url || (o.checkoutUrl ? o.checkoutUrl : undefined),
        }));
      } else if (Array.isArray(parsedJson.products) && parsedJson.products.length > 0) {
        parsedJson.offerings = parsedJson.products.map((p: any) => ({
          title: p.title || p.name || 'Signature Item',
          price: typeof p.price === 'number' ? `₹${p.price}` : String(p.price || '₹199'),
          category: p.category || 'General',
          type: parsedJson.businessType === 'service' ? 'service' : 'product',
          description: p.description || '',
          url: p.url || undefined,
          variants: [],
        }));
      }

      if (Array.isArray(parsedJson.products) && parsedJson.products.length > 0) {
        parsedJson.products = parsedJson.products.map((p: any) => ({
          ...p,
          title: p.title || p.name || 'Signature Item',
          price: typeof p.price === 'number' ? `₹${p.price}` : String(p.price || '₹199'),
          category: p.category || 'General',
          description: p.description || '',
          url: p.url || undefined,
        }));
      } else if (Array.isArray(parsedJson.offerings) && parsedJson.offerings.length > 0) {
        parsedJson.products = parsedJson.offerings.map((o: any) => ({
          title: o.title || o.name || 'Signature Item',
          price: typeof o.price === 'number' ? `₹${o.price}` : String(o.price || '₹199'),
          category: o.category || 'General',
          description: o.description || '',
          url: o.url || undefined,
        }));
      }

      // 3. Normalize engagement defaults
      if (!parsedJson.engagement || typeof parsedJson.engagement !== 'object') {
        parsedJson.engagement = {};
      }
      if (!parsedJson.engagement.maxDailyMessagesPerCustomer) {
        parsedJson.engagement.maxDailyMessagesPerCustomer = 25;
      }
      if (!parsedJson.engagement.marketingCooldownDays) {
        parsedJson.engagement.marketingCooldownDays = 14;
      }
    }

    const validated = businessProfileSchema.parse(parsedJson);
    logger.info(
      { brand: validated.brand.name, type: validated.businessType },
      'Successfully synthesized business profile via AI',
    );
    return validated;
  } catch (err) {
    logger.warn({ err }, 'Failed synthesizing via Gemini, falling back to deterministic synthesis');
    return buildDeterministicBusinessProfile(rawKnowledge, hints);
  }
}
