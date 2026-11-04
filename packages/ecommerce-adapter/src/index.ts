import { createLogger } from '@whatsapp-platform/shared';
import { createEcommerceSupabaseClient } from '@whatsapp-platform/database';

export interface EcommerceCustomer {
  id: string;
  phoneNumber?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  metadata?: Record<string, unknown>;
}

export interface EcommerceOrder {
  id: string;
  customerId: string;
  orderNumber?: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  items?: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export interface EcommerceProduct {
  id: string;
  title: string;
  description?: string;
  price: number;
  currency: string;
  inStock: boolean;
  sku?: string;
}

/**
 * Contract for the read-only ecommerce adapter.
 * Implementation will be fleshed out after inspecting the existing remote schema.
 */
export interface EcommerceAdapter {
  isConfigured(): boolean;
  getCustomerByPhone(phoneNumber: string): Promise<EcommerceCustomer | null>;
  getCustomerOrders(customerId: string): Promise<EcommerceOrder[]>;
  searchProducts(query: string, limit?: number): Promise<EcommerceProduct[]>;
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
      logger.debug({ phoneNumber }, 'Adapter stub: query pending schema inspection');
      return null;
    },

    async getCustomerOrders(customerId: string): Promise<EcommerceOrder[]> {
      logger.debug({ customerId }, 'Adapter stub: query pending schema inspection');
      return [];
    },

    async searchProducts(query: string, _limit = 10): Promise<EcommerceProduct[]> {
      logger.debug({ query }, 'Adapter stub: search pending schema inspection');
      return [];
    },
  };
}
