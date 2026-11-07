import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { findRootDir } from './index.js';

export const brandLinksSchema = z.object({
  websiteUrl: z.string().url().default('https://mintarabites.com'),
  cartUrl: z.string().url().default('https://mintarabites.com/cart'),
  bookingUrl: z.string().url().optional(),
  orderTrackingUrl: z.string().url().default('https://mintarabites.com/track-order'),
  appointmentTrackingUrl: z.string().url().optional(),
  instagram: z.string().default('@mintarabites'),
  instagramUrl: z.string().url().default('https://instagram.com/mintarabites'),
  googleReviewUrl: z.string().url().default('https://g.page/r/mintarabites/review'),
  supportEmail: z.string().email().default('contact.mintarabites@gmail.com'),
  supportPhone: z.string().default('+91 7490095115'),
});

export const brandSchema = z
  .object({
    name: z.string().default('Mintara Bites'),
    legalName: z.string().optional(),
    location: z.string().default('Surat, Gujarat, India'),
    fssaiNumber: z.string().optional(),
    tagline: z.string().default('A Perfect Finish to Every Meal'),
    description: z
      .string()
      .default(
        'Mintara Bites is a premium artisanal brand based in Surat, Gujarat, crafting 100% supari-free, tobacco-free Indian mouth fresheners and digestive treats packed fresh on order.',
      ),
    websiteUrl: z.string().url().optional(),
    cartUrl: z.string().url().optional(),
    orderTrackingUrl: z.string().url().optional(),
    instagram: z.string().optional(),
    instagramUrl: z.string().url().optional(),
    googleReviewUrl: z.string().url().optional(),
    supportEmail: z.string().email().optional(),
    supportPhone: z.string().optional(),
    links: brandLinksSchema.optional(),
  })
  .transform((data) => {
    const defaultSite = data.websiteUrl || 'https://mintarabites.com';
    const links = data.links || {
      websiteUrl: defaultSite,
      cartUrl: data.cartUrl || `${defaultSite}/cart`,
      orderTrackingUrl: data.orderTrackingUrl || `${defaultSite}/track-order`,
      instagram: data.instagram || '@mintarabites',
      instagramUrl: data.instagramUrl || 'https://instagram.com/mintarabites',
      googleReviewUrl: data.googleReviewUrl || 'https://g.page/r/mintarabites/review',
      supportEmail: data.supportEmail || 'contact.mintarabites@gmail.com',
      supportPhone: data.supportPhone || '+91 7490095115',
    };

    return {
      name: data.name,
      legalName: data.legalName,
      location: data.location,
      fssaiNumber: data.fssaiNumber,
      tagline: data.tagline,
      description: data.description,
      websiteUrl: data.websiteUrl || links.websiteUrl,
      cartUrl: data.cartUrl || links.cartUrl,
      orderTrackingUrl: data.orderTrackingUrl || links.orderTrackingUrl,
      instagram: data.instagram || links.instagram,
      instagramUrl: data.instagramUrl || links.instagramUrl,
      googleReviewUrl: data.googleReviewUrl || links.googleReviewUrl,
      supportEmail: data.supportEmail || links.supportEmail,
      supportPhone: data.supportPhone || links.supportPhone,
      links: {
        websiteUrl: links.websiteUrl || data.websiteUrl || 'https://mintarabites.com',
        cartUrl: links.cartUrl || data.cartUrl || `${defaultSite}/cart`,
        orderTrackingUrl:
          links.orderTrackingUrl ||
          data.orderTrackingUrl ||
          'https://mintarabites.com/account/orders',
        instagram: links.instagram || data.instagram || '@mintarabites',
        instagramUrl:
          links.instagramUrl || data.instagramUrl || 'https://instagram.com/mintarabites',
        googleReviewUrl:
          links.googleReviewUrl || data.googleReviewUrl || 'https://g.page/r/mintarabites/review',
        supportEmail:
          links.supportEmail || data.supportEmail || 'contact.mintarabites@gmail.com',
        supportPhone: links.supportPhone || data.supportPhone || '+91 7490095115',
      },
    };
  });

export const personaSchema = z.object({
  role: z.string().default('WhatsApp AI Concierge & Customer Assistant'),
  tone: z
    .string()
    .default(
      'Warm, respectful, welcoming, authentic, and concise. Format with WhatsApp markdown (*bold*, emoji accents, short readable paragraphs).',
    ),
  rules: z.array(z.string()).default([]),
  escalationCriteria: z
    .array(z.string())
    .default([
      'Customer requests refunds, replacements, returns, or order cancellations.',
      'Customer reports damaged, broken, missing, or compromised goods.',
      'Customer requests changing delivery address on an existing order.',
      'Customer has a question or issue you cannot answer from available knowledge.',
      'Customer explicitly asks to speak with a human or expresses unresolved frustration.',
    ]),
});

