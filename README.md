# Independent WhatsApp Marketing & AI Customer Support Platform

A high-performance, modular monorepo platform designed to provide automated WhatsApp marketing campaigns and AI-driven customer support for an existing ecommerce application.

---

## Architecture Summary

```
whatsapp-platform/
├── apps/
│   ├── api/                   # Fastify backend API (Health, readiness, webhooks)
│   ├── marketing-engine/      # Scaffolding for campaign orchestration & broadcasts
│   ├── support-engine/        # Scaffolding for AI support conversation routing
│   └── worker/                # Background job queue worker
├── packages/
│   ├── config/                # Centralized Zod schema validation & secret masking
│   ├── shared/                # Pino structured logger, custom errors, shutdown handlers
│   ├── database/              # Dual database clients (Local read/write vs Remote read-only)
│   ├── ecommerce-adapter/     # Decoupled domain interfaces & read-only contracts
│   ├── whatsapp/              # WhatsApp gateway interfaces & providers
│   └── ai/                    # AI provider contracts & LLM adapters
├── supabase/
│   ├── config.toml            # Local Supabase CLI configuration
│   ├── migrations/            # Schema foundation migrations (integration, marketing, support, messaging)
│   └── seed.sql               # Local development seed data
├── scripts/
│   └── db-guard.ts            # Protection script enforcing local-only db:reset operations
├── tests/
│   └── integration/           # Integration test suite (health, readiness, safety, env)
└── docs/
    └── architecture.md        # Comprehensive architecture & isolation documentation
```

For full architectural details, see [docs/architecture.md](docs/architecture.md).

---

## Prerequisites

Ensure the following tools are installed on your host machine:

- **Node.js**: `v20.0.0` or higher (verified on `v24.x`)
- **pnpm**: `v9.x` or higher (`v12.x` verified)
- **Docker**: Docker Engine running (required for local Supabase)
- **Supabase CLI**: `v1.x` or higher (`v3.0.0` verified)

---

## Installation & Setup

### 1. Clone & Install Dependencies

```bash
git clone <repo-url> whatsapp-platform
cd whatsapp-platform
pnpm install
```

### 2. Configure Environment

Copy the example environment template:

```bash
cp .env.example .env
```

Edit `.env` to verify your local settings. By default, the template is preconfigured for local Docker Supabase.

> [!IMPORTANT]
> Never commit `.env` or any file containing credentials to source control.

---

## Local Database Management

This platform utilizes local Supabase (running via Docker) for all development and automated integration testing.

### Start Local Supabase
```bash
pnpm db:start
```
This spins up PostgreSQL, Supabase Studio, Inbucket email testing, and the Auth/Storage engines.

### Check Local Supabase Status
```bash
pnpm db:status
```
Outputs local API keys, PostgreSQL ports (default `54322`), and the Supabase Studio dashboard URL (default `http://localhost:54323`).

### Run Migrations & Reset Local Database
```bash
pnpm db:reset
```
> [!NOTE]
> `pnpm db:reset` is protected by `scripts/db-guard.ts`. It verifies that the database URL points strictly to a local address (`localhost` or `127.0.0.1`) and halts immediately if executed against any remote host or production environment.

### Stop Local Supabase
```bash
pnpm db:stop
```

---

## Platform Database Schemas

The platform maintains four isolated schemas inside PostgreSQL:

- **`integration`**: Connector cursors, sync logs, and ecommerce webhook checkpoints.
- **`marketing`**: Broadcast definitions, campaigns, and audience segments.
- **`support`**: AI conversation histories, ticket state, and context memory.
- **`messaging`**: WhatsApp message dispatch queues and delivery status logs.

Initial migration: `supabase/migrations/20261105000000_platform_schemas.sql`.

---

## Connecting the Existing Ecommerce Supabase Safely

To connect the platform to your existing Next.js/Supabase ecommerce store:

1. Configure `ECOMMERCE_SUPABASE_URL` and `ECOMMERCE_SUPABASE_ANON_KEY` in `.env`.
2. *(Optional)* If using direct database querying, configure `ECOMMERCE_DATABASE_URL_RO` using a **read-only** database role.
3. **Safety Guarantee**:
   - The platform strictly treats the remote ecommerce store as an external, read-only system.
   - Platform migrations are never executed against the remote database.
   - The `@whatsapp-platform/database` package enforces keyword inspection via `assertReadOnlySql()` to reject any mutation keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, etc.).

---

## Running Applications

### Start the Fastify API (Development)
```bash
pnpm dev
# Or target specifically:
pnpm --filter @whatsapp-platform/api dev
```

The API starts on `http://localhost:3000`.

#### Endpoints:
- `GET /health`: Liveness probe (checks process state, uptime, and memory).
- `GET /ready`: Readiness probe (verifies configuration and active local database connection).

### Start Engines & Worker (Independent Run)
```bash
# Marketing Engine
pnpm --filter @whatsapp-platform/marketing-engine dev

# AI Support Engine
pnpm --filter @whatsapp-platform/support-engine dev

# Task Worker
pnpm --filter @whatsapp-platform/worker dev
```

---

## Verification & Testing

### Run All Integration Tests
```bash
pnpm test
```

### Type Checking & Code Quality
```bash
# Type checking across all workspaces
pnpm typecheck

# Code formatting check
pnpm format

# Linting
pnpm lint
```

---

## Security Precautions

- **Zero Credential Hardcoding**: All secrets are retrieved via Zod-validated environment configurations.
- **Strict Secret Redaction**: Structured logging (Pino) redacts authorization headers, cookies, API keys, and passwords.
- **CORS Protection**: Restricted to explicitly configured origins defined in `CORS_ORIGINS`.
- **Security Headers**: Integrated via `@fastify/helmet` with strict content-security-policies.
- **Service-Role Isolation**: The service-role key is never exposed to client applications or used as a general query credential.

---

## Milestone Boundaries

This repository represents the **Foundation Milestone**:
- ✅ Multi-schema database architecture & reversible migrations.
- ✅ Local vs. remote database dual-client isolation with safety guardrails.
- ✅ Fastify backend API with `/health`, `/ready`, CORS, structured logging, and graceful shutdown.
- ✅ Independent application boundaries for API, Marketing Engine, Support Engine, and Worker.
- ✅ Strict environment validation with Zod and zero secret leakage.
- ⏳ *Marketing engine campaigns, AI conversation processing, live WhatsApp Cloud API integration, and admin dashboards will be implemented in subsequent milestones.*
