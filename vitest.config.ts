import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@whatsapp-platform/config': path.resolve(__dirname, './packages/config/src/index.ts'),
      '@whatsapp-platform/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
      '@whatsapp-platform/database': path.resolve(__dirname, './packages/database/src/index.ts'),
      '@whatsapp-platform/ecommerce-adapter': path.resolve(__dirname, './packages/ecommerce-adapter/src/index.ts'),
      '@whatsapp-platform/whatsapp': path.resolve(__dirname, './packages/whatsapp/src/index.ts'),
      '@whatsapp-platform/ai': path.resolve(__dirname, './packages/ai/src/index.ts'),
    },
  },
});