export const knowledgeSchema = z.object({
  values: z.array(z.string()).default([]),
  policies: z.record(z.string()).default({}),
  customMarkdown: z.string().optional(),
});

export const navigationButtonSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export const navigationButtonsSchema = z.object({
  browseCatalog: navigationButtonSchema.default({
    id: 'btn_browse_catalog',
    title: '🛒 Browse Treats',
  }),
  trackOrder: navigationButtonSchema.default({
    id: 'btn_track_order',
    title: '📦 Track on Web',
  }),
  resumeBot: navigationButtonSchema.default({
    id: 'btn_resume_bot',
    title: '🤖 Resume AI Bot',
  }),
  reorderFavorites: navigationButtonSchema.default({
    id: 'btn_reorder_favorites',
    title: '🔄 Reorder Favorites',
  }),
  ndrUpdateAddress: navigationButtonSchema.default({
    id: 'btn_ndr_update_address',
    title: '📍 Update Landmark',
  }),
  ndrReattempt: navigationButtonSchema.default({
    id: 'btn_ndr_reattempt',
    title: '📦 Re-attempt',
  }),
  csat5Star: navigationButtonSchema.default({
    id: 'btn_csat_5_stars',
    title: '⭐⭐⭐⭐⭐ (5 Stars)',
  }),
  csat4Star: navigationButtonSchema.default({
    id: 'btn_csat_4_stars',
    title: '⭐⭐⭐⭐ (4 Stars)',
  }),
  csatLowStar: navigationButtonSchema.default({
    id: 'btn_csat_low_stars',
    title: '⭐ (1-3 Stars)',
  }),
});

