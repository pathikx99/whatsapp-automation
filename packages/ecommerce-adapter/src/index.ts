import { createLogger } from '@whatsapp-platform/shared';
import { createEcommerceSupabaseClient } from '@whatsapp-platform/database';

export interface EcommerceCustomer {
  id: string;
  phoneNumber?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  customerType?: string;
  segment?: string;
  totalOrders?: number;
  totalSpend?: number;
  lastOrderDate?: string;
  metadata?: Record<string, unknown>;
}

export interface EcommerceOrderItem {
  productId?: string;
  productName: string;
  flavor?: string;
  weightGrams?: number;
  quantity: number;
  unitPrice: number;
}

export interface EcommerceOrder {
  id: string;
  customerId: string;
  orderNumber?: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  items?: EcommerceOrderItem[];
}

export interface EcommerceProductVariant {
  sku: string;
  flavor: string;
  weightGrams: number;
  price: number;
  salePrice: number;
  stockQty: number;
}

export interface EcommerceProduct {
  id: string;
  title: string;
  description?: string;
  category?: string;
  requiresRefrigeration?: boolean;
  benefits?: string[];
  ingredients?: string[];
  variants: EcommerceProductVariant[];
}

export interface WebsiteReview {
  id: string;
  productId: string;
  customerId?: string;
  customerName: string;
  rating: number;
  title?: string;
  comment: string;
  isVerified: boolean;
  createdAt: string;
}

export interface VerifiedPromotion {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping';
  discountValue: number;
  minOrderValue?: number;
  startsAt?: string;
  expiresAt?: string;
  isActive: boolean;
  terms?: string;
}

export interface RFMSegmentSummary {
  champions: EcommerceCustomer[];
  loyal: EcommerceCustomer[];
  atRisk: EcommerceCustomer[];
  oneTimeRecent: EcommerceCustomer[];
  dormant: EcommerceCustomer[];
  counts: {
    champions: number;
    loyal: number;
    atRisk: number;
    oneTimeRecent: number;
    dormant: number;
    total: number;
  };
}

export interface MarketingSegmentCandidate {
  customer: EcommerceCustomer;
  segmentType: 'FIRST_ORDER_NURTURE' | 'REPEAT_REPLENISHMENT' | 'CART_ABANDONED' | 'WIN_BACK';
  contextData?: {
    lastProductName?: string;
    lastOrderDate?: string;
    cartItemName?: string;
    favoriteProduct?: string;
    reorderCheckoutUrl?: string;
    targetReminderDay?: number;
    estimatedRunoutDays?: number;
  };
}

export interface ReplenishmentItem {
  name: string;
  flavor?: string;
  weightGrams?: number;
  quantity: number;
  unitPrice: number;
  sku?: string;
}

export interface ReplenishmentPrediction {
  totalGrams: number;
  dailyConsumptionRateGrams: number;
  estimatedRunoutDays: number;
  targetReminderDay: number;
  isDueForReplenishment: boolean;
  daysSinceLastOrder: number | null;
  favoriteProduct: string;
  recommendedItems: ReplenishmentItem[];
  reorderCheckoutUrl: string;
}

export function generatePrefilledCheckoutUrl(
  items: Array<{
    name: string;
    quantity: number;
    sku?: string;
    unitPrice?: number;
    price?: number;
  }>,
  promoCode?: string,
  baseUrl = 'https://mintarabites.com',
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const itemsParam = items.map((i) => ({
    name: i.name,
    sku: i.sku || i.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    quantity: i.quantity,
    price: i.unitPrice ?? i.price ?? 249,
  }));

  const cartPath = items
    .map((i) => `${i.sku || i.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${i.quantity}`)
    .join(',');

  const queryParams = new URLSearchParams();
  queryParams.set('add', cartPath);
  queryParams.set('items', JSON.stringify(itemsParam));
  if (promoCode) {
    queryParams.set('discount', promoCode.trim().toUpperCase());
  }
  queryParams.set('source', 'whatsapp_commerce');

  return `${cleanBase}/cart?${queryParams.toString()}`;
}

