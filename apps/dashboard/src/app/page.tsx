'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  PlatformConsoleView,
  PLATFORM_NAV_SECTIONS,
} from './platform-console';
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  Users,
  LifeBuoy,
  Megaphone,
  Sparkles,
  PieChart,
  ShoppingBag,
  Boxes,
  Factory,
  Layers,
  Award,
  Truck,
  ShoppingCart,
  PhoneCall,
  DollarSign,
  FileText,
  AlertTriangle,
  BookOpen,
  Sliders,
  CheckCircle,
  Activity,
  UserCheck,
  Settings,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Search,
  ExternalLink,
  RefreshCw,
  Eye,
  Check,
  X,
  Lock,
  ChevronRight,
  ShieldCheck,
  Flame,
  Clock,
  Building,
  Globe,
  ChevronDown,
} from 'lucide-react';

// Navigation interfaces
interface NavItem {
  id: string;
  label: string;
  icon: any;
  badge?: string;
  tag?: string;
}

interface NavSection {
  group: string;
  items: NavItem[];
}

// Navigation groups
const NAV_SECTIONS: NavSection[] = [
  {
    group: 'Executive & AI',
    items: [
      { id: 'overview', label: '1. Overview', icon: LayoutDashboard },
      { id: 'ai_assistant', label: '2. AI Assistant (Voice/Text)', icon: Bot },
      { id: 'approvals', label: '22. Level 3 Approvals', icon: CheckCircle, badge: '3' },
    ],
  },
  {
    group: 'Support & Customers',
    items: [
      { id: 'conversations', label: '3. Conversations & Handback', icon: MessageSquare },
      { id: 'tickets', label: '5. Support Tickets', icon: LifeBuoy },
      { id: 'customers', label: '4. Verified Customers', icon: Users },
      { id: 'segments', label: '8. Customer Segmentation (RFM)', icon: PieChart },
    ],
  },
  {
    group: 'Growth & Marketing',
    items: [
      { id: 'campaigns', label: '6. 10 Campaign Engines', icon: Megaphone },
      { id: 'automations', label: '7. Marketing Automations', icon: Sparkles },
    ],
  },
  {
    group: 'Ecommerce & Inventory',
    items: [
      { id: 'products', label: '9. Products Catalog (Read-Only)', icon: ShoppingBag, tag: 'READ-ONLY' },
      { id: 'inventory', label: '10. Inventory & Stock', icon: Boxes },
    ],
  },
  {
    group: 'Manufacturing & Supply',
    items: [
      { id: 'manufacturing', label: '11. Manufacturing Orders', icon: Factory },
      { id: 'raw_materials', label: '12. Raw Materials (Paan, Spices)', icon: Layers },
      { id: 'production', label: '13. Production & Batches', icon: Award },
      { id: 'suppliers', label: '14. Verified Suppliers', icon: Truck },
      { id: 'procurement', label: '15. Procurement & RFQs', icon: ShoppingCart },
      { id: 'calls', label: '16. Supplier Calls & Negotiation', icon: PhoneCall },
    ],
  },
  {
    group: 'Financials & Intelligence',
    items: [
      { id: 'financials', label: '17. Financial Intelligence', icon: DollarSign },
      { id: 'reports', label: '18. 22:00 IST Intelligence Reports', icon: FileText },
      { id: 'alerts', label: '19. Alerts & Escalations', icon: AlertTriangle, badge: '2' },
      { id: 'knowledge', label: '20. Knowledge Centre (RAG)', icon: BookOpen },
    ],
  },
  {
    group: 'System & Governance',
    items: [
      { id: 'ai_config', label: '21. AI Configuration (15 Agents)', icon: Sliders },
      { id: 'workflows', label: '23. Background Tasks & Worker', icon: Activity },
      { id: 'users', label: '24. Users & Roles (RBAC)', icon: UserCheck },
      { id: 'settings', label: '25. Platform Settings', icon: Settings },
    ],
  },
];

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<'workspace' | 'platform'>('workspace');
  const [activePlatformTab, setActivePlatformTab] = useState<string>('p_overview');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('00000000-0000-0000-0000-000000000001');

  const AVAILABLE_TENANTS = [
    { id: '00000000-0000-0000-0000-000000000001', name: 'Mintara Bites', location: 'Surat, Gujarat', industry: 'Food & Beverage', status: 'active', type: 'internal', onboardingStep: 7 },
    { id: 'ten_saas_02', name: 'Organic Glow Beauty', location: 'Bengaluru, Karnataka', industry: 'Beauty & Personal Care', status: 'active', type: 'saas', onboardingStep: 7 },
    { id: 'ten_saas_03', name: 'Urban Threads Apparel', location: 'Mumbai, Maharashtra', industry: 'Fashion & Apparel', status: 'onboarding', type: 'saas', onboardingStep: 3 },
    { id: 'ten_saas_04', name: 'Aura Home & Living', location: 'New Delhi', industry: 'Home & Lifestyle', status: 'draft', type: 'saas', onboardingStep: 1 },
  ];

  const currentTenant = AVAILABLE_TENANTS.find((t) => t.id === selectedTenantId) || AVAILABLE_TENANTS[0];
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // AI Assistant voice state
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; time: string }>>([
    {
      role: 'assistant',
      text: 'Namaste Pathik bhai! Mintara AI Command Center is active. Daily 22:00 IST audit ready, all 15 agents operational, Shiprocket tracking online, and Level 3 autonomy guardrails engaged. What would you like to check or execute?',
      time: '10:00 PM',
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const recognitionRef = useRef<any>(null);

  // Setup Web Speech API speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInputPrompt(transcript);
          setIsListening(false);
        };

        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition is not supported by your browser. Please type your query.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  const speakText = (text: string) => {
    if (!voiceEnabled || typeof window === 'undefined') return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSendPrompt = async () => {
    if (!inputPrompt.trim()) return;
    const userText = inputPrompt.trim();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [...prev, { role: 'user', text: userText, time: now }]);
    setInputPrompt('');

    // Generate intelligent response
    setTimeout(() => {
      let reply = '';
      const lower = userText.toLowerCase();
      if (lower.includes('order') || lower.includes('revenue') || lower.includes('sales')) {
        reply = 'Verified Revenue today is ₹18,450 across 24 orders. Average Order Value is ₹768. 100% payments verified via Razorpay webhook. All courier tracking handed off to Shiprocket links.';
      } else if (lower.includes('approval') || lower.includes('po') || lower.includes('discount')) {
        reply = 'There are 2 pending Level 3 approvals: PO-2026-089 for 200kg Betel Leaf (₹38,000) and an 8% VIP coupon request for high-LTV segment. Awaiting your approval before execution.';
      } else if (lower.includes('stock') || lower.includes('inventory') || lower.includes('material')) {
        reply = 'Raw material check: Paan leaf extract is at 18kg (reorder point 15kg). Gulkand reserve is healthy at 85kg. Finished Goods: Artisanal Paan Mukhwas 300g has 42 units remaining.';
      } else {
        reply = `Understood. I have routed your query to the specialized agent team. Operations verified: zero direct ecommerce mutation, strict Shiprocket link routing active, customer suppression enforced.`;
      }
      setMessages((prev) => [...prev, { role: 'assistant', text: reply, time: now }]);
      speakText(reply);
    }, 600);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090d16] text-slate-100">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-72 flex-shrink-0 border-r border-slate-800 bg-[#0c1222] flex flex-col">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg">
              M
            </div>
            <div>
              <h1 className="font-semibold text-sm tracking-wide text-white">Mintara AI</h1>
              <p className="text-xs text-emerald-400 font-mono">D2C Business OS v3.8</p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 rounded font-mono">
            LIVE
          </span>
        </div>

        {/* Mode Switcher */}
        <div className="p-2.5 bg-slate-950/80 border-b border-slate-800 flex space-x-1">
          <button
            onClick={() => setViewMode('workspace')}
            className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium flex items-center justify-center space-x-1.5 transition-all ${
              viewMode === 'workspace'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </button>
          <button
            onClick={() => setViewMode('platform')}
            className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium flex items-center justify-center space-x-1.5 transition-all ${
              viewMode === 'platform'
                ? 'bg-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Platform Admin</span>
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="p-3 border-b border-slate-800/60">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={viewMode === 'platform' ? 'Filter 20 admin sections...' : 'Filter 25 workspace sections...'}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-md py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Nav Items Scrollable */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {(viewMode === 'platform' ? PLATFORM_NAV_SECTIONS : NAV_SECTIONS).map((sec, idx) => {
            const filteredItems = sec.items.filter((item) =>
              item.label.toLowerCase().includes(searchQuery.toLowerCase()),
            );
            if (filteredItems.length === 0) return null;
            return (
              <div key={idx} className="space-y-1">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {sec.group}
                </div>
                {filteredItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = viewMode === 'platform' ? activePlatformTab === item.id : activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (viewMode === 'platform') {
                          setActivePlatformTab(item.id);
                        } else {
                          setActiveTab(item.id);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                        isActive
                          ? viewMode === 'platform'
                            ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? (viewMode === 'platform' ? 'text-purple-400' : 'text-emerald-400') : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="px-1.5 py-0.2 text-[10px] bg-amber-500/20 text-amber-300 rounded-full font-mono border border-amber-500/30">
                          {item.badge}
                        </span>
                      )}
                      {item.tag && (
                        <span className="px-1.5 py-0.2 text-[9px] bg-cyan-950 text-cyan-300 rounded font-mono border border-cyan-800">
                          {item.tag}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* System Footer Status */}
        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Dual DB Synced</span>
          </div>
          <span className="font-mono text-slate-400">Asia/Kolkata</span>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#090d16]">
        {/* Top Header */}
        <header className="h-14 border-b border-slate-800 px-6 flex items-center justify-between bg-[#0b101d]">
          {viewMode === 'platform' ? (
            <div className="flex items-center space-x-3">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              <h2 className="text-sm font-semibold text-white tracking-wide">
                {PLATFORM_NAV_SECTIONS.flatMap((g) => g.items).find((i) => i.id === activePlatformTab)?.label || 'Platform Overview'}
              </h2>
              <span className="text-xs text-slate-500">|</span>
              <span className="text-xs text-purple-300 font-mono">Platform Admin Console (Superadmin Mode)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <h2 className="text-sm font-semibold text-white tracking-wide">
                {NAV_SECTIONS.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label || 'Overview'}
              </h2>
              <span className="text-xs text-slate-500">|</span>
              {/* Workspace Switcher */}
              <div className="flex items-center space-x-2">
                <Building className="w-3.5 h-3.5 text-emerald-400" />
                <select
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded px-2.5 py-1 font-medium focus:outline-none focus:border-emerald-500"
                >
                  {AVAILABLE_TENANTS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.industry} • {t.type})
                    </option>
                  ))}
                </select>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                  currentTenant.status === 'active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                }`}>
                  {currentTenant.status.toUpperCase()}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-300">Level 3 Autonomy</span>
            </div>
            <button
              onClick={() => {
                setIsRefreshing(true);
                setTimeout(() => setIsRefreshing(false), 500);
              }}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Tab Content Display */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {viewMode === 'platform' ? (
            <PlatformConsoleView
              activeTab={activePlatformTab}
              onSwitchToTenant={(tId) => {
                setSelectedTenantId(tId);
                setViewMode('workspace');
              }}
            />
          ) : (
            <>
              {/* Onboarding Wizard Banner for non-active tenants */}
              {currentTenant.status !== 'active' && (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 mb-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-amber-300 font-semibold text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Tenant Onboarding in Progress: Step {currentTenant.onboardingStep || 1} of 7</span>
                    </div>
                    <button
                      onClick={() => alert(`Readiness validated! Tenant '${currentTenant.name}' activated.`)}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium"
                    >
                      Validate & Activate Workspace
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-2 text-[10px] font-mono">
                    {['1. Profile', '2. Catalog', '3. WhatsApp', '4. Shiprocket', '5. Razorpay', '6. Safety RAG', '7. Activate'].map((s, idx) => (
                      <div
                        key={s}
                        className={`p-2 rounded text-center border ${
                          idx < (currentTenant.onboardingStep || 1)
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : idx === (currentTenant.onboardingStep || 1) - 1
                            ? 'bg-amber-900/60 text-amber-300 border-amber-600'
                            : 'bg-slate-900 text-slate-500 border-slate-800'
                        }`}
                      >
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}
          {/* 1. OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium">Today&apos;s Verified Revenue</div>
                  <div className="text-2xl font-bold text-white mt-1">₹18,450.00</div>
                  <div className="text-[11px] text-emerald-400 mt-1 flex items-center space-x-1">
                    <span>↑ 14.2% vs yesterday</span>
                    <span className="text-slate-500">• 24 orders</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium">Active Conversations</div>
                  <div className="text-2xl font-bold text-white mt-1">12</div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-1">
                    <span className="text-emerald-400">10 AI Active</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-amber-400">2 Human Takeover</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium">Open Support Escalations</div>
                  <div className="text-2xl font-bold text-amber-400 mt-1">2</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    1 Delayed Courier • 1 Quality Query
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium">Pending Approvals (L3)</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">3</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Total financial commitment: ₹42,500
                  </div>
                </div>
              </div>

              {/* Central Operational Banner */}
              <div className="p-5 rounded-xl bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/20 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-300">Daily 22:00 IST Intelligence Report Pipeline</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Verified aggregation engine scheduled every night at 22:00 IST. Zero hallucinated metrics. Delivers verified D2C analytics to WhatsApp and Command Center.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('reports')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-semibold rounded-lg"
                >
                  View Reports
                </button>
              </div>

              {/* Quick Health Matrix */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Data & Safety Guardrails</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                      <span className="text-slate-300">Website Supabase DB Status</span>
                      <span className="text-emerald-400 font-mono flex items-center gap-1">
                        <Lock className="w-3 h-3" /> STRICT READ-ONLY
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                      <span className="text-slate-300">Mintara AI Database</span>
                      <span className="text-emerald-400 font-mono">CONNECTED & SYNCED</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                      <span className="text-slate-300">Shiprocket Tracking Link Policy</span>
                      <span className="text-emerald-400 font-mono">100% ENFORCED (NO SPECULATION)</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-300">Personalized Discount Engine</span>
                      <span className="text-amber-400 font-mono">READ-ONLY SAFEGUARD ACTIVE</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">15 Specialized Agents Health</div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    {[
                      'Support Agent', 'Sales Agent', 'Marketing Agent',
                      'Customer Intel', 'Manufacturing', 'Inventory Agent',
                      'Procurement', 'Supplier Agent', 'Finance & BI',
                      'Research Agent', 'Communication', 'Calling Agent',
                      'Owner Assistant', 'Knowledge Agent', 'Ecommerce Intel'
                    ].map((name, i) => (
                      <div key={i} className="p-2 rounded bg-slate-800/40 border border-slate-700/40 flex items-center justify-between">
                        <span className="truncate text-slate-300">{name}</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. AI ASSISTANT (VOICE & TEXT) */}
          {activeTab === 'ai_assistant' && (
            <div className="h-[750px] flex flex-col rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
              {/* Header */}
              <div className="p-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Bot className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">Owner Private AI Assistant (Pathik Bhai)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    className={`p-1.5 rounded text-xs border ${
                      voiceEnabled
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-500'
                    }`}
                    title="Toggle Text-to-Speech Spoken Responses"
                  >
                    {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">Gemini 2.5 Flash</span>
                </div>
              </div>

              {/* Chat Log */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2.5 text-xs leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-emerald-600 text-white rounded-br-none'
                          : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none'
                      }`}
                    >
                      {m.text}
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 px-1">{m.time}</span>
                  </div>
                ))}
              </div>

              {/* Input Area */}
              <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center space-x-2">
                <button
                  onClick={toggleListening}
                  className={`p-2.5 rounded-lg border transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse border-rose-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title={isListening ? 'Listening... Tap to stop' : 'Tap to speak (Web Speech API)'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendPrompt()}
                  placeholder={isListening ? 'Listening to voice...' : 'Ask your AI assistant or command an action...'}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleSendPrompt}
                  className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-black font-semibold text-xs transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* 3. CONVERSATIONS & HUMAN TAKEOVER */}
          {activeTab === 'conversations' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Customer Conversations & Human Handback Controls
                </h3>
                <span className="text-xs text-emerald-400 font-mono">12 Active Conversations</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Mode</th>
                      <th className="p-3">Last Message</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Aarav Patel</td>
                      <td className="p-3 font-mono">919876543210</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">Active</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">AI ASSISTED</span>
                      </td>
                      <td className="p-3 text-slate-400 truncate max-w-xs">&quot;Where is my Paan Mukhwas order?&quot;</td>
                      <td className="p-3">
                        <button className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[11px]">
                          Takeover
                        </button>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 bg-amber-500/5">
                      <td className="p-3 font-medium text-white">Pooja Sharma</td>
                      <td className="p-3 font-mono">919822334455</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300">Takeover Active</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-800 font-mono">HUMAN OPERATING</span>
                      </td>
                      <td className="p-3 text-slate-400 truncate max-w-xs">&quot;Couier boy called saying address incomplete&quot;</td>
                      <td className="p-3">
                        <button className="px-2.5 py-1 rounded bg-emerald-600 text-black hover:bg-emerald-500 text-[11px] font-semibold">
                          Hand Back to AI
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. VERIFIED CUSTOMERS */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Verified Ecommerce Customer Profiles (Read-Only Live Sync)
              </h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Name</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">City</th>
                      <th className="p-3">Total Orders</th>
                      <th className="p-3">LTV</th>
                      <th className="p-3">Segment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Rohit Mehta</td>
                      <td className="p-3 font-mono">919879001122</td>
                      <td className="p-3">Surat</td>
                      <td className="p-3">6 orders</td>
                      <td className="p-3 font-mono text-emerald-400">₹4,250</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">Champions</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Ananya Desai</td>
                      <td className="p-3 font-mono">919825443322</td>
                      <td className="p-3">Ahmedabad</td>
                      <td className="p-3">3 orders</td>
                      <td className="p-3 font-mono text-emerald-400">₹2,100</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300">Loyal</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. SUPPORT TICKETS */}
          {activeTab === 'tickets' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Support Escalation Tickets (Automatic 6 Triggers)
              </h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Ticket ID</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Trigger Category</th>
                      <th className="p-3">Severity</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-emerald-400">TCK-2026-001</td>
                      <td className="p-3">Pooja Sharma</td>
                      <td className="p-3">Delayed Courier (&gt;5 days)</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-mono">CRITICAL</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300">Open</span>
                      </td>
                      <td className="p-3 text-slate-400">18 Nov 01:15 IST</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. CAMPAIGNS */}
          {activeTab === 'campaigns' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  10 Marketing Campaign Engines (Safe Default: Disabled)
                </h3>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Campaign Engine</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Target Audience</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Approval Gate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {[
                      { name: '1. Abandoned Cart Recovery (15m/4h/24h)', type: 'abandoned_cart', aud: 'Incomplete carts' },
                      { name: '2. Abandoned Checkout Nudge', type: 'abandoned_checkout', aud: 'Payment drop-offs' },
                      { name: '3. Win-Back Lapsed Customers (45d)', type: 'win_back', aud: 'Dormant buyers' },
                      { name: '4. Festival & Seasonal Gift Box (Diwali/Holi)', type: 'festival', aud: 'Champions & Loyal' },
                      { name: '5. Product Launch Exclusive Drop', type: 'product_launch', aud: 'VIP tier' },
                      { name: '6. Post-Purchase Cross-Sell (Seeds + Paan)', type: 'cross_sell', aud: 'Delivered orders' },
                      { name: '7. Customer Referral Program', type: 'referral', aud: 'High-satisfaction 5-star' },
                      { name: '8. Loyalty Rewards & Points Nudge', type: 'loyalty_rewards', aud: 'Repeat purchasers' },
                      { name: '9. Post-Delivery Verified Review Collection', type: 'review_collection', aud: 'Delivered 7 days ago' },
                      { name: '10. Birthday & Anniversary Treats', type: 'birthday_anniversary', aud: 'Celebration date match' },
                    ].map((c, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="p-3 font-medium text-white">{c.name}</td>
                        <td className="p-3 font-mono text-slate-400">{c.type}</td>
                        <td className="p-3 text-slate-400">{c.aud}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                            Safe Inactive
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Required (Owner Gate)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. MARKETING AUTOMATIONS */}
          {activeTab === 'automations' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Marketing Automation Timing & Quiet Hours (Asia/Kolkata)
              </h3>
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                    <div className="text-slate-400">Quiet Hours Protection</div>
                    <div className="text-white font-mono mt-1 text-sm font-semibold">21:00 to 09:00 IST</div>
                    <div className="text-[11px] text-emerald-400 mt-1">Zero automated messaging at night</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                    <div className="text-slate-400">Frequency Capping</div>
                    <div className="text-white font-mono mt-1 text-sm font-semibold">Max 2 msgs / week</div>
                    <div className="text-[11px] text-slate-400 mt-1">Suppression list automatically checked</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                    <div className="text-slate-400">Opt-Out Compliance</div>
                    <div className="text-white font-mono mt-1 text-sm font-semibold">STOP / STOP PROMO</div>
                    <div className="text-[11px] text-emerald-400 mt-1">Immediate permanent opt-out enforcement</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 8. CUSTOMER SEGMENTATION (RFM) */}
          {activeTab === 'segments' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                RFM Segmentation Matrix (Recency, Frequency, Monetary)
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">Champions</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">142</div>
                  <div className="text-[11px] text-slate-500 mt-1">R: &lt;14d, F: 4+, LTV: &gt;₹3,000</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">Loyal Customers</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">318</div>
                  <div className="text-[11px] text-slate-500 mt-1">R: &lt;30d, F: 2+, LTV: &gt;₹1,500</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">At-Risk Customers</div>
                  <div className="text-2xl font-bold text-amber-400 mt-1">94</div>
                  <div className="text-[11px] text-slate-500 mt-1">R: 35-60d, No order recently</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">Dormant Customers</div>
                  <div className="text-2xl font-bold text-rose-400 mt-1">210</div>
                  <div className="text-[11px] text-slate-500 mt-1">R: &gt;60d, Win-back target</div>
                </div>
              </div>
            </div>
          )}

          {/* 9. PRODUCTS CATALOG (READ-ONLY) */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Ecommerce Product Catalog (Strictly Read-Only External Truth)
                </h3>
                <span className="px-2.5 py-1 text-xs bg-cyan-950 text-cyan-400 border border-cyan-800 rounded font-mono flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> READ-ONLY ENFORCED
                </span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Variants</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Refrigeration?</th>
                      <th className="p-3">Catalog Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Artisanal Paan Mukhwas (Calcuttia Betel)</td>
                      <td className="p-3 font-mono">150g, 300g</td>
                      <td className="p-3 font-mono text-emerald-400">₹249 - ₹449</td>
                      <td className="p-3">
                        <span className="text-cyan-400">Recommended (Door pocket)</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">Active</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Seeds Fusion (6-Seed Powerhouse)</td>
                      <td className="p-3 font-mono">200g</td>
                      <td className="p-3 font-mono text-emerald-400">₹249</td>
                      <td className="p-3">
                        <span className="text-slate-400">No (Table Anchor)</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">Active</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 10. INVENTORY */}
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Inventory & Reorder Thresholds
              </h3>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="text-slate-400">Finished Goods (Paan 300g)</div>
                  <div className="text-xl font-bold text-white">42 jars</div>
                  <div className="text-emerald-400">Healthy Buffer (&gt;20 threshold)</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="text-slate-400">Finished Goods (Seeds 200g)</div>
                  <div className="text-xl font-bold text-amber-400">12 bags</div>
                  <div className="text-amber-400">Low Stock Alert (&lt;15 threshold)</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="text-slate-400">Packaging Glass Jars</div>
                  <div className="text-xl font-bold text-white">450 units</div>
                  <div className="text-emerald-400">Adequate for 3 batches</div>
                </div>
              </div>
            </div>
          )}

          {/* 11. MANUFACTURING */}
          {activeTab === 'manufacturing' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Manufacturing Work Orders (Surat Facility)
              </h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Order No</th>
                      <th className="p-3">Recipe</th>
                      <th className="p-3">Planned Qty</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Scheduled Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-emerald-400">MFG-2026-042</td>
                      <td className="p-3">Royal Calcuttia Paan (Batch 42)</td>
                      <td className="p-3">100 kg</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">In Production</span>
                      </td>
                      <td className="p-3 text-slate-400">18 Nov 2026</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 12. RAW MATERIALS */}
          {activeTab === 'raw_materials' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Raw Materials & Spice Procurement Stock
              </h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Material</th>
                      <th className="p-3">Current Stock</th>
                      <th className="p-3">Safety Stock</th>
                      <th className="p-3">Cost / kg</th>
                      <th className="p-3">Primary Supplier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Calcuttia Betel Leaf Extract</td>
                      <td className="p-3 font-mono">18.5 kg</td>
                      <td className="p-3 font-mono">15.0 kg</td>
                      <td className="p-3 font-mono text-emerald-400">₹850 / kg</td>
                      <td className="p-3">Bengal Agro Organics</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Desi Gulkand (Damask Rose)</td>
                      <td className="p-3 font-mono">85.0 kg</td>
                      <td className="p-3 font-mono">50.0 kg</td>
                      <td className="p-3 font-mono text-emerald-400">₹320 / kg</td>
                      <td className="p-3">Pushkar Natural Treats</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 13. PRODUCTION & BATCHES */}
          {activeTab === 'production' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Production Batches & Quality Assurance Records
              </h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Batch No</th>
                      <th className="p-3">Product</th>
                      <th className="p-3">Yield %</th>
                      <th className="p-3">QA Check</th>
                      <th className="p-3">Manufactured</th>
                      <th className="p-3">Best Before</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-emerald-400">BATCH-2026-11B</td>
                      <td className="p-3 font-medium text-white">Artisanal Paan Mukhwas</td>
                      <td className="p-3 font-mono text-emerald-400">98.4%</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">PASSED (FSSAI)</span>
                      </td>
                      <td className="p-3 text-slate-400">17 Nov 2026</td>
                      <td className="p-3 text-slate-400">17 May 2027</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 14. SUPPLIERS */}
          {activeTab === 'suppliers' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Verified Raw Material Suppliers & Rating Matrix
              </h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Supplier Name</th>
                      <th className="p-3">Materials Supplied</th>
                      <th className="p-3">Contact</th>
                      <th className="p-3">Rating</th>
                      <th className="p-3">Payment Terms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Pushkar Natural Treats</td>
                      <td className="p-3">Gulkand, Rose Petals</td>
                      <td className="p-3 font-mono">Rajesh Bhai (919811223344)</td>
                      <td className="p-3 text-amber-300">4.9 ★</td>
                      <td className="p-3 font-mono">Net 30</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Bengal Agro Organics</td>
                      <td className="p-3">Betel Leaves, Spices</td>
                      <td className="p-3 font-mono">Debabrata (919822114455)</td>
                      <td className="p-3 text-amber-300">4.7 ★</td>
                      <td className="p-3 font-mono">Advance 50%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 15. PROCUREMENT */}
          {activeTab === 'procurement' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Procurement Forecasts & Automated RFQs
              </h3>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-3">
                <div className="text-slate-300">
                  AI Procurement Agent recommends reordering <strong className="text-white">25 kg Betel Leaf extract</strong> before 24 Nov based on 14-day sales velocity and pending wedding orders.
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-semibold rounded-lg text-xs">
                    Draft RFQ to Bengal Agro
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 16. CALLS & NEGOTIATIONS */}
          {activeTab === 'calls' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Supplier Calls & Voice Negotiations (Identity: Mintara Bites Manager)
              </h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">Call SID</th>
                      <th className="p-3">Supplier</th>
                      <th className="p-3">Purpose</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Tentative Terms</th>
                      <th className="p-3">Approval Gate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-emerald-400">CALL-2026-902</td>
                      <td className="p-3 font-medium text-white">Pushkar Natural Treats</td>
                      <td className="p-3">Gulkand 100kg batch quotation</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">Completed</span>
                      </td>
                      <td className="p-3 text-slate-400">₹300/kg (5% discount on prompt pay)</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300">
                          Pending Owner Approval
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 17. FINANCIALS */}
          {activeTab === 'financials' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Financial Intelligence (Verified vs Estimated Data)
              </h3>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Gross Monthly Revenue (Verified)</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">₹4,82,600</div>
                  <div className="text-[11px] text-slate-500 mt-1">100% matched with Razorpay settlement</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Blended COGS (Estimated)</div>
                  <div className="text-2xl font-bold text-white mt-1">36.8%</div>
                  <div className="text-[11px] text-slate-500 mt-1">₹1,77,596 (Packaging + Raw Materials)</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Net Contribution Margin (CM2)</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">42.4%</div>
                  <div className="text-[11px] text-slate-500 mt-1">After Shiprocket logistics & Meta ad spend</div>
                </div>
              </div>
            </div>
          )}

          {/* 18. REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Daily 22:00 IST Intelligence Reports (Zero Hallucinated Metrics)
              </h3>
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-3 font-mono">
                <div className="text-emerald-400 font-bold text-sm">
                  📊 MINTARA BITES — DAILY INTELLIGENCE REPORT [2026-11-17]
                </div>
                <div className="text-slate-300 leading-relaxed whitespace-pre-wrap">
{`1. REVENUE & SALES (VERIFIED DB)
- Gross Sales: ₹18,450.00 | Total Orders: 24 | AOV: ₹768.75
- Payment Split: Prepaid 75% (₹13,837.50) | COD 25% (₹4,612.50)

2. WHATSAPP & SUPPORT TELEMETRY
- Incoming Queries: 38 | AI Handled: 34 (89.5%) | Human Escalated: 4
- Top Query: Courier Tracking Link Request (100% Shiprocket Links Shared)

3. COURIER & LOGISTICS
- Dispatched Today: 22 | Delivered: 19 | NDR Flagged: 1

4. RAW MATERIAL & PRODUCTION
- Paan Mukhwas 300g Batch 42 yield: 98.4%
- Critical Stock Alerts: Seeds Fusion 200g approaching reorder threshold.`}
                </div>
              </div>
            </div>
          )}

          {/* 19. ALERTS & ESCALATIONS */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Operational Alerts & Escalations
              </h3>
              <div className="space-y-2">
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-rose-300">Shiprocket NDR: Delayed Order #10492</div>
                      <div className="text-slate-400">Customer Pooja Sharma contacted courier; address landmark requested.</div>
                    </div>
                  </div>
                  <button className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-medium">
                    Resolve
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <Flame className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-amber-300">Low Stock Alert: Seeds Fusion 200g</div>
                      <div className="text-slate-400">Stock dropped to 12 units on website catalog.</div>
                    </div>
                  </div>
                  <button className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-black rounded text-xs font-semibold">
                    Create PO
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 20. KNOWLEDGE CENTRE */}
          {activeTab === 'knowledge' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Knowledge Centre & Continuous Learning Proposals
              </h3>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-3">
                <div className="text-slate-300">
                  Business Knowledge documents ingested: <strong className="text-white">Business Profile, Brand Identity, Recipes, FSSAI compliance, FAQ handbook</strong>.
                </div>
                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">Pending Learning Proposal: FAQ Update</div>
                    <div className="text-slate-400">Customer feedback suggests clarifying Paan Mukhwas shelf life in high humidity.</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-2.5 py-1 bg-emerald-600 text-black rounded text-[11px] font-semibold">
                      Approve & Incorporate
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 21. AI CONFIGURATION */}
          {activeTab === 'ai_config' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                AI Provider Configuration & 15 Specialized Agents
              </h3>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Primary AI Provider</span>
                  <span className="font-mono text-emerald-400">Google Gemini (gemini-2.5-flash)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Direct SQL Execution</span>
                  <span className="font-mono text-rose-400">DISABLED (Strict Typed Tools Only)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Typed Tools Registered</span>
                  <span className="font-mono text-white">21 Enterprise Backend Tools</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Specialized Agents Active</span>
                  <span className="font-mono text-emerald-400">15 Specialized Agents (Role-Gated)</span>
                </div>
              </div>
            </div>
          )}

          {/* 22. LEVEL 3 APPROVALS */}
          {activeTab === 'approvals' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Level 3 Autonomy Approval Queue (Human In The Loop)
                </h3>
                <span className="text-xs text-amber-400 font-mono">3 Pending Approval</span>
              </div>
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-slate-900/70 border border-amber-500/30 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-white flex items-center gap-2">
                      <span>Purchase Order: 200kg Betel Leaf Extract</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-mono">
                        Financial Impact: ₹38,000
                      </span>
                    </div>
                    <div className="text-slate-400 mt-1">
                      Supplier: Bengal Agro Organics • Advance 50% requested • Initiated by Procurement Agent.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-semibold rounded-lg text-xs">
                      Approve PO
                    </button>
                    <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs">
                      Reject
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/70 border border-amber-500/30 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-white flex items-center gap-2">
                      <span>Personalized Discount Exception: 12% for Corporate Gift Lead</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-mono">
                        Order Value: ₹14,500
                      </span>
                    </div>
                    <div className="text-slate-400 mt-1">
                      Lead: Gujarat Diamond Export House • Exceeds 5% automated discount ceiling.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-semibold rounded-lg text-xs">
                      Approve
                    </button>
                    <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs">
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 23. WORKFLOW MONITORING */}
          {activeTab === 'workflows' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Background Task Worker & Job Queue Telemetry
              </h3>
              <div className="grid grid-cols-4 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Worker Status</div>
                  <div className="text-emerald-400 font-bold text-lg mt-1 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    RUNNING
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Poll Interval</div>
                  <div className="text-white font-mono font-bold text-lg mt-1">10,000 ms</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Atomic Job Lock</div>
                  <div className="text-white font-mono font-bold text-lg mt-1">300 sec timeout</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Completed Jobs (24h)</div>
                  <div className="text-white font-mono font-bold text-lg mt-1">1,248</div>
                </div>
              </div>
            </div>
          )}

          {/* 24. USERS & ROLES */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tenant Users & Role-Based Access Control (RBAC)
              </h3>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">User</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Permissions</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Pathik (Owner)</td>
                      <td className="p-3 font-mono">owner@mintarabites.com</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono">OWNER / SUPERADMIN</span>
                      </td>
                      <td className="p-3 text-slate-400">Full Level 3 Approval & Override</td>
                      <td className="p-3">
                        <span className="text-emerald-400 font-mono">Active</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">Operations Desk</td>
                      <td className="p-3 font-mono">ops@mintarabites.com</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">OPERATIONS</span>
                      </td>
                      <td className="p-3 text-slate-400">Support, Inventory, Human Takeover</td>
                      <td className="p-3">
                        <span className="text-emerald-400 font-mono">Active</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 25. SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Platform Brand Profile & Security Configuration
              </h3>
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-slate-400">Brand Name</label>
                    <input
                      type="text"
                      readOnly
                      value="Mintara Bites"
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400">Store Website</label>
                    <input
                      type="text"
                      readOnly
                      value="https://mintarabites.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400">Operational Timezone</label>
                    <input
                      type="text"
                      readOnly
                      value="Asia/Kolkata (IST)"
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400">WhatsApp Notification Alert Phone</label>
                    <input
                      type="text"
                      readOnly
                      value="919426868612"
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