export const navigationSchema = z.object({
  buttons: navigationButtonsSchema.default({
    browseCatalog: { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
    trackOrder: { id: 'btn_track_order', title: '📦 Track on Web' },
    resumeBot: { id: 'btn_resume_bot', title: '🤖 Resume AI Bot' },
    reorderFavorites: { id: 'btn_reorder_favorites', title: '🔄 Reorder Favorites' },
    ndrUpdateAddress: { id: 'btn_ndr_update_address', title: '📍 Update Landmark' },
    ndrReattempt: { id: 'btn_ndr_reattempt', title: '📦 Re-attempt' },
    csat5Star: { id: 'btn_csat_5_stars', title: '⭐⭐⭐⭐⭐ (5 Stars)' },
    csat4Star: { id: 'btn_csat_4_stars', title: '⭐⭐⭐⭐ (4 Stars)' },
    csatLowStar: { id: 'btn_csat_low_stars', title: '⭐ (1-3 Stars)' },
  }),
  catalogBrowse: z
    .object({
      header: z
        .string()
        .default('Here are our signature handcrafted artisanal mukhwas: 🌿'),
      footer: z
        .string()
        .default(
          'All treats are *100% supari-free* and *tobacco-free*!\nExplore & order online: {{websiteUrl}}\nFollow us on Instagram: {{instagram}}',
        ),
    })
    .default({}),
});

export const notificationsSchema = z.object({
  orderCreated: z
    .object({
      body: z
        .string()
        .default(
          "Hi {{customerName}}! 🎉\n\nThank you for your order *#{{orderNumber}}* at {{brandName}}! We're handcrafting your 100% supari-free treats with love in {{location}}.\n\n*Ordered Items:*\n{{itemsSummary}}\n\n*Total:* ₹{{totalAmount}}\n\nTrack your order status anytime here: {{orderTrackingUrl}}",
        ),
      buttonKeys: z.array(z.string()).default(['trackOrder']),
    })
    .default({}),
  orderDispatched: z
    .object({
      body: z
        .string()
        .default(
          'Hi {{customerName}}! 🚚\n\nExciting news! Your {{brandName}} order *#{{orderNumber}}* has been freshly packed and handed to our courier partner!\n\nTrack live courier updates directly on your dashboard:\n👉 {{orderTrackingUrl}}',
        ),
      buttonKeys: z.array(z.string()).default(['trackOrder']),
    })
    .default({}),
  orderDelivered: z
    .object({
      refrigerationNudge: z
        .string()
        .default(
          'Your Mintara Paan Mukhwas has arrived! 🌿 Please pop it into the refrigerator right away to preserve its crisp texture and authentic rose aroma.',
        ),
      standardBody: z
        .string()
        .default(
          'Hi {{customerName}}! 🎉\n\nYour {{brandName}} order *#{{orderNumber}}* has been delivered! Enjoy your freshly handcrafted treats.\n\nExplore more treats anytime: {{websiteUrl}}',
        ),
      buttonKeys: z.array(z.string()).default(['browseCatalog']),
    })
    .default({}),
  ndrAlert: z
    .object({
      body: z
        .string()
        .default(
          'Hi {{customerName}}! 🚚\n\nOur courier partner attempted to deliver your {{brandName}} order *#{{orderNumber}}*, but the delivery could not be completed (Reason: {{reason}}).\n\nTo avoid Return to Origin (RTO), please provide updated delivery instructions, an alternative timing, or nearby landmark by replying directly to this message.',
        ),
      buttonKeys: z.array(z.string()).default(['ndrUpdateAddress', 'ndrReattempt']),
    })
    .default({}),
  csatPrompt: z
    .object({
      body: z
        .string()
        .default(
          'Hi {{customerName}}! ✨\n\nHow was your experience with {{brandName}}? We hope you are loving your handcrafted mouth fresheners!\n\nPlease rate your experience with us (1–5 stars):',
        ),
      buttonKeys: z.array(z.string()).default(['csat5Star', 'csat4Star', 'csatLowStar']),
    })
    .default({}),
  cartAbandoned: z
    .object({
      body: z
        .string()
        .default(
          'Hi {{customerName}}! 🌿\n\nWe noticed you left *{{cartItemName}}* in your cart.\n\nYour cart is reserved! Finish your checkout now for pure, 100% supari-free freshness:\n👉 {{cartUrl}}',
        ),
      buttonKeys: z.array(z.string()).default(['browseCatalog']),
    })
    .default({}),
  replenishmentOrRebooking: z
    .object({
      body: z
        .string()
        .default(
          'Hi {{customerName}}! 🌿\n\nYour daily jar of *{{favoriteItem}}* might be running low! A 300g pack lasts about 3-4 weeks for a typical household.\n\nKeep your daily after-meal digestive freshness uninterrupted — handcrafted fresh and packed right before dispatch.\n\n👉 *Tap to reorder your favorites in 1 click:*\n{{reorderOrBookingUrl}}',
        ),
      cycleDays: z.number().default(25),
      buttonKeys: z.array(z.string()).default(['reorderFavorites', 'browseCatalog']),
    })
    .default({}),
});

export const marketingCampaignsSchema = z.object({
  firstOrderNurture: z
    .object({
      discountCode: z.string().default('MINTARA10'),
      promptInstruction: z
        .string()
        .default(
          "The customer completed their first purchase a week ago. Thank them for supporting {{brandName}}, ask how they enjoyed their fresh treat, and recommend exploring another signature favorite (like Seeds Fusion or Coconut Crunch) with a 10% repeat order code '{{discountCode}}'.",
        ),
    })
    .default({}),
  repeatReplenishment: z
    .object({
      reminderCycleDays: z.number().default(30),
      promptInstruction: z
        .string()
        .default(
          'The customer is a valued repeat customer whose order was around 30 days ago. Remind them gently that their daily mukhwas jar might be getting empty! Suggest restocking their digestive freshness with fast delivery.',
        ),
    })
    .default({}),
  cartAbandoned: z
    .object({
      promptInstruction: z
        .string()
        .default(
          "The customer added '{{cartItemName}}' to their cart a few hours ago but hasn't checked out yet. Friendly reminder that their cart is reserved, mentioning our handcrafted fresh quality.",
        ),
    })
    .default({}),
  winBack: z
    .object({
      discountCode: z.string().default('WELCOME15'),
      inactiveThresholdDays: z.number().default(60),
      promptInstruction: z
        .string()
        .default(
          "The customer hasn't ordered in over 60 days. Welcome them back with an exclusive 15% discount code '{{discountCode}}' to try our newest fresh batches.",
        ),
    })
    .default({}),
});

export const supportMessagesSchema = z.object({
  escalationCustomerNotice: z
    .string()
    .default(
      'Hello {{customerName}}! 🙏\n\nI have flagged this for our human support team at {{brandName}} and transferred your order details and full conversation history so you won\'t need to repeat yourself.\n\nA team member is reviewing this now and will step into this chat shortly.\n\n*(To resume automated answers anytime, reply with "start" or tap below).*',
    ),
  escalationAdminDossier: z
    .string()
    .default(
      '🚨 *{{brandName}} - Support Escalation Alert*\n\n• *Customer:* {{customerName}} (+{{customerPhone}})\n• *Direct Chat:* https://wa.me/{{customerPhone}}\n• *Ticket ID:* {{ticketId}}\n\n📦 *Order History:*\n{{ordersSummary}}\n\n⚠️ *Reason for Escalation:*\n{{escalationReason}}\n\n📜 *Conversation Transcript:*\n{{transcript}}\n\n🔒 AI assistant is now MUTED for this customer until resolved.',
    ),
  deliveryRedirect: z
    .string()
    .default(
      'Hi {{customerName}}! 📦\n\nFor real-time delivery status and live courier tracking, please check your order dashboard directly on our store:\n👉 {{orderTrackingUrl}}\n\n*(For your privacy, account security, and real-time carrier sync, live delivery tracking is viewed directly on our web dashboard rather than WhatsApp).* \n\nFeel free to ask if you have any questions about our products, ingredients, or storage! ✨',
    ),
  statusRedirect: z
    .string()
    .default(
      'Hi {{customerName}}! 📦\n\nFor real-time delivery status and live courier tracking, please check your order dashboard directly on our store:\n👉 {{orderTrackingUrl}}\n\n*(For your privacy, account security, and real-time carrier sync, live delivery tracking is viewed directly on our web dashboard rather than WhatsApp).* \n\nFeel free to ask if you have any questions about our products, ingredients, or storage! ✨',
    ),
  botResumed: z
    .string()
    .default(
      'Welcome back, {{customerName}}! ✨\n\nOur automated assistant is back online. How can I help you today?',
    ),
  fallbackError: z
    .string()
    .default(
      'Thank you for contacting {{brandName}}! 🙏\n\nWe received your message and our team is looking into it. If you need immediate assistance, please visit {{websiteUrl}} or email {{supportEmail}}.',
    ),
});

export const businessTypeSchema = z.enum(['ecommerce', 'service', 'hybrid']).default('ecommerce');

export const terminologySchema = z.object({
  itemNoun: z.string().default('treat'),
  itemNounPlural: z.string().default('treats'),
  actionVerb: z.string().default('Order'),
  browseButtonTitle: z.string().default('🛒 Browse Treats'),
  trackingButtonTitle: z.string().default('📦 Track on Web'),
  reorderButtonTitle: z.string().default('🔄 Reorder Favorites'),
});

export const offeringVariantSchema = z.object({
  id: z.string(),
  title: z.string(),
  buttonLabel: z.string().optional(),
  price: z.number(),
  sku: z.string(),
  checkoutOrBookingUrl: z.string().url().optional(),
  durationMinutes: z.number().optional(),
});

export const offeringSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  category: z.string().default('General'),
  type: z.enum(['product', 'service']).default('product'),
  price: z.string(),
  description: z.string(),
  requiresRefrigeration: z.boolean().default(false),
  durationMinutes: z.number().optional(),
  bookingUrl: z.string().url().optional(),
  checkoutUrl: z.string().url().optional(),
  variants: z.array(offeringVariantSchema).default([]),
});

