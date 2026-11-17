# Mintara AI: Enterprise WhatsApp Automation & Intelligence Platform

> **Brand**: Mintara Bites (Artisanal Mukhwas & Digestive Treats, Gujarat, India)  
> **Repository**: `pathikx99/whatsapp-automation`  
> **Feature Branch**: `foundation/production-ready`

A high-performance, modular TypeScript monorepo providing autonomous WhatsApp marketing workflows, Gemini-powered customer support, background worker queues with atomic concurrency locking, and daily operational intelligence reporting.

---

## 1. Monorepo Architecture

```
whatsapp-platform/
├── apps/
│   ├── api/                   # Fastify HTTP server (Webhooks, Admin REST API, Health/Readiness)
│   ├── worker/                # Background job worker (Atomic locks, retries, dead-letter, 22:00 IST cron)
│   ├── support-engine/        # AI customer support orchestrator & human escalation desk
│   └── marketing-engine/      # Segmented retention & marketing campaign dispatcher
├── packages/
│   ├── config/                # Centralized Zod schema validation & environment configuration
│   ├── shared/                # Pino structured logging, timing-safe helpers, custom errors
│   ├── database/              # Platform repository, atomic job claiming, daily report compiler
│   ├── ecommerce-adapter/     # External read-only website database adapter (Strictly SELECT only)
│   ├── whatsapp/              # Meta Cloud API integration, HMAC-SHA256 verification, phone normalization
│   └── ai/                    # Gemini AI provider abstraction, tool calling, token tracking, backoff
├── supabase/
│   ├── migrations/            # Idempotent versioned SQL migrations for Mintara AI Supabase
│   │   ├── 20261105000000_core_platform_schema.sql
│   │   └── 20261117000000_reporting_and_audit_foundation.sql
│   ├── schema.sql             # Full reference schema with RLS and constraints
│   └── seed.sql               # Seed data for development
├── tests/
│   └── integration/           # Vitest integration test suite (15 test suites, 129 tests)
└── docs/
    └── architecture.md        # Deep architectural design, data flows, and Mermaid diagrams
```

---

## 2. Core Architectural Pillars

### A. Dual-Supabase Isolation
1. **Mintara AI Platform Supabase**:
   - Manages AI conversations, support tickets, worker jobs, activity logs, task executions, daily reports, and audit trails.
   - Fully owned and managed via `supabase/schema.sql` (initialization) and `supabase/delete.sql` (clean reset/teardown).
2. **Mintara Bites Website Supabase**:
   - Manages customers, products, variants, orders, and website promotions.
   - Strictly external and read-only. Guarded by `assertReadOnlySql()` in `@whatsapp-platform/ecommerce-adapter`.

### B. Gemini AI Foundation (`@whatsapp-platform/ai`)
- **Primary Model**: Google Gemini (`gemini-2.5-flash` or configurable via `AI_MODEL`).
- **Resilience**: Bounded exponential backoff with randomized jitter on HTTP 429, 500, 502, 503, and 504 errors.
- **Backend Tool Calling**: Strongly-typed `AiToolDeclaration` and `AiFunctionCall`. AI executes backend services only; AI is **never** granted direct SQL access.
- **Token & Latency Tracking**: Records `promptTokens`, `completionTokens`, `totalTokens`, and `latencyMs` for every call into `ai_activity_logs`.
- **Structured JSON**: Native support for `responseMimeType: 'application/json'` and `responseSchema`.

### C. WhatsApp Foundation (`@whatsapp-platform/whatsapp`)
- **Meta Cloud API Direct**: Supports text, approved templates, interactive reply buttons, interactive section lists, and media (images, audio, documents, video).
- **Phone Normalization**: Standardizes Indian (`+91`, `0`, unformatted 10-digit) and international phone numbers into E.164 digits via `normalizePhoneNumber()`.
- **Webhook Security**: Timing-safe HMAC-SHA256 signature verification (`verifyWebhookSignature()`) against Meta's `X-Hub-Signature-256`.
- **Delivery Receipts**: Tracks delivery receipts (`sent`, `delivered`, `read`, `failed`) into `messaging_receipts`.
- **Opt-Out Compliance**: Automatic handling of opt-out (`STOP`, `UNSUBSCRIBE`) and opt-in (`START`, `OPTIN`) keywords.

