'use client';

import React, { useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  PlusCircle,
  GitPullRequest,
  Database,
  Server,
  HardDrive,
  Radio,
  Users,
  ShieldCheck,
  CreditCard,
  BarChart3,
  Activity,
  AlertCircle,
  ScrollText,
  Cpu,
  Layers,
  Bot,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Search,
  ExternalLink,
  Lock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: any;
  badge?: string;
  tag?: string;
}

export interface NavSection {
  group: string;
  items: NavItem[];
}

export const PLATFORM_NAV_SECTIONS: NavSection[] = [
  {
    group: 'Platform Administration',
    items: [
      { id: 'p_overview', label: '1. Platform Overview', icon: LayoutDashboard },
      { id: 'p_tenants', label: '2. Business Directory', icon: Building2 },
      { id: 'p_create_tenant', label: '3. Create Business', icon: PlusCircle },
      { id: 'p_onboarding', label: '4. Onboarding Pipeline', icon: GitPullRequest, badge: '2' },
      { id: 'p_tenant_details', label: '5. Tenant Drilldown', icon: Layers },
    ],
  },
  {
    group: 'Infrastructure & DB Routing',
    items: [
      { id: 'p_infra', label: '6. Infrastructure Telemetry', icon: Server },
      { id: 'p_db_routing', label: '7. Hybrid DB Routing', icon: Database, tag: 'DEDICATED' },
      { id: 'p_config_versions', label: '8. Config Versions & Rollback', icon: HardDrive },
      { id: 'p_integrations', label: '9. Integration Matrix', icon: Radio },
    ],
  },
  {
    group: 'Users & Subscriptions',
    items: [
      { id: 'p_users', label: '10. Platform Operators', icon: Users },
      { id: 'p_roles', label: '11. Multi-Tenant RBAC', icon: ShieldCheck },
      { id: 'p_plans', label: '12. SaaS Subscription Plans', icon: CreditCard },
      { id: 'p_usage', label: '13. Usage & Quotas Metering', icon: BarChart3 },
    ],
  },
  {
    group: 'Analytics & Audits',
    items: [
      { id: 'p_analytics', label: '14. Multi-Tenant Analytics', icon: Activity },
      { id: 'p_alerts', label: '15. Global Platform Alerts', icon: AlertCircle, badge: '1' },
      { id: 'p_audit_logs', label: '16. Platform Audit Logs', icon: ScrollText },
      { id: 'p_system_health', label: '17. System Health Heartbeat', icon: Cpu },
    ],
  },
  {
    group: 'AI & Background Services',
    items: [
      { id: 'p_jobs', label: '18. Background Queue Telemetry', icon: Activity },
      { id: 'p_ai_monitoring', label: '19. AI Model Telemetry', icon: Bot },
      { id: 'p_settings', label: '20. Platform Settings', icon: Sliders },
    ],
  },
];

interface PlatformConsoleViewProps {
  activeTab: string;
  onSwitchToTenant: (tenantId: string) => void;
}