export const productSchema = z.object({
  title: z.string(),
  category: z.string().default('General'),
  price: z.string(),
  description: z.string(),
  requiresRefrigeration: z.boolean().default(false),
});

export const faqSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const businessProfileSchema = z.object({
  $schema: z.string().optional(),
  businessType: businessTypeSchema,
  terminology: terminologySchema.default({}),
  brand: brandSchema.default({}),
  persona: personaSchema.default({}),
  brandHighlights: z.array(z.string()).default([]),
  knowledge: knowledgeSchema.default({}),
  navigation: navigationSchema.default({}),
  quickButtons: z
    .array(navigationButtonSchema)
    .default([
      { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
      { id: 'btn_track_order', title: '📦 Track on Web' },
    ]),
  catalogBrowse: z
    .object({
      header: z
        .string()
        .default('Here are our signature handcrafted artisanal mukhwas: 🌿'),
      footer: z
        .string()
        .default(
          'All treats are *100% supari-free* and *tobacco-free*!\nExplore & order online: {{websiteUrl}}\nFollow us on Instagram: {{instagram}}',
        ),
    })
    .default({}),
  notifications: notificationsSchema.default({}),
  marketingCampaigns: marketingCampaignsSchema.default({}),
  supportMessages: supportMessagesSchema.default({}),
  products: z.array(productSchema).default([]),
  offerings: z.array(offeringSchema).default([]),
  faqs: z.array(faqSchema).default([]),
});

export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export interface LoadedBusinessKnowledge {
  profile: BusinessProfile;
  customKnowledgeMarkdown?: string;
}

let cachedBusinessKnowledge: LoadedBusinessKnowledge | null = null;

/**
 * Replaces {{key}} or {{nested.key}} placeholders in templates with provided variable values.
 */
export function formatTemplate(template: string, vars: Record<string, unknown>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, pathStr) => {
    // 1. Direct variable key match
    if (vars[pathStr] !== undefined && vars[pathStr] !== null) {
      return String(vars[pathStr]);
    }
    // 2. Nested property match (e.g. brand.name or brand.links.websiteUrl)
    const keys = pathStr.split('.');
    let current: Record<string, unknown> | unknown = vars;
    for (const k of keys) {
      if (current === undefined || current === null || typeof current !== 'object') break;
      current = (current as Record<string, unknown>)[k];
    }
    if (current !== undefined && current !== null) {
      return String(current);
    }
    return '';
  });
}

