import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { findRootDir } from './index.js';

export const businessProfileSchema = z.object({
  brand: z.object({
    name: z.string().default('Mintara Bites'),
    legalName: z.string().optional(),
    location: z.string().default('Surat, Gujarat, India'),
    fssaiNumber: z.string().optional(),
    tagline: z.string().default('A Perfect Finish to Every Meal'),
    description: z.string().default('Handcrafted Indian mouth fresheners & digestive treats.'),
    websiteUrl: z.string().url().default('https://mintarabites.com'),
    orderTrackingUrl: z.string().url().default('https://mintarabites.com/account/orders'),
    instagram: z.string().default('@mintarabites'),
    instagramUrl: z.string().url().default('https://instagram.com/mintarabites'),
    supportEmail: z.string().email().default('contact@mintarabites.com'),
    supportPhone: z.string().optional(),
  }),
  persona: z.object({
    role: z.string().default('WhatsApp AI Brand Concierge'),
    tone: z.string().default('Warm, respectful, welcoming, authentic, and concise.'),
    rules: z.array(z.string()).default([]),
  }),
  brandHighlights: z.array(z.string()).default([]),
  quickButtons: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
    )
    .default([
      { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
      { id: 'btn_track_order', title: '📦 Track on Web' },
      { id: 'btn_talk_human', title: '🙋 Talk to Agent' },
    ]),
  catalogBrowse: z.object({
    header: z.string().default('Here are our signature offerings: 🌿'),
    footer: z.string().default('Explore & order online: https://mintarabites.com'),
  }),
  products: z
    .array(
      z.object({
        title: z.string(),
        category: z.string().default('General'),
        price: z.string(),
        description: z.string(),
        requiresRefrigeration: z.boolean().default(false),
      }),
    )
    .default([]),
  faqs: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    )
    .default([]),
});

export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export interface LoadedBusinessKnowledge {
  profile: BusinessProfile;
  customKnowledgeMarkdown?: string;
}

let cachedBusinessKnowledge: LoadedBusinessKnowledge | null = null;

export function loadBusinessKnowledge(forceReload = false): LoadedBusinessKnowledge {
  if (cachedBusinessKnowledge && !forceReload) {
    return cachedBusinessKnowledge;
  }

  const rootDir = findRootDir();
  const explicitPath = process.env.BUSINESS_PROFILE_PATH;
  const jsonPath = explicitPath
    ? path.resolve(rootDir, explicitPath)
    : path.join(rootDir, 'business-profile.json');

  let profileData: unknown = {};

  if (fs.existsSync(jsonPath)) {
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

  // Optional business knowledge markdown file
  let customMarkdown: string | undefined;
  const mdPath = path.join(rootDir, 'business-knowledge.md');
  if (fs.existsSync(mdPath)) {
    try {
      customMarkdown = fs.readFileSync(mdPath, 'utf8').trim();
    } catch {
      // Ignore if unreadable
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
  const { brand, persona, brandHighlights, faqs } = profile;

  const highlightsSection =
    brandHighlights.length > 0
      ? `Brand Core Highlights:\n${brandHighlights.map((h) => `- ${h}`).join('\n')}`
      : '';

  const rulesSection =
    persona.rules.length > 0
      ? `STRICT INSTRUCTIONS:\n${persona.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
      : '';

  const faqsSection =
    faqs.length > 0
      ? `Key Brand FAQs:\n${faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}`
      : '';

  const customDocSection = customKnowledgeMarkdown
    ? `\n\nADDITIONAL BUSINESS KNOWLEDGE & POLICIES:\n${customKnowledgeMarkdown}`
    : '';

  return `You are the friendly, helpful WhatsApp AI Assistant for "${brand.name}" (based in ${brand.location}), ${brand.tagline}.

Brand Overview:
${brand.description}
Website: ${brand.websiteUrl}
Order Tracking Dashboard: ${brand.orderTrackingUrl}
Instagram: ${brand.instagram} (${brand.instagramUrl})
Support Email: ${brand.supportEmail}
${brand.fssaiNumber ? `FSSAI License: ${brand.fssaiNumber}` : ''}

${highlightsSection}

${rulesSection}

${faqsSection}${customDocSection}

CUSTOMER CONTEXT:
${options.customerContext || 'Customer Name: Customer\nIdentified in Store DB: Guest/New'}

CURRENT PRODUCT CATALOG:
${options.productCatalogContext || 'Browse catalog online at ' + brand.websiteUrl}`;
}