export function PlatformConsoleView({ activeTab, onSwitchToTenant }: PlatformConsoleViewProps) {
  const [dbTestResult, setDbTestResult] = useState<string | null>(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [activeSession, setActiveSession] = useState<string | null>(null);

  const mockTenants = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Mintara Bites',
      slug: 'mintara-bites',
      type: 'internal',
      status: 'active',
      isolation: 'shared',
      industry: 'Food & Beverage',
      plan: 'Enterprise',
      mrr: '₹49,999',
      tokens: '840,210',
      owner: 'owner@mintarabites.com',
    },
    {
      id: 'ten_saas_02',
      name: 'Organic Glow Beauty',
      slug: 'organic-glow',
      type: 'saas',
      status: 'active',
      isolation: 'dedicated',
      industry: 'Beauty & Personal Care',
      plan: 'Enterprise',
      mrr: '₹49,999',
      tokens: '1,420,000',
      owner: 'priya@organicglow.in',
    },
    {
      id: 'ten_saas_03',
      name: 'Urban Threads Apparel',
      slug: 'urban-threads',
      type: 'saas',
      status: 'onboarding',
      isolation: 'shared',
      industry: 'Fashion & Apparel',
      plan: 'Growth',
      mrr: '₹14,999',
      tokens: '124,500',
      owner: 'karan@urbanthreads.co',
    },
    {
      id: 'ten_saas_04',
      name: 'Aura Home & Living',
      slug: 'aura-home',
      type: 'saas',
      status: 'draft',
      isolation: 'shared',
      industry: 'Home & Lifestyle',
      plan: 'Starter',
      mrr: '₹4,999',
      tokens: '12,000',
      owner: 'ananya@aurahome.in',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. OVERVIEW */}
      {activeTab === 'p_overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400 font-medium">Total Onboarded Businesses</div>
              <div className="text-2xl font-bold text-white mt-1">4 Brands</div>
              <div className="text-[11px] text-emerald-400 mt-1">1 Internal • 3 External SaaS</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400 font-medium">Platform Monthly Recurring Revenue</div>
              <div className="text-2xl font-bold text-white mt-1">₹1,19,996</div>
              <div className="text-[11px] text-emerald-400 mt-1">↑ 100% vs last month</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400 font-medium">Platform AI Tokens Consumed</div>
              <div className="text-2xl font-bold text-white mt-1">2.39M Tokens</div>
              <div className="text-[11px] text-cyan-400 mt-1">Across all active workspaces</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400 font-medium">Database Isolation Status</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">100% Healthy</div>
              <div className="text-[11px] text-slate-400 mt-1">3 Shared RLS • 1 Dedicated Supabase</div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Active Tenant Fleet Telemetry
              </h3>
              <span className="text-xs text-emerald-400 font-mono">Control Plane Mode</span>
            </div>
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Business Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Isolation</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Monthly Tokens</th>
                  <th className="p-3">Quick Switch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {mockTenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="p-3">
                      <div className="font-medium text-white">{t.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{t.industry}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        t.type === 'internal' ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-blue-950 text-blue-300 border border-blue-800'
                      }`}>
                        {t.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        t.status === 'active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        t.isolation === 'dedicated' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {t.isolation.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 font-mono">{t.plan}</td>
                    <td className="p-3 font-mono text-slate-400">{t.tokens}</td>
                    <td className="p-3">
                      <button
                        onClick={() => onSwitchToTenant(t.id)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center space-x-1"
                      >
                        <span>Workspace</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. BUSINESS DIRECTORY */}
      {activeTab === 'p_tenants' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Multi-Business Directory
            </h3>
            <span className="text-xs text-slate-400">{mockTenants.length} Registered Tenants</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {mockTenants.map((t) => (
              <div key={t.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">{t.name}</h4>
                    <p className="text-xs text-slate-400 font-mono">/{t.slug} • {t.owner}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                    t.status === 'active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}>
                    {t.status.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Type</span>
                    <span className="text-slate-300 font-mono">{t.type}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Isolation</span>
                    <span className="text-slate-300 font-mono">{t.isolation}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Subscription</span>
                    <span className="text-slate-300 font-mono">{t.plan}</span>
                  </div>
                </div>
                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    onClick={() => onSwitchToTenant(t.id)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs flex items-center space-x-1"
                  >
                    <span>Open Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. CREATE BUSINESS */}
      {activeTab === 'p_create_tenant' && (
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 max-w-2xl space-y-4">
          <h3 className="text-sm font-semibold text-white">Create New Business Tenant</h3>
          <p className="text-xs text-slate-400">
            Provision an internal brand or an external SaaS customer workspace with isolated data and configurable database routing.
          </p>
          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Business Name</label>
              <input
                type="text"
                placeholder="e.g. Pure Botanical Organics"
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Tenant Slug (Identifier)</label>
                <input
                  type="text"
                  placeholder="e.g. pure-botanical"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Owner Email</label>
                <input
                  type="email"
                  placeholder="e.g. founder@purebotanical.in"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Tenant Type</label>
                <select className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white">
                  <option value="saas">External SaaS</option>
                  <option value="internal">Internal Brand</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Industry Profile</label>
                <select className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white">
                  <option value="food_beverage">Food & Beverage</option>
                  <option value="beauty_personal_care">Beauty & Personal Care</option>
                  <option value="fashion_apparel">Fashion & Apparel</option>
                  <option value="health_wellness">Health & Wellness</option>
                  <option value="general_retail">General D2C Retail</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Isolation Mode</label>
                <select className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white">
                  <option value="shared">Shared (Row Level Security)</option>
                  <option value="dedicated">Dedicated Supabase DB</option>
                </select>
              </div>
            </div>
            <div className="pt-2">
              <button
                onClick={() => alert('Tenant created in draft state! Ready for onboarding wizard.')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
              >
                Provision Business Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. ONBOARDING PIPELINE */}
      {activeTab === 'p_onboarding' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Multi-Tenant Onboarding Pipeline (Lifecycle: Draft → Onboarding → Validation → Active)
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {['Draft', 'Onboarding', 'Validation', 'Active'].map((stage, sIdx) => (
              <div key={stage} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">{stage}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {sIdx === 0 ? '1' : sIdx === 1 ? '1' : sIdx === 2 ? '0' : '2'}
                  </span>
                </div>
                <div className="space-y-2">
                  {sIdx === 0 && (
                    <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs">
                      <div className="font-medium text-white">Aura Home & Living</div>
                      <div className="text-[10px] text-slate-500">Step 1: Profile setup</div>
                    </div>
                  )}
                  {sIdx === 1 && (
                    <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs">
                      <div className="font-medium text-white">Urban Threads Apparel</div>
                      <div className="text-[10px] text-slate-500">Step 3: WhatsApp Webhook</div>
                    </div>
                  )}
                  {sIdx === 3 && (
                    <>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs">
                        <div className="font-medium text-white">Mintara Bites</div>
                        <div className="text-[10px] text-emerald-400">Fully Validated & Live</div>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs">
                        <div className="font-medium text-white">Organic Glow Beauty</div>
                        <div className="text-[10px] text-emerald-400">Dedicated DB Live</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. TENANT DETAILS & IMPERSONATION */}
      {activeTab === 'p_tenant_details' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Tenant Details & Secure Platform Support Impersonation
          </h3>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
            <div className="flex items-center space-x-2 text-amber-400">
              <ShieldAlert className="w-4 h-4" />
              <span className="font-semibold">Zero-PII Support Impersonation Protocol</span>
            </div>
            <p className="text-slate-400">
              Platform operators can assist tenant business owners with operational configuration. All access is auditable, time-bounded, and masks end-customer personal identifiers.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-xl">
              <div>
                <label className="text-slate-400 block mb-1">Target Business</label>
                <select className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white">
                  <option value="ten_saas_02">Organic Glow Beauty</option>
                  <option value="ten_saas_03">Urban Threads Apparel</option>
                  <option value="ten_saas_04">Aura Home & Living</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Support Ticket / Reason</label>
                <input
                  type="text"
                  value={impersonateReason}
                  onChange={(e) => setImpersonateReason(e.target.value)}
                  placeholder="e.g. Assisting with WhatsApp webhook setup"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                />
              </div>
            </div>
            <div className="pt-2">
              <button
                onClick={() => {
                  if (!impersonateReason) {
                    alert('Please provide a mandatory audit reason before beginning session');
                    return;
                  }
                  setActiveSession(`acc_${Date.now()}`);
                  alert('Audit log recorded. Support access session initiated.');
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs"
              >
                {activeSession ? 'Session Active (End Session)' : 'Start Audited Support Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. INFRASTRUCTURE TELEMETRY */}
      {activeTab === 'p_infra' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Multi-Tenant Infrastructure Telemetry & Resource Distribution
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">Shared DB Connection Pool</div>
              <div className="text-xl font-bold text-white mt-1">12 / 50 Connections</div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-emerald-500 h-full w-[24%]" />
              </div>
              <div className="text-[10px] text-slate-400 mt-1">3 tenants routing via shared RLS pool</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">Dedicated Database Projects</div>
              <div className="text-xl font-bold text-white mt-1">1 Active Dedicated DB</div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-cyan-500 h-full w-[20%]" />
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Organic Glow Beauty (dedicated project)</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">Fastify API Cluster & Worker Node</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">Healthy (Uptime 99.98%)</div>
              <div className="text-[10px] text-slate-400 mt-2">Zero downtime deployment ready</div>
            </div>
          </div>
        </div>
      )}

      {/* 7. HYBRID DB ROUTING */}
      {activeTab === 'p_db_routing' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Hybrid Database Routing Engine (Shared RLS vs Dedicated Supabase Projects)
          </h3>
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-white">Dynamic Routing Dispatcher</h4>
                <p className="text-slate-400">Application logic routes via DatabaseRouter without tenant coupling.</p>
              </div>
              <button
                disabled={isTestingDb}
                onClick={() => {
                  setIsTestingDb(true);
                  setTimeout(() => {
                    setIsTestingDb(false);
                    setDbTestResult('Dedicated DB Latency: 42ms • Status: HEALTHY • SSL: Verified');
                  }, 800);
                }}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs flex items-center space-x-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingDb ? 'animate-spin' : ''}`} />
                <span>Test Dedicated Route</span>
              </button>
            </div>
            {dbTestResult && (
              <div className="p-3 rounded bg-cyan-950/60 border border-cyan-800 text-cyan-300 font-mono text-[11px]">
                {dbTestResult}
              </div>
            )}
            <table className="w-full text-left text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Tenant</th>
                  <th className="p-2.5">Mode</th>
                  <th className="p-2.5">Schema</th>
                  <th className="p-2.5">Max Connections</th>
                  <th className="p-2.5">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="p-2.5 font-medium text-white">Mintara Bites</td>
                  <td className="p-2.5 font-mono">shared</td>
                  <td className="p-2.5 font-mono">public</td>
                  <td className="p-2.5 font-mono">20</td>
                  <td className="p-2.5 text-emerald-400 font-mono">healthy</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-white">Organic Glow Beauty</td>
                  <td className="p-2.5 font-mono text-cyan-300">dedicated</td>
                  <td className="p-2.5 font-mono">public</td>
                  <td className="p-2.5 font-mono">10</td>
                  <td className="p-2.5 text-emerald-400 font-mono">healthy</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. CONFIG VERSIONS & ROLLBACK */}
      {activeTab === 'p_config_versions' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Tenant Configuration Versioning & Rollback
          </h3>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
            <table className="w-full text-left text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Version</th>
                  <th className="p-2.5">Business</th>
                  <th className="p-2.5">Change Summary</th>
                  <th className="p-2.5">Created By</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="p-2.5 font-mono text-white">v3</td>
                  <td className="p-2.5">Mintara Bites</td>
                  <td className="p-2.5">Enabled Level 3 Approvals for procurement orders &gt; ₹10,000</td>
                  <td className="p-2.5 font-mono">owner@mintarabites.com</td>
                  <td className="p-2.5 text-emerald-400 font-mono">Active</td>
                  <td className="p-2.5 text-slate-500 font-mono">Current</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-mono text-white">v2</td>
                  <td className="p-2.5">Mintara Bites</td>
                  <td className="p-2.5">Updated quiet hours start to 22:00 IST</td>
                  <td className="p-2.5 font-mono">owner@mintarabites.com</td>
                  <td className="p-2.5 text-slate-400 font-mono">Archived</td>
                  <td className="p-2.5">
                    <button
                      onClick={() => alert('Rollback simulated! Configuration snapshot reverted to v2.')}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]"
                    >
                      Rollback to v2
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. INTEGRATION MATRIX */}
      {activeTab === 'p_integrations' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Per-Tenant Provider Integrations Matrix
          </h3>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <table className="w-full text-left text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Business</th>
                  <th className="p-2.5">WhatsApp Cloud API</th>
                  <th className="p-2.5">Ecommerce DB (Read-Only)</th>
                  <th className="p-2.5">Shiprocket</th>
                  <th className="p-2.5">Razorpay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="p-2.5 font-medium text-white">Mintara Bites</td>
                  <td className="p-2.5 text-emerald-400 font-mono">● Connected (+919426868612)</td>
                  <td className="p-2.5 text-emerald-400 font-mono">● Strictly Read-Only</td>
                  <td className="p-2.5 text-emerald-400 font-mono">● Strict Links Only</td>
                  <td className="p-2.5 text-emerald-400 font-mono">● Webhooks Verified</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-white">Organic Glow Beauty</td>
                  <td className="p-2.5 text-emerald-400 font-mono">● Connected</td>
                  <td className="p-2.5 text-emerald-400 font-mono">● Read-Only (Dedicated)</td>
                  <td className="p-2.5 text-emerald-400 font-mono">● Strict Links Only</td>
                  <td className="p-2.5 text-emerald-400 font-mono">● Webhooks Verified</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 10. PLATFORM OPERATORS */}
      {activeTab === 'p_users' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Platform Users & Control Plane Operators
          </h3>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <table className="w-full text-left text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Operator Name</th>
                  <th className="p-2.5">Email</th>
                  <th className="p-2.5">Platform Role</th>
                  <th className="p-2.5">MFA Status</th>
                  <th className="p-2.5">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="p-2.5 font-medium text-white">Pathik (Platform Owner)</td>
                  <td className="p-2.5 font-mono">owner@mintarabites.com</td>
                  <td className="p-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-purple-950 text-purple-300 font-mono border border-purple-800">
                      PLATFORM_OWNER
                    </span>
                  </td>
                  <td className="p-2.5 text-emerald-400 font-mono">Enforced (TOTP)</td>
                  <td className="p-2.5 font-mono text-slate-400">Today, 22:15 IST</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 11. ROLES & RBAC */}
      {activeTab === 'p_roles' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Multi-Tenant Role-Based Access Control (RBAC) Matrix
          </h3>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded bg-slate-950/60 border border-slate-800">
                <h4 className="font-semibold text-white mb-2">Platform Roles (Control Plane)</h4>
                <ul className="space-y-1.5 text-slate-400">
                  <li>• <strong className="text-purple-300">platform_owner:</strong> Full platform lifecycle, tenant provisioning, DB routes.</li>
                  <li>• <strong className="text-blue-300">platform_admin:</strong> Tenant management, usage inspection, audit logs.</li>
                  <li>• <strong className="text-slate-300">platform_support:</strong> Audited impersonation support sessions (zero PII).</li>
                </ul>
              </div>
              <div className="p-3 rounded bg-slate-950/60 border border-slate-800">
                <h4 className="font-semibold text-white mb-2">Business Roles (Tenant Workspace)</h4>
                <ul className="space-y-1.5 text-slate-400">
                  <li>• <strong className="text-emerald-300">business_owner:</strong> Level 3 approvals, financial BI, settings.</li>
                  <li>• <strong className="text-cyan-300">business_admin:</strong> Team management, campaigns, integrations.</li>
                  <li>• <strong className="text-slate-300">business_operations:</strong> Support, catalog, inventory, handback.</li>
                  <li>• <strong className="text-slate-400">business_viewer:</strong> Read-only operational inspection.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 12. SUBSCRIPTION PLANS */}
      {activeTab === 'p_plans' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            SaaS Subscription Plans & Entitlements
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-white">Starter D2C</h4>
                <span className="text-xs font-mono text-emerald-400">₹4,999 / mo</span>
              </div>
              <p className="text-xs text-slate-400">Essential WhatsApp customer support & basic replenishment marketing.</p>
              <div className="text-xs space-y-1 text-slate-300 pt-2 border-t border-slate-800">
                <div>• 500,000 AI Tokens</div>
                <div>• 250 Conversations</div>
                <div>• Max 2 Team Members</div>
                <div>• Shared DB Isolation</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-white">Growth D2C</h4>
                <span className="text-xs font-mono text-emerald-400">₹14,999 / mo</span>
              </div>
              <p className="text-xs text-slate-400">Full marketing engines, RFM segmentation, supplier management & calling.</p>
              <div className="text-xs space-y-1 text-slate-300 pt-2 border-t border-slate-800">
                <div>• 2,500,000 AI Tokens</div>
                <div>• 1,500 Conversations</div>
                <div>• Max 10 Team Members</div>
                <div>• Supplier Calling & Negotiation</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 border-emerald-500/40">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-emerald-400">Enterprise OS</h4>
                <span className="text-xs font-mono text-emerald-400">₹49,999 / mo</span>
              </div>
              <p className="text-xs text-slate-400">Full manufacturing, batch QA, dedicated DB routing & Level 3 approvals.</p>
              <div className="text-xs space-y-1 text-slate-300 pt-2 border-t border-slate-800">
                <div>• 10,000,000 AI Tokens</div>
                <div>• 10,000 Conversations</div>
                <div>• Max 50 Team Members</div>
                <div>• Dedicated DB Routing Supported</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 13. USAGE & QUOTAS */}
      {activeTab === 'p_usage' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Tenant Usage Metering & Quota Enforcement
          </h3>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <table className="w-full text-left text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Business</th>
                  <th className="p-2.5">Billing Month</th>
                  <th className="p-2.5">AI Tokens</th>
                  <th className="p-2.5">Conversations</th>
                  <th className="p-2.5">Messages Sent</th>
                  <th className="p-2.5">Quota Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="p-2.5 font-medium text-white">Mintara Bites</td>
                  <td className="p-2.5 font-mono">2026-11</td>
                  <td className="p-2.5 font-mono">840,210 / 10,000,000</td>
                  <td className="p-2.5 font-mono">412 / 10,000</td>
                  <td className="p-2.5 font-mono">1,824</td>
                  <td className="p-2.5 text-emerald-400 font-mono">8.4% used (HEALTHY)</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-white">Organic Glow Beauty</td>
                  <td className="p-2.5 font-mono">2026-11</td>
                  <td className="p-2.5 font-mono">1,420,000 / 10,000,000</td>
                  <td className="p-2.5 font-mono">890 / 10,000</td>
                  <td className="p-2.5 font-mono">3,120</td>
                  <td className="p-2.5 text-emerald-400 font-mono">14.2% used (HEALTHY)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 14. MULTI-TENANT ANALYTICS */}
      {activeTab === 'p_analytics' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Multi-Tenant Aggregated Analytics & Growth Telemetry
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">Total Customer Profiles Across Tenants</div>
              <div className="text-2xl font-bold text-white mt-1">14,820 Profiles</div>
              <div className="text-[11px] text-emerald-400 mt-1">Strict tenant data isolation verified</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">Aggregated Orders Tracked</div>
              <div className="text-2xl font-bold text-white mt-1">3,490 Orders</div>
              <div className="text-[11px] text-slate-400 mt-1">100% via Shiprocket tracking links</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">Marketing Conversion Uplift</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">+18.4%</div>
              <div className="text-[11px] text-slate-400 mt-1">Across 10 safe campaign workflows</div>
            </div>
          </div>
        </div>
      )}

      {/* 15. GLOBAL ALERTS */}
      {activeTab === 'p_alerts' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Global Platform Alerts & Escalations
          </h3>
          <div className="space-y-2 text-xs">
            <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/60 flex items-start space-x-3">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-200">Urban Threads Apparel: WhatsApp Webhook Pending Verification</div>
                <div className="text-slate-400 mt-0.5">Tenant completed Step 2 of onboarding. Meta Webhook URL generated, awaiting token exchange.</div>
                <div className="text-[10px] text-slate-500 font-mono mt-1">10 minutes ago • Tenant ID: ten_saas_03</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 16. PLATFORM AUDIT LOGS */}
      {activeTab === 'p_audit_logs' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Platform Immutable Audit Logs
          </h3>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <table className="w-full text-left text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Timestamp</th>
                  <th className="p-2.5">Actor</th>
                  <th className="p-2.5">Action</th>
                  <th className="p-2.5">Target Business</th>
                  <th className="p-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="p-2.5 font-mono text-slate-400">Today, 22:10 IST</td>
                  <td className="p-2.5 font-mono">owner@mintarabites.com</td>
                  <td className="p-2.5 font-mono text-emerald-400">tenant_created</td>
                  <td className="p-2.5">Aura Home & Living</td>
                  <td className="p-2.5 text-slate-400">Initial provision in draft state</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-mono text-slate-400">Today, 21:40 IST</td>
                  <td className="p-2.5 font-mono">owner@mintarabites.com</td>
                  <td className="p-2.5 font-mono text-cyan-300">database_route_updated</td>
                  <td className="p-2.5">Organic Glow Beauty</td>
                  <td className="p-2.5 text-slate-400">Configured dedicated Supabase project</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 17. SYSTEM HEALTH */}
      {activeTab === 'p_system_health' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            System Health & Service Heartbeats
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">Shared DB Heartbeat</div>
              <div className="text-lg font-bold text-emerald-400 mt-1">4ms Latency</div>
              <div className="text-[10px] text-slate-500 mt-1">Status: OK</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">Gemini AI Provider</div>
              <div className="text-lg font-bold text-emerald-400 mt-1">210ms Latency</div>
              <div className="text-[10px] text-slate-500 mt-1">Status: Operational</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">WhatsApp Meta Cloud API</div>
              <div className="text-lg font-bold text-emerald-400 mt-1">Available</div>
              <div className="text-[10px] text-slate-500 mt-1">Webhook Verified</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400">Worker Background Tasks</div>
              <div className="text-lg font-bold text-emerald-400 mt-1">Running</div>
              <div className="text-[10px] text-slate-500 mt-1">Polling Interval: 5s</div>
            </div>
          </div>
        </div>
      )}

      {/* 18. BACKGROUND JOBS */}
      {activeTab === 'p_jobs' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Multi-Tenant Background Worker Queue Telemetry
          </h3>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <table className="w-full text-left text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Job ID</th>
                  <th className="p-2.5">Business</th>
                  <th className="p-2.5">Job Type</th>
                  <th className="p-2.5">Scheduled For</th>
                  <th className="p-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="p-2.5 font-mono text-slate-400">job_rep_20261118</td>
                  <td className="p-2.5">Mintara Bites</td>
                  <td className="p-2.5 font-mono">generate_daily_report</td>
                  <td className="p-2.5 font-mono">22:00 IST</td>
                  <td className="p-2.5 text-emerald-400 font-mono">completed</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-mono text-slate-400">job_rep_ogb_20261118</td>
                  <td className="p-2.5">Organic Glow Beauty</td>
                  <td className="p-2.5 font-mono">generate_daily_report</td>
                  <td className="p-2.5 font-mono">22:00 IST</td>
                  <td className="p-2.5 text-emerald-400 font-mono">completed</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 19. AI MONITORING */}
      {activeTab === 'p_ai_monitoring' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            AI Engine Telemetry & Guardrail Enforcement
          </h3>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400">Total Tool Invocations</div>
              <div className="text-xl font-bold text-white mt-1">4,812 Calls</div>
              <div className="text-[10px] text-emerald-400 mt-1">Zero direct ecommerce mutations</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400">Gemini Average Generation Time</div>
              <div className="text-xl font-bold text-white mt-1">320ms</div>
              <div className="text-[10px] text-slate-400 mt-1">Model: gemini-2.5-flash</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400">Level 3 Approvals Gateway</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">100% Intercept Rate</div>
              <div className="text-[10px] text-slate-400 mt-1">Financial & contract actions gated</div>
            </div>
          </div>
        </div>
      )}

      {/* 20. PLATFORM SETTINGS */}
      {activeTab === 'p_settings' && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Global Platform Settings & Security Policies
          </h3>
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 block mb-1">Platform Name</label>
                <input
                  type="text"
                  readOnly
                  value="Mintara AI Platform Control Plane"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Primary Market Timezone</label>
                <input
                  type="text"
                  readOnly
                  value="Asia/Kolkata (IST)"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Global Quiet Hours (WhatsApp Compliance)</label>
              <input
                type="text"
                readOnly
                value="22:00 to 08:00 IST (Strict Suppression)"
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-mono"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