export function calculateConsumptionVelocity(
  orders: EcommerceOrder[],
  options: {
    dailyRateGrams?: number;
    websiteUrl?: string;
    promoCode?: string;
  } = {},
): ReplenishmentPrediction {
  const dailyRate = options.dailyRateGrams || 12; // ~12g daily after-meal consumption for typical household
  const websiteUrl = options.websiteUrl || 'https://mintarabites.com';

  if (!orders || orders.length === 0) {
    // Default fallback assumption: standard 300g household pack
    const defaultItems: ReplenishmentItem[] = [
      {
        name: 'Artisanal Paan Mukhwas (300g)',
        flavor: 'Traditional Calcuttia',
        weightGrams: 300,
        quantity: 1,
        unitPrice: 249,
        sku: 'paan-mukhwas-300g',
      },
    ];

    return {
      totalGrams: 300,
      dailyConsumptionRateGrams: dailyRate,
      estimatedRunoutDays: 25,
      targetReminderDay: 25,
      isDueForReplenishment: false,
      daysSinceLastOrder: null,
      favoriteProduct: 'Artisanal Paan Mukhwas (300g)',
      recommendedItems: defaultItems,
      reorderCheckoutUrl: generatePrefilledCheckoutUrl(defaultItems, options.promoCode, websiteUrl),
    };
  }

  // Evaluate recent order and all order history
  const recentOrder = orders[0];
  if (!recentOrder) {
    const defaultItems: ReplenishmentItem[] = [
      {
        name: 'Artisanal Paan Mukhwas (300g)',
        flavor: 'Traditional Calcuttia',
        weightGrams: 300,
        quantity: 1,
        unitPrice: 249,
        sku: 'paan-mukhwas-300g',
      },
    ];

    return {
      totalGrams: 300,
      dailyConsumptionRateGrams: dailyRate,
      estimatedRunoutDays: 25,
      targetReminderDay: 25,
      isDueForReplenishment: false,
      daysSinceLastOrder: null,
      favoriteProduct: 'Artisanal Paan Mukhwas (300g)',
      recommendedItems: defaultItems,
      reorderCheckoutUrl: generatePrefilledCheckoutUrl(defaultItems, options.promoCode, websiteUrl),
    };
  }

  const itemFrequency: Record<string, { count: number; item: ReplenishmentItem }> = {};

  let totalGrams = 0;
  for (const item of recentOrder.items || []) {
    let weight = item.weightGrams;
    if (!weight) {
      if (item.productName.includes('500g')) weight = 500;
      else if (item.productName.includes('300g')) weight = 300;
      else if (item.productName.includes('350g')) weight = 350;
      else if (item.productName.includes('700g')) weight = 700;
      else if (item.productName.includes('150g')) weight = 150;
      else if (item.productName.includes('100g')) weight = 100;
      else if (item.productName.includes('200g')) weight = 200;
      else weight = 300;
    }
    totalGrams += weight * item.quantity;
  }

  // Tally item popularity across all past orders to determine favorites
  for (const order of orders) {
    for (const item of order.items || []) {
      const key = item.productName;
      if (!itemFrequency[key]) {
        itemFrequency[key] = {
          count: 0,
          item: {
            name: item.productName,
            flavor: item.flavor,
            weightGrams: item.weightGrams || 300,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            sku: item.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          },
        };
      }
      itemFrequency[key].count += item.quantity;
    }
  }

  const sortedFavorites = Object.values(itemFrequency).sort((a, b) => b.count - a.count);
  const favoriteProduct = sortedFavorites[0]?.item.name || 'Artisanal Paan Mukhwas (300g)';
  const recommendedItems =
    sortedFavorites.length > 0 ? sortedFavorites.slice(0, 3).map((f) => f.item) : [];

  if (totalGrams <= 0) totalGrams = 300;

  // Calculate estimated runout duration based on consumption velocity
  // E.g., 300g / 12g per day = 25 days (~3-4 weeks for typical household)
  const estimatedRunoutDays = Math.max(14, Math.round(totalGrams / dailyRate));
  const targetReminderDay = Math.min(estimatedRunoutDays, 25); // Day 25 target for standard 3-4 week cycles

  const now = Date.now();
  const lastOrderTime = recentOrder.createdAt ? new Date(recentOrder.createdAt).getTime() : 0;
  const daysSinceLastOrder =
    lastOrderTime > 0 ? Math.floor((now - lastOrderTime) / (24 * 60 * 60 * 1000)) : null;

  const isDueForReplenishment =
    daysSinceLastOrder !== null &&
    daysSinceLastOrder >= targetReminderDay &&
    daysSinceLastOrder <= targetReminderDay + 15;

  return {
    totalGrams,
    dailyConsumptionRateGrams: dailyRate,
    estimatedRunoutDays,
    targetReminderDay,
    isDueForReplenishment,
    daysSinceLastOrder,
    favoriteProduct,
    recommendedItems,
    reorderCheckoutUrl: generatePrefilledCheckoutUrl(
      recommendedItems,
      options.promoCode,
      websiteUrl,
    ),
  };
}

