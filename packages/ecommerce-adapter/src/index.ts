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

export interface MarketingSegmentCandidate {
  customer: EcommerceCustomer;
  segmentType: 'FIRST_ORDER_NURTURE' | 'REPEAT_REPLENISHMENT' | 'CART_ABANDONED' | 'WIN_BACK';
  contextData?: {
    lastProductName?: string;
    lastOrderDate?: string;
    cartItemName?: string;
  };
}

export interface EcommerceAdapter {
  isConfigured(): boolean;
  getCustomerByPhone(phoneNumber: string): Promise<EcommerceCustomer | null>;
  getCustomerOrders(customerId: string): Promise<EcommerceOrder[]>;
  getAllActiveProducts(): Promise<EcommerceProduct[]>;
  searchProducts(query: string, limit?: number): Promise<EcommerceProduct[]>;
  getMarketingCandidates(): Promise<MarketingSegmentCandidate[]>;
}

export function createEcommerceAdapter(): EcommerceAdapter {
  const logger = createLogger({ name: 'ecommerce-adapter' });

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

        const { data, error } = await client
          .from('customers')
          .select(
            'id, email, first_name, last_name, phone, customer_type, segment, total_spend, total_orders, last_order_date',
          )
          .or(`phone.eq.${phone10},phone.eq.${phone12},phone.eq.${digitsOnly}`)
          .limit(1)
          .maybeSingle();

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
        const { data, error } = await client
          .from('orders')
          .select(
            'id, order_number, customer_id, status, payment_status, payment_method, total_amount, created_at, order_items(quantity, price_at_purchase, product_variants(sku, flavor, weight_grams, products(name)))',
          )
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });

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
        const { data, error } = await client
          .from('products')
          .select(
            'id, name, description, category, requires_refrigeration, metadata, product_variants(sku, flavor, weight_grams, price, sale_price, stock_qty)',
          )
          .eq('is_active', true);

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

        // 1. Fetch recent customers & check their orders
        const { data: customers, error } = await client
          .from('customers')
          .select(
            'id, email, first_name, last_name, phone, segment, total_orders, total_spend, last_order_date',
          );

        if (error || !customers) {
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
              contextData: { lastOrderDate: c.last_order_date },
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

        // 2. Check Cart Abandonment
        const { data: cartItems } = await client
          .from('cart_items')
          .select('customer_id, product_variants(sku, products(name)), created_at');

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
  };
}