export function loadBusinessKnowledge(forceReload = false): LoadedBusinessKnowledge {
  if (cachedBusinessKnowledge && !forceReload) {
    return cachedBusinessKnowledge;
  }

  const rootDir = findRootDir();
  const explicitPath = process.env.BUSINESS_PROFILE_PATH;
  const candidatePaths = explicitPath
    ? [path.resolve(rootDir, explicitPath)]
    : [
        path.join(rootDir, 'business', 'business-profile.json'),
        path.join(rootDir, 'business', 'profile.json'),
        path.join(rootDir, 'business-profile.json'),
      ];

  let jsonPath = candidatePaths[candidatePaths.length - 1];
  for (const cand of candidatePaths) {
    if (cand && fs.existsSync(cand)) {
      jsonPath = cand;
      break;
    }
  }

  let profileData: unknown = {};

  if (jsonPath && fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      profileData = JSON.parse(raw);
    } catch (err) {
      console.warn(`[config] Failed reading business profile from ${jsonPath}:`, err);
    }
  }

  const parseResult = businessProfileSchema.safeParse(profileData);
  const profile = parseResult.success
    ? parseResult.data
    : businessProfileSchema.parse({});

  // Ensure catalogBrowse syncs between navigation.catalogBrowse and root
  if (profile.navigation?.catalogBrowse) {
    profile.catalogBrowse = {
      header: profile.navigation.catalogBrowse.header || profile.catalogBrowse.header,
      footer: profile.navigation.catalogBrowse.footer || profile.catalogBrowse.footer,
    };
  }

  // Ensure quickButtons does NOT contain legacy btn_talk_human
  if (profile.quickButtons) {
    profile.quickButtons = profile.quickButtons.filter((b) => b.id !== 'btn_talk_human');
  }

  // Sync offerings and products
  if (profile.offerings.length === 0 && profile.products.length > 0) {
    profile.offerings = profile.products.map((p) => ({
      title: p.title,
      category: p.category,
      price: p.price,
      description: p.description,
      requiresRefrigeration: p.requiresRefrigeration,
      type: profile.businessType === 'service' ? 'service' : 'product',
      variants: [],
    }));
  } else if (profile.products.length === 0 && profile.offerings.length > 0) {
    profile.products = profile.offerings.map((o) => ({
      title: o.title,
      category: o.category,
      price: o.price,
      description: o.description,
      requiresRefrigeration: o.requiresRefrigeration || false,
    }));
  }

  // Optional business knowledge markdown file (fallback if not in knowledge.customMarkdown)
  let customMarkdown = profile.knowledge?.customMarkdown;
  if (!customMarkdown) {
    const mdCandidates = [
      path.join(rootDir, 'business', 'business-knowledge.md'),
      path.join(rootDir, 'business', 'instructions.md'),
      path.join(rootDir, 'business-knowledge.md'),
    ];
    for (const mdPath of mdCandidates) {
      if (fs.existsSync(mdPath)) {
        try {
          customMarkdown = fs.readFileSync(mdPath, 'utf8').trim();
          break;
        } catch {
          // Continue to next candidate
        }
      }
    }
  }

  cachedBusinessKnowledge = {
    profile,
    customKnowledgeMarkdown: customMarkdown,
  };

  return cachedBusinessKnowledge;
}