### D. Background Worker & Concurrency (`apps/worker`)
- **Atomic Job Claiming**: `claimPendingJobs()` locks pending jobs with `locked_at` and `locked_by` to prevent duplicate processing across concurrent workers.
- **Lock Expiration Protection**: Stale locks automatically expire after `WORKER_JOB_LOCK_TIMEOUT_MS` (default 5 minutes).
- **Retry Policy**: Exponential backoff with jitter on failures.
- **Dead-Letter State**: Automatically quarantines failed jobs to `dead_letter` after exceeding `max_retries` (default 3).
- **Graceful Shutdown**: Drains in-flight jobs on `SIGTERM`/`SIGINT`.

### E. 22:00 IST Operational Intelligence Reporting
- **Automated Scheduling**: Cron checker runs daily at 22:00 IST (`Asia/Kolkata`) to trigger `generate_daily_report`.
- **Database-Calculated Metrics**: Aggregates verified metrics from `ai_activity_logs`, `support_tickets`, and `support_conversations` (no LLM hallucination).
- **Dual Delivery**: Dispatches WhatsApp summary to admin phones and persists report to `ai_daily_reports` for command center dashboard access.

---

## 3. Environment Configuration

Copy the example template:
```bash
cp .env.example .env
```

Key environment variables:
| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment (`development`, `production`, `test`) | `development` |
| `API_PORT` | Fastify API port | `3000` |
| `SUPABASE_URL` | Mintara AI Supabase URL | Required |
| `SUPABASE_SECRET_KEY` | Mintara AI Supabase service key | Required |
| `ECOMMERCE_SUPABASE_URL` | Website Supabase URL (Read-only) | Required |
| `ECOMMERCE_SUPABASE_ANON_KEY` | Website Supabase Anon key | Required |
| `AI_PROVIDER` | AI provider (`gemini`, `mock`) | `gemini` |
| `AI_API_KEY` | Google Gemini API Key | Required for AI |
| `AI_MODEL` | Gemini Model ID | `gemini-2.5-flash` |
| `AI_TIMEOUT_MS` | AI request timeout in milliseconds | `30000` |
| `AI_MAX_RETRIES` | Max retries for Gemini API calls | `3` |
| `WHATSAPP_PROVIDER` | WhatsApp provider (`cloud_api`, `mock`) | `mock` (dev) |
| `WHATSAPP_API_KEY` | Meta System User Access Token | Required for WA |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Phone Number ID | Required for WA |
| `WHATSAPP_APP_SECRET` | Meta App Secret for webhook HMAC | Required for WA |
| `WORKER_JOB_LOCK_TIMEOUT_MS` | Worker concurrency lock timeout | `300000` |
| `WORKER_POLL_INTERVAL_MS` | Worker polling interval | `10000` |
| `REPORTING_TIMEZONE` | Timezone for daily reporting | `Asia/Kolkata` |
| `REPORTING_DAILY_TIME` | Scheduled report generation time | `22:00` |
| `ADMIN_API_KEY` | Master admin key for command center | `MintaraBites@010101` |

---

## 4. Local Development & Testing

### Install Dependencies
```bash
pnpm install
```

### Build All Workspaces
```bash
pnpm build
```

### Run Type Checking
```bash
pnpm typecheck
```

### Run Test Suite
```bash
pnpm test
```
*Current test suite: 15 test files, 129 integration and unit tests, 100% passing.*

### Run Applications in Development Mode

**1. Fastify API Server:**
```bash
pnpm --filter @whatsapp-platform/api dev
```
Accessible at `http://localhost:3000`.
- Health check: `GET http://localhost:3000/health`
- Readiness check: `GET http://localhost:3000/ready`
- Live Support Dashboard: `http://localhost:3000/dashboard/support`
  - Unlock with admin key: `MintaraBites@010101` (or append `?key=MintaraBites@010101`)

**2. Background Task Worker:**
```bash
pnpm --filter @whatsapp-platform/worker dev
```

**3. Support Engine & Marketing Engine:**
```bash
pnpm --filter @whatsapp-platform/support-engine dev
pnpm --filter @whatsapp-platform/marketing-engine dev
```

---

## 5. Security & Operational Readiness

- **Timing-Safe Admin Auth**: `isValidAdminToken` uses constant-time string comparisons across all authorized administrative tokens.
- **Secret Masking**: Pino structured logging masks `authorization`, `cookie`, `token`, `secret`, `password`, and `apiKey`.
- **Zero Frontend Service-Role Key**: The Supabase service-role key is strictly backend-only.
- **Sensitive Action Authorization**: Operations altering customer commitments, discounts, cancellations, or refunds require human escalation tickets.