export interface EcommerceAdapter {
  isConfigured(): boolean;
  getCustomerByPhone(phoneNumber: string): Promise<EcommerceCustomer | null>;
  getCustomerOrders(customerId: string): Promise<EcommerceOrder[]>;
  getAllActiveProducts(): Promise<EcommerceProduct[]>;
  searchProducts(query: string, limit?: number): Promise<EcommerceProduct[]>;
  getMarketingCandidates(): Promise<MarketingSegmentCandidate[]>;
  predictReplenishment(customerId: string): Promise<ReplenishmentPrediction | null>;
  getWebsiteReviews(productId?: string): Promise<WebsiteReview[]>;
  getActivePromotion(options?: {
    customerId?: string;
    orderAmount?: number;
  }): Promise<VerifiedPromotion | null>;
  getRFMSegments(): Promise<RFMSegmentSummary>;
}

interface PostgrestFallback<T = any> {
  data: T | null;
  error: unknown;
}

function emptyFallback<T = any>(): PostgrestFallback<T> {
  return { data: null, error: null };
}

export function createEcommerceAdapter(): EcommerceAdapter {
  const logger = createLogger({ name: 'ecommerce-adapter' });

  async function runWithTimeout<T>(
    queryPromise: PromiseLike<T>,
    timeoutMs = 1500,
    fallback: T,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), timeoutMs);
    });
    try {
      return await Promise.race([Promise.resolve(queryPromise), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    isConfigured(): boolean {
      try {
        const client = createEcommerceSupabaseClient();
        return Boolean(client);
      } catch {
        return false;
      }
    },

    async getCustomerByPhone(phoneNumber: string): Promise<EcommerceCustomer | null> {
      try {
        const client = createEcommerceSupabaseClient();
        const digitsOnly = phoneNumber.replace(/\D/g, '');
        // Common phone representations: with or without country code 91
        const phone10 =
          digitsOnly.length > 10 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;
        const phone12 = digitsOnly.length === 10 ? `91${digitsOnly}` : digitsOnly;

        logger.debug({ digitsOnly, phone10, phone12 }, 'Querying customer by phone');

        const { data, error } = await runWithTimeout(
          client
            .from('customers')
            .select(
              'id, email, first_name, last_name, phone, customer_type, segment, total_spend, total_orders, last_order_date',
            )
            .or(`phone.eq.${phone10},phone.eq.${phone12},phone.eq.${digitsOnly}`)
            .limit(1)
            .maybeSingle(),
          1500,
          emptyFallback(),
        );

        if (error) {
          logger.error({ error, phoneNumber }, 'Error fetching customer by phone');
          return null;
        }

        if (!data) return null;

        return {
          id: data.id,
          phoneNumber: data.phone,
          email: data.email,
          firstName: data.first_name,
          lastName: data.last_name,
          customerType: data.customer_type,
          segment: data.segment,
          totalOrders: data.total_orders,
          totalSpend: data.total_spend,
          lastOrderDate: data.last_order_date,
        };
      } catch (err) {
        logger.error({ err, phoneNumber }, 'Failed querying customer by phone');
        return null;
      }
    },

    async getCustomerOrders(customerId: string): Promise<EcommerceOrder[]> {
      try {
        const client = createEcommerceSupabaseClient();
        const { data, error } = await runWithTimeout(
          client
            .from('orders')
            .select(
              'id, order_number, customer_id, status, payment_status, payment_method, total_amount, created_at, order_items(quantity, price_at_purchase, product_variants(sku, flavor, weight_grams, products(name)))',
            )
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })
            .limit(50),
          1500,
          emptyFallback(),
        );

        if (error) {
          logger.error({ error, customerId }, 'Error fetching customer orders');
          return [];
        }

        return (data || []).map((row: any) => ({
          id: row.id,
          customerId: row.customer_id,
          orderNumber: row.order_number,
          status: row.status,
          paymentStatus: row.payment_status,
          paymentMethod: row.payment_method,
          totalAmount: Number(row.total_amount),
          currency: 'INR',
          createdAt: row.created_at,
          items: (row.order_items || []).map((item: any) => ({
            productName: item.product_variants?.products?.name || 'Mukhwas',
            flavor: item.product_variants?.flavor,
            weightGrams: item.product_variants?.weight_grams,
            quantity: item.quantity,
            unitPrice: Number(item.price_at_purchase),
          })),
        }));
      } catch (err) {
        logger.error({ err, customerId }, 'Failed fetching customer orders');
        return [];
      }
    },

    async getAllActiveProducts(): Promise<EcommerceProduct[]> {
      try {
        const client = createEcommerceSupabaseClient();
        const { data, error } = await runWithTimeout(
          client
            .from('products')
            .select(
              'id, name, description, category, requires_refrigeration, metadata, product_variants(sku, flavor, weight_grams, price, sale_price, stock_qty)',
            )
            .eq('is_active', true)
            .limit(200),
          1500,
          emptyFallback(),
        );

        if (error) {
          logger.error({ error }, 'Error fetching active products');
          return [];
        }

        return (data || []).map((p: any) => ({
          id: p.id,
          title: p.name,
          description: p.description,
          category: p.category,
          requiresRefrigeration: Boolean(p.requires_refrigeration),
          benefits: p.metadata?.benefits || [],
          ingredients: p.metadata?.ingredients || [],
          variants: (p.product_variants || []).map((v: any) => ({
            sku: v.sku,
            flavor: v.flavor,
            weightGrams: Number(v.weight_grams),
            price: Number(v.price),
            salePrice: Number(v.sale_price),
            stockQty: Number(v.stock_qty),
          })),
        }));
      } catch (err) {
        logger.error({ err }, 'Failed fetching active products');
        return [];
      }
    },

    async searchProducts(query: string, limit = 5): Promise<EcommerceProduct[]> {
      const all = await this.getAllActiveProducts();
      if (!query || query.trim() === '') return all.slice(0, limit);
      const lower = query.toLowerCase();
      return all
        .filter(
          (p) =>
            p.title.toLowerCase().includes(lower) ||
            p.description?.toLowerCase().includes(lower) ||
            p.variants.some((v) => v.flavor.toLowerCase().includes(lower)),
        )
        .slice(0, limit);
    },

    async getMarketingCandidates(): Promise<MarketingSegmentCandidate[]> {
      try {
        const client = createEcommerceSupabaseClient();
        const candidates: MarketingSegmentCandidate[] = [];

        // 1. Fetch recent customers (bounded limit to prevent OOM / table lock)
        const { data: customers, error } = await runWithTimeout(
          client
            .from('customers')
            .select(
              'id, email, first_name, last_name, phone, segment, total_orders, total_spend, last_order_date',
            )
            .order('last_order_date', { ascending: false, nullsFirst: false })
            .limit(2000),
          1500,
          emptyFallback(),
        );

        if (error || !customers || customers.length === 0) {
          logger.error({ error }, 'Error fetching customers for marketing segments');
          return [];
        }

        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        for (const c of customers) {
          if (!c.phone) continue;

          const customerObj: EcommerceCustomer = {
            id: c.id,
            phoneNumber: c.phone,
            email: c.email,
            firstName: c.first_name,
            lastName: c.last_name,
            totalOrders: c.total_orders,
            totalSpend: c.total_spend,
            lastOrderDate: c.last_order_date,
          };

          const lastOrderTime = c.last_order_date ? new Date(c.last_order_date).getTime() : 0;
          const daysSinceLastOrder =
            lastOrderTime > 0 ? Math.floor((now - lastOrderTime) / oneDay) : null;

          if (
            c.total_orders === 1 &&
            daysSinceLastOrder !== null &&
            daysSinceLastOrder >= 5 &&
            daysSinceLastOrder <= 12
          ) {
            candidates.push({
              customer: customerObj,
              segmentType: 'FIRST_ORDER_NURTURE',
              contextData: { lastOrderDate: c.last_order_date },
            });
          } else if (
            c.total_orders >= 1 &&
            daysSinceLastOrder !== null &&
            daysSinceLastOrder >= 25 &&
            daysSinceLastOrder <= 40
          ) {
            candidates.push({
              customer: customerObj,
              segmentType: 'REPEAT_REPLENISHMENT',
              contextData: {
                lastOrderDate: c.last_order_date,
                targetReminderDay: 25,
                estimatedRunoutDays: 25,
                favoriteProduct: 'Artisanal Paan Mukhwas (300g)',
              },
            });
          } else if (
            c.total_orders >= 1 &&
            daysSinceLastOrder !== null &&
            daysSinceLastOrder > 60
          ) {
            candidates.push({
              customer: customerObj,
              segmentType: 'WIN_BACK',
              contextData: { lastOrderDate: c.last_order_date },
            });
          }
        }

        // 2. Check Cart Abandonment (bounded limit to prevent OOM)
        const { data: cartItems } = await runWithTimeout(
          client
            .from('cart_items')
            .select('customer_id, product_variants(sku, products(name)), created_at')
            .order('created_at', { ascending: false })
            .limit(1000),
          1500,
          emptyFallback(),
        );

        if (cartItems && cartItems.length > 0) {
          for (const item of cartItems) {
            const cust = customers.find((c: any) => c.id === item.customer_id);
            if (!cust || !cust.phone) continue;

            // Only consider abandoned if created > 2 hours ago
            const itemTime = new Date(item.created_at).getTime();
            const hoursAgo = (now - itemTime) / (60 * 60 * 1000);
            if (hoursAgo >= 2 && hoursAgo <= 48) {
              // Avoid duplicate if already in candidates
              if (!candidates.some((cand) => cand.customer.id === cust.id)) {
                candidates.push({
                  customer: {
                    id: cust.id,
                    phoneNumber: cust.phone,
                    firstName: cust.first_name,
                  },
                  segmentType: 'CART_ABANDONED',
                  contextData: {
                    cartItemName: (item.product_variants as any)?.products?.name || 'Mukhwas',
                  },
                });
              }
            }
          }
        }

        return candidates;
      } catch (err) {
        logger.error({ err }, 'Failed calculating marketing segment candidates');
        return [];
      }
    },

    async predictReplenishment(customerId: string): Promise<ReplenishmentPrediction | null> {
      try {
        const orders = await this.getCustomerOrders(customerId);
        return calculateConsumptionVelocity(orders);
      } catch (err) {
        logger.error({ err, customerId }, 'Failed predicting replenishment');
        return null;
      }
    },

    async getWebsiteReviews(productId?: string): Promise<WebsiteReview[]> {
      try {
        const client = createEcommerceSupabaseClient();
        let query = client
          .from('reviews')
          .select(
            'id, product_id, customer_id, customer_name, rating, title, comment, is_verified, created_at',
          )
          .order('created_at', { ascending: false });

        if (productId) {
          query = query.eq('product_id', productId);
        }

        const { data, error } = await runWithTimeout(query, 1500, emptyFallback());
        if (error) {
          logger.warn(
            { error, productId },
            'Non-fatal error reading website reviews from ecommerce database',
          );
          return [];
        }

        return (data || []).map((row: any) => ({
          id: row.id,
          productId: row.product_id,
          customerId: row.customer_id,
          customerName: row.customer_name,
          rating: Number(row.rating),
          title: row.title,
          comment: row.comment,
          isVerified: Boolean(row.is_verified),
          createdAt: row.created_at,
        }));
      } catch (err) {
        logger.warn({ err, productId }, 'Failed querying website reviews from store database');
        return [];
      }
    },

    async getActivePromotion(
      options: { customerId?: string; orderAmount?: number } = {},
    ): Promise<VerifiedPromotion | null> {
      try {
        const client = createEcommerceSupabaseClient();
        if (!client) return null;

        const queryWithTimeout = async () => {
          // 1. Check primary 'promotions' table in website Supabase database
          let { data, error } = await client
            .from('promotions')
            .select(
              'id, code, discount_type, discount_value, min_order_value, starts_at, expires_at, is_active, terms',
            )
            .eq('is_active', true)
            .order('discount_value', { ascending: false })
            .limit(50);

          // 2. Fallback check for 'coupons' table if promotions not found or errored
          if (error || !data || data.length === 0) {
            const fallback = await client
              .from('coupons')
              .select(
                'id, code, discount_type, discount_value, min_order_value, starts_at, expires_at, is_active, terms',
              )
              .eq('is_active', true)
              .order('discount_value', { ascending: false })
              .limit(50);

            if (!fallback.error && fallback.data && fallback.data.length > 0) {
              data = fallback.data;
              error = null;
            }
          }
          return { data, error };
        };

        const timeoutPromise = new Promise<{ data: null; error: null }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: null }), 1500),
        );

        const { data, error } = await Promise.race([queryWithTimeout(), timeoutPromise]);

        if (error || !data || data.length === 0) {
          return null;
        }

        const now = Date.now();
        // Validate time window and min order value
        const validPromo = data.find((p: any) => {
          if (!p.code || !p.is_active) return false;
          if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
          if (p.expires_at && new Date(p.expires_at).getTime() < now) return false;
          if (
            options.orderAmount !== undefined &&
            p.min_order_value &&
            options.orderAmount < Number(p.min_order_value)
          ) {
            return false;
          }
          return true;
        });

        if (!validPromo) return null;

        return {
          id: String(validPromo.id),
          code: String(validPromo.code).trim().toUpperCase(),
          discountType: validPromo.discount_type || 'percentage',
          discountValue: Number(validPromo.discount_value) || 0,
          minOrderValue: validPromo.min_order_value
            ? Number(validPromo.min_order_value)
            : undefined,
          startsAt: validPromo.starts_at,
          expiresAt: validPromo.expires_at,
          isActive: Boolean(validPromo.is_active),
          terms: validPromo.terms,
        };
      } catch (err) {
        logger.debug({ err }, 'Safe check: No active promotions found in website database');
        return null;
      }
    },

    async getRFMSegments(): Promise<RFMSegmentSummary> {
      try {
        const client = createEcommerceSupabaseClient();
        if (!client) {
          return {
            champions: [],
            loyal: [],
            atRisk: [],
            oneTimeRecent: [],
            dormant: [],
            counts: { champions: 0, loyal: 0, atRisk: 0, oneTimeRecent: 0, dormant: 0, total: 0 },
          };
        }

        const { data: customers, error } = await runWithTimeout(
          client
            .from('customers')
            .select(
              'id, email, first_name, last_name, phone, customer_type, segment, total_spend, total_orders, last_order_date',
            )
            .order('last_order_date', { ascending: false, nullsFirst: false })
            .limit(5000),
          1500,
          emptyFallback(),
        );

        if (error || !customers || customers.length === 0) {
          return {
            champions: [],
            loyal: [],
            atRisk: [],
            oneTimeRecent: [],
            dormant: [],
            counts: { champions: 0, loyal: 0, atRisk: 0, oneTimeRecent: 0, dormant: 0, total: 0 },
          };
        }

        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        const champions: EcommerceCustomer[] = [];
        const loyal: EcommerceCustomer[] = [];
        const atRisk: EcommerceCustomer[] = [];
        const oneTimeRecent: EcommerceCustomer[] = [];
        const dormant: EcommerceCustomer[] = [];

        for (const c of customers) {
          const cust: EcommerceCustomer = {
            id: c.id,
            phoneNumber: c.phone,
            email: c.email,
            firstName: c.first_name,
            lastName: c.last_name,
            totalOrders: c.total_orders || 0,
            totalSpend: Number(c.total_spend) || 0,
            lastOrderDate: c.last_order_date,
          };

          const lastOrderTime = c.last_order_date ? new Date(c.last_order_date).getTime() : 0;
          const daysSinceLastOrder =
            lastOrderTime > 0 ? Math.floor((now - lastOrderTime) / oneDay) : null;
          const ordersCount = cust.totalOrders || 0;

          if (ordersCount >= 3 && daysSinceLastOrder !== null && daysSinceLastOrder <= 35) {
            champions.push(cust);
          } else if (ordersCount >= 2 && daysSinceLastOrder !== null && daysSinceLastOrder <= 50) {
            loyal.push(cust);
          } else if (
            ordersCount >= 2 &&
            daysSinceLastOrder !== null &&
            daysSinceLastOrder > 50 &&
            daysSinceLastOrder <= 100
          ) {
            atRisk.push(cust);
          } else if (ordersCount === 1 && daysSinceLastOrder !== null && daysSinceLastOrder <= 30) {
            oneTimeRecent.push(cust);
          } else {
            dormant.push(cust);
          }
        }

        return {
          champions,
          loyal,
          atRisk,
          oneTimeRecent,
          dormant,
          counts: {
            champions: champions.length,
            loyal: loyal.length,
            atRisk: atRisk.length,
            oneTimeRecent: oneTimeRecent.length,
            dormant: dormant.length,
            total: customers.length,
          },
        };
      } catch (err) {
        logger.error({ err }, 'Failed calculating RFM segments from Supabase database');
        return {
          champions: [],
          loyal: [],
          atRisk: [],
          oneTimeRecent: [],
          dormant: [],
          counts: { champions: 0, loyal: 0, atRisk: 0, oneTimeRecent: 0, dormant: 0, total: 0 },
        };
      }
    },
  };
}