export function getBusinessProfile(): BusinessProfile {
  return loadBusinessKnowledge().profile;
}

export function resetBusinessKnowledgeCache(): void {
  cachedBusinessKnowledge = null;
}

/**
 * Builds the AI System Prompt dynamically from the single business profile document
 */
export function buildBusinessSystemPrompt(options: {
  customerContext?: string;
  productCatalogContext?: string;
}): string {
  const { profile, customKnowledgeMarkdown } = loadBusinessKnowledge();
  const { brand, persona, brandHighlights, faqs, knowledge, businessType, offerings, products, terminology } = profile;

  const isService = businessType === 'service';
  const roleLabel = isService ? 'Services & Appointments' : 'Product Catalog';

  const highlightsSection =
    brandHighlights.length > 0
      ? `Brand Core Highlights:\n${brandHighlights.map((h) => `- ${h}`).join('\n')}`
      : '';

  const valuesSection =
    knowledge?.values && knowledge.values.length > 0
      ? `Brand Values & Philosophy:\n${knowledge.values.map((v) => `- ${v}`).join('\n')}`
      : '';

  const policiesSection =
    knowledge?.policies && Object.keys(knowledge.policies).length > 0
      ? `Brand Policies:\n${Object.entries(knowledge.policies).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`
      : '';

  const rulesSection =
    persona.rules.length > 0
      ? `STRICT INSTRUCTIONS:\n${persona.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
      : '';

  const escalationSection =
    persona.escalationCriteria && persona.escalationCriteria.length > 0
      ? `AUTONOMOUS ESCALATION CRITERIA:
If the customer's issue requires human store administration (refunds, cancellations, damaged goods, address changes) or you cannot resolve it accurately from your verified knowledge:
${persona.escalationCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

YOU MUST START YOUR REPLY WITH:
[ESCALATE: <concise summary of customer issue & why human intervention is required>]
followed by a reassuring message telling the customer that you have transferred their order details and full conversation history to the human support team.`
      : '';

  const faqsSection =
    faqs.length > 0
      ? `Key Brand FAQs:\n${faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}`
      : '';

  const customDocSection =
    knowledge?.customMarkdown || customKnowledgeMarkdown
      ? `\n\nADDITIONAL BUSINESS KNOWLEDGE & POLICIES:\n${knowledge?.customMarkdown || customKnowledgeMarkdown}`
      : '';

  const offeringsSection =
    offerings.length > 0
      ? `Available ${isService ? 'Services & Treatments' : 'Offerings & Products'}:\n` +
        offerings
          .map(
            (o) =>
              `- *${o.title}* (${o.category}): ${o.price}\n  ${o.description}${
                o.durationMinutes ? `\n  Duration: ${o.durationMinutes} minutes` : ''
              }${o.bookingUrl ? `\n  Booking Link: ${o.bookingUrl}` : ''}${
                o.variants && o.variants.length > 0
                  ? '\n  Options/Tiers: ' +
                    o.variants.map((v) => `${v.title} (₹${v.price})`).join(', ')
                  : ''
              }`,
          )
          .join('\n\n')
      : products.length > 0
        ? `Available Products:\n` +
          products
            .map((p) => `- *${p.title}* (${p.category}): ${p.price}\n  ${p.description}`)
            .join('\n\n')
        : '';

  return `You are the friendly, helpful WhatsApp AI Assistant for "${brand.name}" (based in ${brand.location}), ${brand.tagline}.
Business Model: ${businessType.toUpperCase()} (${terminology.itemNounPlural})

Brand Overview:
${brand.description}
Website: ${brand.websiteUrl}
${isService ? `Booking & Scheduling: ${brand.links?.cartUrl || brand.websiteUrl}/book` : `Order Tracking Dashboard: ${brand.orderTrackingUrl}`}
Instagram: ${brand.instagram} (${brand.instagramUrl})
Support Email: ${brand.supportEmail}
${brand.fssaiNumber ? `Registration / License: ${brand.fssaiNumber}` : ''}

${highlightsSection}

${valuesSection}

${policiesSection}

${rulesSection}

${escalationSection}

${offeringsSection}

${faqsSection}${customDocSection}

CUSTOMER CONTEXT:
${options.customerContext || 'Customer Name: Customer\nIdentified in Store DB: Guest/New'}

CURRENT ${roleLabel.toUpperCase()}:
${options.productCatalogContext || `Browse online at ${brand.websiteUrl}`}`;
}
