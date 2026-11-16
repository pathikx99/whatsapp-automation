export function renderSupportDashboardHtml(brandName = 'D2C Store'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName} - WhatsApp Command Center | Live Agent Support Desk (Zero Meta OTP Friction)</title>
  <style>
    :root {
      --bg: #090d16;
      --panel-bg: #0f172a;
      --card-bg: #1e293b;
      --card-hover: #273549;
      --card-active: #1d3354;
      --border: #2e3e56;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #22c55e;
      --accent-hover: #16a34a;
      --danger: #ef4444;
      --warning: #f59e0b;
      --info: #3b82f6;
      --agent-msg: #065f46;
      --bot-msg: #1e3a8a;
      --user-msg: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    
    /* Top Header */
    header { background: var(--panel-bg); border-bottom: 1px solid var(--border); padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-size: 1.15rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .header-actions { display: flex; gap: 10px; align-items: center; }
    
    /* Badges */
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 9999px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
    .badge-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-escalated { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-active { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    .badge-warning { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-resolved { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
    .badge-count { background: #334155; color: #fff; padding: 1px 6px; border-radius: 10px; font-size: 0.7rem; }
    
    /* Main Layout */
    .main-layout { display: grid; grid-template-columns: 360px 1fr 340px; flex: 1; overflow: hidden; }
    
    /* Left Panel: Conversations & Inbound Feeds */
    .inbox-panel { border-right: 1px solid var(--border); background: var(--panel-bg); display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .inbox-search-area { padding: 12px 14px 8px; border-bottom: 1px solid var(--border); }
    .search-input { width: 100%; background: #090d16; border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 0.85rem; outline: none; }
    .search-input:focus { border-color: var(--accent); }
    .inbox-tabs { display: flex; gap: 6px; padding: 8px 14px; border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
    .inbox-tabs::-webkit-scrollbar { display: none; }
    .tab-btn { background: transparent; border: 1px solid transparent; color: var(--text-muted); padding: 5px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; flex-shrink: 0; }
    .tab-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
    .tab-btn.active { color: #fff; background: var(--card-bg); border-color: var(--border); }
    
    .conversation-list { overflow-y: auto; flex: 1; }
    .conv-card { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: all 0.15s; }
    .conv-card:hover { background: var(--card-hover); }
    .conv-card.active { background: var(--card-active); border-left: 3px solid var(--accent); }
    .conv-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
    .conv-title { font-weight: 600; font-size: 0.88rem; color: #fff; display: flex; align-items: center; gap: 6px; }
    .conv-time { font-size: 0.7rem; color: var(--text-muted); }
    .conv-meta { display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px; }
    .conv-snippet { font-size: 0.78rem; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    
    /* Center Panel: Real-time Live Chat */
    .chat-panel { display: flex; flex-direction: column; height: 100%; background: #070b13; overflow: hidden; }
    .chat-header { padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--panel-bg); display: flex; justify-content: space-between; align-items: center; }
    .customer-info-title { font-weight: 600; font-size: 1rem; color: #fff; display: flex; align-items: center; gap: 8px; }
    .customer-info-sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }
    .chat-controls { display: flex; gap: 8px; align-items: center; }
    
    .chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .message-bubble { max-width: 75%; padding: 10px 14px; border-radius: 12px; font-size: 0.9rem; line-height: 1.45; word-break: break-word; position: relative; }
    .msg-user { align-self: flex-start; background: var(--user-msg); color: #f1f5f9; border: 1px solid var(--border); border-bottom-left-radius: 2px; }
    .msg-bot { align-self: flex-end; background: var(--bot-msg); color: #bfdbfe; border-bottom-right-radius: 2px; }
    .msg-agent { align-self: flex-end; background: var(--agent-msg); color: #d1fae5; border-bottom-right-radius: 2px; }
    .msg-sender-tag { font-size: 0.72rem; font-weight: 600; margin-bottom: 4px; display: flex; justify-content: space-between; opacity: 0.9; }
    .msg-meta { font-size: 0.68rem; opacity: 0.7; margin-top: 4px; text-align: right; }
    
    .chat-composer-area { padding: 14px 18px; border-top: 1px solid var(--border); background: var(--panel-bg); display: flex; flex-direction: column; gap: 8px; }
    .quick-replies-bar { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; -ms-overflow-style: none; align-items: center; }
    .quick-replies-bar::-webkit-scrollbar { display: none; }
    .btn-quick-reply { background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: #cbd5e1; border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; cursor: pointer; white-space: nowrap; transition: all 0.15s; flex-shrink: 0; }
    .btn-quick-reply:hover { background: rgba(34, 197, 94, 0.15); color: #4ade80; border-color: rgba(34, 197, 94, 0.4); }
    .composer-input-wrapper { display: flex; gap: 10px; align-items: flex-end; }
    .chat-textarea { flex: 1; background: #090d16; border: 1px solid var(--border); border-radius: 8px; color: #fff; padding: 10px 14px; font-size: 0.9rem; resize: none; min-height: 52px; max-height: 120px; outline: none; }
    .chat-textarea:focus { border-color: var(--accent); }
    .composer-caption { font-size: 0.72rem; color: var(--text-muted); display: flex; justify-content: space-between; }
    
    /* Buttons */
    .btn { padding: 8px 14px; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer; border: none; transition: opacity 0.15s, background 0.15s; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0; }
    .btn:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary { background: var(--accent); color: #000; }
    .btn-warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .btn-warning:hover { background: rgba(245, 158, 11, 0.35); }
    .btn-info { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); }
    .btn-info:hover { background: rgba(59, 130, 246, 0.35); }
    .btn-secondary { background: #1e293b; color: #e2e8f0; border: 1px solid var(--border); }
    .btn-secondary:hover { background: #334155; }
    
    /* Right Panel: Dossier */
    .dossier-panel { border-left: 1px solid var(--border); background: var(--panel-bg); display: flex; flex-direction: column; overflow-y: auto; padding: 16px; }
    .dossier-section { margin-bottom: 20px; }
    .dossier-section h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 4px; display: flex; justify-content: space-between; }
    .dossier-row { display: flex; justify-content: space-between; font-size: 0.84rem; padding: 4px 0; }
    .dossier-row .label { color: var(--text-muted); }
    .dossier-row .value { font-weight: 500; }
    .order-card { background: rgba(0,0,0,0.25); border: 1px solid var(--border); border-radius: 6px; padding: 10px; margin-top: 8px; font-size: 0.82rem; }
    .order-card .order-header { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 4px; }
    .order-card .items-list { font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; line-height: 1.35; }
    .ndr-box { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 6px; padding: 10px; font-size: 0.82rem; color: #fde68a; margin-top: 8px; }
    
    .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.88rem; text-align: center; padding: 24px; line-height: 1.5; }

    /* Modal Backdrop & Dialog */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); display: none; justify-content: center; align-items: center; z-index: 1000; }
    .modal-card { background: var(--panel-bg); border: 1px solid var(--border); border-radius: 12px; width: 92%; max-width: 440px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    .modal-card h2 { font-size: 1.15rem; font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; color: #fff; }
    .modal-card p { font-size: 0.82rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.45; }
    .modal-input-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .modal-input-wrapper { display: flex; gap: 6px; }
    .modal-input { flex: 1; background: #090d16; border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; color: #fff; font-size: 0.9rem; outline: none; }
    .modal-input:focus { border-color: var(--accent); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .modal-error { color: var(--danger); font-size: 0.78rem; margin-bottom: 12px; display: none; }
    .modal-hint { font-size: 0.72rem; color: var(--text-muted); line-height: 1.4; margin-top: 14px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); }

    /* Responsive Viewport Controls */
    .mobile-only { display: none !important; }
    .mobile-tablet-toggle { display: none !important; }
    .mobile-tablet-header { display: none !important; }

    @media (min-width: 1025px) {
      .main-layout { display: grid; grid-template-columns: 360px 1fr 340px; flex: 1; overflow: hidden; }
      .dossier-panel { display: flex !important; }
    }

    @media (max-width: 1024px) and (min-width: 768px) {
      .main-layout { display: grid; grid-template-columns: 320px 1fr; flex: 1; overflow: hidden; position: relative; }
      .mobile-tablet-toggle { display: inline-flex !important; }
      .header-sub-badge { display: none !important; }
      .dossier-panel {
        display: none;
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 360px;
        z-index: 50;
        box-shadow: -8px 0 24px rgba(0,0,0,0.6);
        background: var(--panel-bg);
      }
      .dossier-panel.drawer-open {
        display: flex !important;
      }
      .mobile-tablet-header { display: flex !important; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    }

    @media (max-width: 767px) {
      header { padding: 10px 14px; flex-wrap: wrap; gap: 8px; }
      header h1 { font-size: 0.95rem; }
      .header-sub-badge { display: none !important; }
      .header-actions { gap: 6px; }
      .header-actions .btn { padding: 6px 10px; font-size: 0.75rem; }
      #sync-status { display: none !important; }

      .main-layout { display: flex; flex-direction: column; flex: 1; overflow: hidden; position: relative; }
      .inbox-panel { width: 100%; height: 100%; display: flex; }
      .chat-panel { width: 100%; height: 100%; display: none; }
      .dossier-panel { width: 100%; height: 100%; display: none; padding: 14px; }

      .main-layout.view-chat .inbox-panel { display: none !important; }
      .main-layout.view-chat .chat-panel { display: flex !important; }
      .main-layout.view-chat .dossier-panel { display: none !important; }

      .main-layout.view-dossier .inbox-panel { display: none !important; }
      .main-layout.view-dossier .chat-panel { display: none !important; }
      .main-layout.view-dossier .dossier-panel { display: flex !important; }

      .mobile-only { display: inline-flex !important; }
      .mobile-tablet-toggle { display: inline-flex !important; }
      .mobile-tablet-header { display: flex !important; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }

      .chat-header { padding: 10px 12px; flex-direction: column; align-items: flex-start; gap: 8px; }
      .chat-header > div:first-child { width: 100%; }
      .chat-controls { width: 100%; justify-content: flex-start; flex-wrap: wrap; gap: 6px; }
      .chat-controls .btn { padding: 6px 10px; font-size: 0.75rem; }
      .chat-composer-area { padding: 10px 12px; }
      .composer-caption span:first-child { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <h1>
      <span>🌿</span> ${brandName} WhatsApp Command Center
      <span class="badge badge-success">● Live Official Meta API</span>
      <span class="badge badge-active header-sub-badge" style="font-size: 0.68rem; opacity: 0.85;">Live Agent Support Desk (Zero Meta OTP Friction)</span>
    </h1>
    <div class="header-actions">
      <span id="sync-status" class="badge badge-warning">⚡ Connecting...</span>
      <button id="btn-admin-key" class="btn btn-secondary">🔑 Admin Key</button>
      <button id="btn-refresh-view" class="btn btn-secondary">🔄 Refresh</button>
    </div>
  </header>

  <div id="main-layout" class="main-layout">
    <!-- Left Panel: All Inbound Conversations -->
    <div class="inbox-panel">
      <div class="inbox-search-area" style="display: flex; gap: 8px; align-items: center;">
        <input 
          id="search-input" 
          type="text" 
          class="search-input" 
          placeholder="🔍 Search or enter phone..."
          style="flex: 1;"
        />
        <button id="btn-open-new-chat" class="btn btn-primary" style="padding: 8px 12px; font-size: 0.8rem; white-space: nowrap; flex-shrink: 0;" title="Start chat with any phone number">
          ➕ New Chat
        </button>
      </div>
      <div class="inbox-tabs">
        <button id="tab-all" class="tab-btn active">All <span id="count-all" class="badge-count">0</span></button>
        <button id="tab-attention" class="tab-btn">🚨 Attention <span id="count-attention" class="badge-count">0</span></button>
        <button id="tab-active" class="tab-btn">🤖 AI Active <span id="count-active" class="badge-count">0</span></button>
        <button id="tab-resolved" class="tab-btn">✅ Resolved <span id="count-resolved" class="badge-count">0</span></button>
      </div>
      <div id="conversations-container" class="conversation-list">
        <div class="empty-state">Loading conversations...</div>
      </div>
    </div>

    <!-- Center Panel: Real-time Live Chat -->
    <div class="chat-panel">
      <div id="chat-header" class="chat-header" style="display: none;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <button id="btn-back-to-inbox" class="btn btn-secondary mobile-only" title="Back to Inbox">
            ← Inbox
          </button>
          <div>
            <div class="customer-info-title">
              <span id="active-customer-name">Customer Name</span>
              <span id="active-status-badge" class="badge badge-active">🤖 AI Handling</span>
            </div>
            <div id="active-customer-phone" class="customer-info-sub">+91...</div>
          </div>
        </div>
        <div class="chat-controls">
          <button id="btn-toggle-dossier" class="btn btn-secondary mobile-tablet-toggle" title="View Customer Dossier">
            📋 Info
          </button>
          <button id="btn-toggle-bot" class="btn btn-warning">
            ⏸️ Pause AI (Take Over)
          </button>
          <button id="btn-resolve-ticket" class="btn btn-secondary" style="display: none;">
            ✅ Resolve Ticket
          </button>
          <button id="btn-export-chat" class="btn btn-secondary" title="Download chat transcript">
            📥 Export
          </button>
          <a id="link-wa-direct" href="#" target="_blank" class="btn btn-secondary" title="Open direct chat in WhatsApp Web">
            ↗ WhatsApp
          </a>
        </div>
      </div>

      <div id="messages-container" class="chat-messages">
        <div class="empty-state">
          <div style="font-size: 2.2rem; margin-bottom: 10px;">💬</div>
          Select a customer from the left inbox to view messages and chat live.
        </div>
      </div>

      <div id="chat-composer-area" class="chat-composer-area" style="display: none;">
        <div class="quick-replies-bar">
          <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; margin-right: 4px;">⚡ Quick Replies:</span>
          <button type="button" class="btn-quick-reply" data-text="Hello! ❄️ To maintain the freshest crunch and aroma of your Paan Mukhwas, please keep it refrigerated in an airtight jar. Enjoy!">❄️ Refrigeration FAQ</button>
          <button type="button" class="btn-quick-reply" data-text="Thank you for sharing your landmark directions! 📍 We have forwarded your exact instructions to our courier delivery partner for priority re-attempt.">📍 Courier Landmark</button>
          <button type="button" class="btn-quick-reply" data-text="Your order is currently in transit! 🚚 You can track live courier milestones anytime, or let us know if you need priority dispatch assistance.">🚚 Order Tracking</button>
          <button type="button" class="btn-quick-reply" data-text="As a special thank you from our family at Mintara Bites, here is an exclusive 10% privilege discount on your next box: use code MINTARA10 at checkout! 🌿">🎁 10% Off Privilege</button>
          <button type="button" class="btn-quick-reply" data-text="Hi there! 👋 This is senior customer care following up directly. How can I best assist you with your order today?">✍️ Senior Support</button>
        </div>
        <div class="composer-input-wrapper">
          <textarea 
            id="reply-input" 
            class="chat-textarea" 
            placeholder="Type a WhatsApp reply to customer... (Press Enter to send, Shift+Enter for newline)"
          ></textarea>
          <button id="btn-send-reply" class="btn btn-primary">
            Send WhatsApp ✈️
          </button>
        </div>
        <div class="composer-caption">
          <span>⚡ Sending directly to customer's WhatsApp via Official Cloud API (Brand: <strong>${brandName}</strong>)</span>
          <span id="typing-indicator" style="color: var(--accent); display: none;">Sending message...</span>
        </div>
      </div>
    </div>

    <!-- Right Panel: Customer Intelligence & Logistics Dossier -->
    <div id="dossier-panel" class="dossier-panel">
      <div class="mobile-tablet-header">
        <button id="btn-back-to-chat" class="btn btn-secondary">← Back to Chat</button>
        <span style="font-weight: 600; font-size: 0.85rem; color: #fff;">Customer Info</span>
      </div>
      <div id="dossier-container">
        <div class="empty-state">Customer store details, order history, and landmark instructions will appear here.</div>
      </div>
    </div>
  </div>

  <!-- Admin Auth Modal -->
  <div id="auth-modal" class="modal-overlay">
    <div class="modal-card">
      <h2><span>🔐</span> Admin Authentication Required</h2>
      <p>Enter your store administrator password or API key to access live customer conversations.</p>
      
      <div id="auth-modal-error" class="modal-error"></div>
      
      <div class="modal-input-group">
        <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">ADMIN PASSWORD / API KEY</label>
        <div class="modal-input-wrapper">
          <input 
            type="password" 
            id="auth-key-input" 
            class="modal-input" 
            placeholder="Enter admin key..."
          />
          <button id="btn-toggle-pwd" type="button" class="btn btn-secondary" title="Show/Hide Key">👁️</button>
        </div>
      </div>
      
      <div class="modal-actions">
        <button id="btn-close-key-modal" class="btn btn-secondary">Cancel</button>
        <button id="btn-save-key" class="btn btn-primary">Unlock Command Center 🚀</button>
      </div>

      <div class="modal-hint">
        🔒 <strong>Authorized Store Access:</strong> Enter your configured <code>ADMIN_API_KEY</code>. You can also append <code>?key=&lt;ADMIN_KEY&gt;</code> to this dashboard URL to authenticate automatically.
      </div>
    </div>
  </div>

  <!-- New Direct Chat Modal -->
  <div id="new-chat-modal" class="modal-overlay" style="display: none;">
    <div class="modal-card">
      <h2><span>💬</span> Start WhatsApp Chat</h2>
      <p>Enter any customer phone number to initiate or open a live conversation desk.</p>
      
      <div id="new-chat-modal-error" class="modal-error"></div>
      
      <div class="modal-input-group">
        <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">PHONE NUMBER (WITH OR WITHOUT +91)</label>
        <div class="modal-input-wrapper">
          <input 
            type="text" 
            id="new-chat-phone" 
            class="modal-input" 
            placeholder="e.g. 8732993344 or +91 98765 43210"
          />
        </div>
      </div>

      <div class="modal-input-group">
        <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">CUSTOMER NAME (OPTIONAL)</label>
        <div class="modal-input-wrapper">
          <input 
            type="text" 
            id="new-chat-name" 
            class="modal-input" 
            placeholder="e.g. Pathik Patel"
          />
        </div>
      </div>

      <div class="modal-input-group">
        <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">INITIAL MESSAGE (OPTIONAL)</label>
        <div class="modal-input-wrapper">
          <textarea 
            id="new-chat-msg" 
            class="modal-input" 
            style="min-height: 70px; resize: vertical; padding: 10px;"
            placeholder="Type a message to dispatch immediately via WhatsApp, or leave blank to just open the chat desk..."
          ></textarea>
        </div>
      </div>
      
      <div class="modal-actions">
        <button id="btn-close-new-chat-modal" class="btn btn-secondary">Cancel</button>
        <button id="btn-submit-new-chat" class="btn btn-primary">Start Chat 🚀</button>
      </div>
    </div>
  </div>

  <script>
    let currentConversationId = null;
    let currentConversation = null;
    let currentTicket = null;
    let conversations = [];
    let activeFilter = 'all';
    let searchQuery = '';
    let pollInterval = null;
    let isAuthModalOpen = false;
    let authFailed = false;
    let targetConvId = null;

    // 0. Auto-check URL query parameters on initial boot: ?key=... & ?conv=...
    (function checkUrlAuth() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const queryKey = urlParams.get('key') || urlParams.get('admin_key') || urlParams.get('adminKey') || urlParams.get('token');
        if (queryKey) {
          localStorage.setItem('d2c_admin_key', queryKey.trim());
        }
        targetConvId = urlParams.get('conv') || urlParams.get('conversationId') || urlParams.get('id') || urlParams.get('phone');
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (e) {
        // Safe query param parse fallback
      }
    })();

    function setSyncStatus(status, text) {
      const badge = document.getElementById('sync-status');
      if (!badge) return;
      badge.className = 'badge ' + (status === 'ok' ? 'badge-success' : status === 'warn' ? 'badge-warning' : 'badge-escalated');
      badge.innerHTML = text;
    }

    function openKeyModal(errorMsg = '') {
      isAuthModalOpen = true;
      const modal = document.getElementById('auth-modal');
      if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('auth-key-input');
        if (input) {
          input.value = localStorage.getItem('d2c_admin_key') || '';
          input.focus();
        }
        const errEl = document.getElementById('auth-modal-error');
        if (errEl) {
          errEl.innerText = errorMsg;
          errEl.style.display = errorMsg ? 'block' : 'none';
        }
      }
    }

    function closeKeyModal() {
      isAuthModalOpen = false;
      const modal = document.getElementById('auth-modal');
      if (modal) modal.style.display = 'none';
    }

    function openNewChatModal(presetPhone = '') {
      const modal = document.getElementById('new-chat-modal');
      if (modal) {
        modal.style.display = 'flex';
        const phoneInput = document.getElementById('new-chat-phone');
        if (phoneInput) {
          if (presetPhone) phoneInput.value = presetPhone;
          phoneInput.focus();
        }
        const errEl = document.getElementById('new-chat-modal-error');
        if (errEl) errEl.style.display = 'none';
      }
    }

    function closeNewChatModal() {
      const modal = document.getElementById('new-chat-modal');
      if (modal) modal.style.display = 'none';
    }

    async function startNewChat() {
      const phoneInput = document.getElementById('new-chat-phone');
      const nameInput = document.getElementById('new-chat-name');
      const msgInput = document.getElementById('new-chat-msg');
      const errEl = document.getElementById('new-chat-modal-error');
      const submitBtn = document.getElementById('btn-submit-new-chat');

      const phone = (phoneInput?.value || '').trim();
      const customerName = (nameInput?.value || '').trim();
      const initialMessage = (msgInput?.value || '').trim();

      if (!phone) {
        if (errEl) {
          errEl.innerText = 'Please enter a valid phone number.';
          errEl.style.display = 'block';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Connecting...';
      }

      try {
        const res = await fetch('/api/support/conversations', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            phoneNumber: phone,
            customerName: customerName || undefined,
            initialMessage: initialMessage || undefined,
          }),
        });

        if (await handleAuthChallenge(res)) return;

        if (res.ok) {
          const data = await res.json();
          closeNewChatModal();
          if (phoneInput) phoneInput.value = '';
          if (nameInput) nameInput.value = '';
          if (msgInput) msgInput.value = '';
          
          await loadConversations();
          if (data.conversation?.id) {
            await selectConversation(data.conversation.id);
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errEl) {
            errEl.innerText = errData.error || 'Failed to start conversation.';
            errEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (errEl) {
          errEl.innerText = 'Network error connecting to support engine.';
          errEl.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Start Chat 🚀';
        }
      }
    }

    function togglePasswordVisibility() {
      const input = document.getElementById('auth-key-input');
      const btn = document.getElementById('btn-toggle-pwd');
      if (input) {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        if (btn) btn.innerText = isPassword ? '🙈' : '👁️';
      }
    }

    async function saveAdminKey() {
      const input = document.getElementById('auth-key-input');
      const key = (input?.value || '').trim();
      if (!key) {
        const errEl = document.getElementById('auth-modal-error');
        if (errEl) {
          errEl.innerText = 'Please enter an admin key.';
          errEl.style.display = 'block';
        }
        return;
      }

      const saveBtn = document.getElementById('btn-save-key');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Verifying...';
      }

      try {
        const res = await fetch('/api/support/auth/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': key,
          },
          body: JSON.stringify({ key }),
        });

        if (res.ok) {
          localStorage.setItem('d2c_admin_key', key);
          authFailed = false;
          closeKeyModal();
          setSyncStatus('warn', '⚡ Loading...');
          await loadConversations();
        } else {
          const errEl = document.getElementById('auth-modal-error');
          if (errEl) {
            errEl.innerText = 'Invalid admin key. Please verify your server credentials.';
            errEl.style.display = 'block';
          }
        }
      } catch (err) {
        const errEl = document.getElementById('auth-modal-error');
        if (errEl) {
          errEl.innerText = 'Network error while verifying admin key. Please check connection.';
          errEl.style.display = 'block';
        }
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = 'Unlock Command Center 🚀';
        }
      }
    }

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function getAuthHeaders(extraHeaders = {}) {
      const key = localStorage.getItem('d2c_admin_key') || '';
      const headers = { ...extraHeaders };
      if (key) {
        headers['x-admin-key'] = key;
      }
      return headers;
    }

    async function handleAuthChallenge(res) {
      if (res.status === 401) {
        authFailed = true;
        setSyncStatus('error', '🔒 Auth Required');
        const container = document.getElementById('conversations-container');
        if (container && conversations.length === 0) {
          container.innerHTML = 
            '<div class="empty-state">' +
              '<div style="font-size: 2rem; margin-bottom: 8px;">🔒</div>' +
              '<div style="font-weight: 600; color: #fff; margin-bottom: 4px;">Authentication Required</div>' +
              '<div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 14px;">Enter your Admin Key to view live conversations.</div>' +
              '<button id="btn-auth-unlock" class="btn btn-primary">🔑 Enter Admin Key</button>' +
            '</div>';
        }
        if (!isAuthModalOpen) {
          openKeyModal('Admin credentials required. Enter your Admin Key to unlock:');
        }
        return true;
      }
      return false;
    }

    function setFilter(filter) {
      activeFilter = filter;
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = document.getElementById('tab-' + (filter === 'escalated' ? 'attention' : filter));
      if (activeBtn) activeBtn.classList.add('active');
      renderConversationsList();
    }

    function handleSearch(val) {
      searchQuery = (val || '').toLowerCase().trim();
      renderConversationsList();
    }

    async function loadConversations() {
      try {
        const res = await fetch('/api/support/conversations', {
          headers: getAuthHeaders(),
        });
        if (await handleAuthChallenge(res)) return;
        const data = await res.json();
        conversations = data.conversations || [];
        authFailed = false;
        setSyncStatus('ok', '● Live Connected');
        updateCounts();
        renderConversationsList();

        if (!currentConversationId && targetConvId) {
          const cleanTarget = targetConvId.replace(/\D/g, '');
          const match = conversations.find(c => c.id === targetConvId || c.phoneNumber === targetConvId || (cleanTarget && (c.phoneNumber === cleanTarget || c.phoneNumber === '91' + cleanTarget)));
          if (match) {
            selectConversation(match.id);
          } else if (cleanTarget.length >= 10) {
            openNewChatModal(cleanTarget);
          }
          targetConvId = null;
        }
      } catch (err) {
        console.error('Failed loading conversations', err);
        setSyncStatus('error', '⚠️ Network Error');
      }
    }

    function updateCounts() {
      const allCount = conversations.length;
      const attentionCount = conversations.filter(c => c.status === 'escalated').length;
      const activeCount = conversations.filter(c => c.status === 'active').length;
      const resolvedCount = conversations.filter(c => c.status === 'resolved' || c.status === 'closed').length;

      document.getElementById('count-all').innerText = allCount;
      document.getElementById('count-attention').innerText = attentionCount;
      document.getElementById('count-active').innerText = activeCount;
      document.getElementById('count-resolved').innerText = resolvedCount;

      const baseTitle = '${brandName} WhatsApp Command Center';
      document.title = (attentionCount > 0 ? '🚨 (' + attentionCount + ' Urgent) ' : '') + baseTitle;
    }

    function renderConversationsList() {
      const container = document.getElementById('conversations-container');
      
      let filtered = conversations.filter(c => {
        if (activeFilter === 'resolved') {
          if (c.status !== 'resolved' && c.status !== 'closed') return false;
        } else if (activeFilter !== 'all' && c.status !== activeFilter) {
          return false;
        }
        if (searchQuery) {
          const matchName = (c.customerName || '').toLowerCase().includes(searchQuery);
          const matchPhone = (c.phoneNumber || '').toLowerCase().includes(searchQuery);
          const matchSnippet = (c.lastMessage?.content || '').toLowerCase().includes(searchQuery);
          return matchName || matchPhone || matchSnippet;
        }
        return true;
      });

      if (filtered.length === 0) {
        const digits = searchQuery.replace(/\D/g, '');
        if (digits.length >= 7) {
          container.innerHTML = '<div class="empty-state">' +
            '<p style="margin-bottom: 12px; font-size: 0.85rem;">No existing chat found for <strong>+' + escapeHtml(digits) + '</strong>.</p>' +
            '<button id="btn-search-new-chat" class="btn btn-primary" style="margin: 0 auto; font-size: 0.82rem;">💬 Start Chat With +' + escapeHtml(digits) + '</button>' +
          '</div>';
          const btn = document.getElementById('btn-search-new-chat');
          if (btn) btn.onclick = () => openNewChatModal(digits);
        } else {
          container.innerHTML = '<div class="empty-state">No conversations found in this view.</div>';
        }
        return;
      }

      container.innerHTML = filtered.map(c => {
        const isSelected = c.id === currentConversationId ? 'active' : '';
        let badgeHtml = '';
        if (c.status === 'escalated') {
          badgeHtml = '<span class="badge badge-escalated">🚨 Attention</span>';
        } else if (c.status === 'active') {
          badgeHtml = '<span class="badge badge-active">🤖 Bot Active</span>';
        } else {
          badgeHtml = '<span class="badge badge-resolved">✅ Resolved</span>';
        }

        const dateObj = new Date(c.lastMessage?.createdAt || c.updatedAt);
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let snippetPrefix = '';
        if (c.lastMessage) {
          if (c.lastMessage.role === 'customer') snippetPrefix = '👤 ';
          else if (c.lastMessage.role === 'human_agent') snippetPrefix = '✍️ Agent: ';
          else snippetPrefix = '🤖 AI: ';
        }
        const snippet = c.lastMessage ? snippetPrefix + c.lastMessage.content : 'No messages yet';

        return '<div class="conv-card ' + isSelected + '" data-id="' + escapeHtml(c.id) + '">' +
          '<div class="conv-header">' +
            '<span class="conv-title">' + escapeHtml(c.customerName || c.phoneNumber) + '</span>' +
            '<span class="conv-time">' + escapeHtml(timeStr) + '</span>' +
          '</div>' +
          '<div class="conv-meta">' +
            '<span>+' + escapeHtml(c.phoneNumber) + '</span>' +
            badgeHtml +
          '</div>' +
          '<div class="conv-snippet">' + escapeHtml(snippet) + '</div>' +
        '</div>';
      }).join('');
    }

    async function selectConversation(conversationId) {
      currentConversationId = conversationId;
      renderConversationsList();

      if (window.innerWidth < 768) {
        const layout = document.getElementById('main-layout');
        if (layout) {
          layout.classList.remove('view-dossier');
          layout.classList.add('view-chat');
        }
      }

      document.getElementById('chat-header').style.display = 'flex';
      document.getElementById('chat-composer-area').style.display = 'flex';

      try {
        const res = await fetch('/api/support/conversations/' + conversationId, {
          headers: getAuthHeaders(),
        });
        if (await handleAuthChallenge(res)) return;
        const data = await res.json();
        
        currentConversation = data.conversation;
        currentTicket = data.ticket;

        // Render header
        document.getElementById('active-customer-name').innerText = currentConversation.customerName || 'Customer';
        document.getElementById('active-customer-phone').innerText = '+' + currentConversation.phoneNumber;
        document.getElementById('link-wa-direct').href = 'https://wa.me/' + currentConversation.phoneNumber;

        updateHeaderStatus();

        // Render messages
        renderMessages(data.messages || []);

        // Render customer dossier
        renderDossier(data.customerDossier, data.ndrInstructions, currentConversation, currentTicket);

      } catch (err) {
        console.error('Failed fetching conversation details', err);
      }
    }

    function updateHeaderStatus() {
      const statusBadge = document.getElementById('active-status-badge');
      const toggleBtn = document.getElementById('btn-toggle-bot');
      const resolveBtn = document.getElementById('btn-resolve-ticket');

      if (!currentConversation) return;

      if (currentConversation.status === 'escalated') {
        statusBadge.className = 'badge badge-escalated';
        statusBadge.innerHTML = '🚨 Needs Human Support';
        toggleBtn.className = 'btn btn-primary';
        toggleBtn.innerHTML = '▶️ Re-enable AI Bot';
        if (resolveBtn) resolveBtn.style.display = 'inline-flex';
      } else {
        statusBadge.className = 'badge badge-active';
        statusBadge.innerHTML = '🤖 AI Handling';
        toggleBtn.className = 'btn btn-warning';
        toggleBtn.innerHTML = '⏸️ Pause AI (Take Over)';
        if (resolveBtn) resolveBtn.style.display = 'none';
      }
    }

    let currentMessagesList = [];

    function renderMessages(messages, isInitial = false) {
      const container = document.getElementById('messages-container');
      if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="empty-state">No messages in this conversation yet.</div>';
        currentMessagesList = [];
        return;
      }

      const isNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 100;
      currentMessagesList = messages;

      container.innerHTML = messages.map(m => {
        let bubbleClass = 'msg-user';
        let senderTag = '👤 Customer';
        if (m.role === 'assistant') {
          bubbleClass = 'msg-bot';
          senderTag = '🤖 Mintara AI Concierge';
        } else if (m.role === 'human_agent') {
          bubbleClass = 'msg-agent';
          senderTag = '✍️ Human Agent';
        }

        const date = new Date(m.createdAt);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let contentHtml = '';
        if (m.content && m.content.includes('[Media: audio]')) {
          contentHtml = '<div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(59,130,246,0.15); color: #93c5fd; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; font-size: 0.78rem;">🎙️ Voice Note / Audio Message</div><div>' + escapeHtml(m.content) + '</div>';
        } else if (m.content && (m.content.includes('[Media: image]') || m.content.includes('[Customer sent an image'))) {
          contentHtml = '<div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(168,85,247,0.15); color: #c084fc; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; font-size: 0.78rem;">🖼️ Customer Photo Attached</div><div>' + escapeHtml(m.content) + '</div>';
        } else if (m.content && m.content.includes('[Location:')) {
          contentHtml = '<div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(34,197,94,0.15); color: #4ade80; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; font-size: 0.78rem;">📍 Location Pin Received</div><div>' + escapeHtml(m.content) + '</div>';
        } else if (m.content && m.content.includes('[Button:')) {
          contentHtml = '<div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245,158,11,0.15); color: #fbbf24; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; font-size: 0.78rem;">🔘 Quick Button Tapped</div><div>' + escapeHtml(m.content) + '</div>';
        } else if (m.content && m.content.includes('[WhatsApp Catalog Cart Order]')) {
          contentHtml = '<div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(236,72,153,0.15); color: #f472b6; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; font-size: 0.78rem;">🛒 WhatsApp In-Chat Cart Order</div><div>' + escapeHtml(m.content) + '</div>';
        } else {
          contentHtml = '<div>' + escapeHtml(m.content) + '</div>';
        }

        return '<div class="message-bubble ' + bubbleClass + '">' +
          '<div class="msg-sender-tag">' +
            '<span>' + escapeHtml(senderTag) + '</span>' +
          '</div>' +
          contentHtml +
          '<div class="msg-meta">' + escapeHtml(timeStr) + '</div>' +
        '</div>';
      }).join('');

      if (isInitial || isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }

    function renderDossier(dossier, ndrList, conv, ticket) {
      const container = document.getElementById('dossier-container');
      const customer = dossier?.customer;
      const orders = dossier?.orders || [];

      let html = '';

      // Section 1: Customer Profile
      html += '<div class="dossier-section">';
      html += '<h3>👤 Customer Dossier</h3>';
      if (customer) {
        html += '<div class="dossier-row"><span class="label">Name:</span><span class="value">' + escapeHtml(customer.firstName + ' ' + (customer.lastName || '')) + '</span></div>';
        html += '<div class="dossier-row"><span class="label">Phone:</span><span class="value">+' + escapeHtml(conv.phoneNumber) + '</span></div>';
        if (customer.email) html += '<div class="dossier-row"><span class="label">Email:</span><span class="value">' + escapeHtml(customer.email) + '</span></div>';
        if (customer.segment) html += '<div class="dossier-row"><span class="label">Segment:</span><span class="value badge badge-active" style="text-transform: uppercase; font-size: 0.7rem; font-weight: 600;">' + escapeHtml(customer.segment) + '</span></div>';
        if (customer.totalOrders) html += '<div class="dossier-row"><span class="label">Orders:</span><span class="value">' + escapeHtml(customer.totalOrders) + '</span></div>';
        html += '<div class="dossier-row"><span class="label">Total Spent:</span><span class="value" style="color: var(--accent); font-weight: 600;">₹' + escapeHtml(customer.totalSpend || customer.totalSpent || 0) + '</span></div>';
      } else {
        html += '<div class="dossier-row"><span class="label">Phone:</span><span class="value">+' + escapeHtml(conv.phoneNumber) + '</span></div>';
        html += '<div class="dossier-row"><span class="label">Account:</span><span class="value">Guest / Inbound Lead</span></div>';
      }
      html += '</div>';

      // Section 2: Internal Agent Notes
      const meta = conv?.metadata || {};
      const internalNote = meta.internalNote || '';
      html += '<div class="dossier-section">' +
        '<h3>📝 Agent Internal Notes</h3>' +
        '<textarea id="internal-note-input" class="reply-input" style="width: 100%; min-height: 65px; font-size: 0.82rem; margin-bottom: 8px; resize: vertical;" placeholder="Add private notes (e.g. VIP handling, promise made, packaging issue)...">' + escapeHtml(internalNote) + '</textarea>' +
        '<button id="btn-save-note" class="btn btn-secondary" style="width: 100%; font-size: 0.78rem;">💾 Save Internal Note</button>' +
      '</div>';

      // Section 3: Escalation Attention Info
      if (ticket) {
        html += '<div class="dossier-section">';
        html += '<h3>🚨 Escalation Context</h3>';
        html += '<div class="ndr-box">';
        html += '<strong>Reason:</strong> ' + escapeHtml(ticket.reason || 'Requested Human Agent') + '<br/>';
        html += '<span style="font-size: 0.72rem; opacity: 0.8;">Ticket ID: #' + escapeHtml(ticket.id.slice(0, 8)) + '</span>';
        html += '</div>';
        html += '</div>';
      }

      // Section 4: Recent Orders & Tracking
      html += '<div class="dossier-section">';
      html += '<h3>📦 Order History (' + orders.length + ')</h3>';
      if (orders.length === 0) {
        html += '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 8px 0;">No past orders recorded in store system.</div>';
      } else {
        html += orders.slice(0, 3).map(o => {
          const itemsSummary = (o.items || []).map(i => escapeHtml(i.productName + ' (' + i.quantity + 'x)')).join(', ');
          return '<div class="order-card">' +
            '<div class="order-header">' +
              '<span>#' + escapeHtml(o.orderNumber) + '</span>' +
              '<span class="badge badge-active" style="text-transform: capitalize;">' + escapeHtml(o.status) + '</span>' +
            '</div>' +
            '<div style="font-weight: 500; color: var(--accent);">₹' + escapeHtml(o.totalAmount) + '</div>' +
            '<div class="items-list">' + itemsSummary + '</div>' +
          '</div>';
        }).join('');
      }
      html += '</div>';

      // Section 5: Delivery / Landmark Intelligence (NDR)
      if (ndrList && ndrList.length > 0) {
        html += '<div class="dossier-section">';
        html += '<h3>📍 Delivery Instructions</h3>';
        html += ndrList.map(n => 
          '<div class="ndr-box" style="margin-bottom: 6px;">' +
            '<div>' + escapeHtml(n.instructions) + '</div>' +
            '<div style="font-size: 0.68rem; margin-top: 4px; opacity: 0.8;">Forwarded to courier partner</div>' +
          '</div>'
        ).join('');
        html += '</div>';
      }

      container.innerHTML = html;

      // Bind note saving button
      const saveBtn = document.getElementById('btn-save-note');
      if (saveBtn) {
        saveBtn.addEventListener('click', saveInternalNote);
      }
    }

    async function sendReply() {
      const input = document.getElementById('reply-input');
      const text = input.value.trim();
      if (!text || !currentConversationId) return;

      const btn = document.getElementById('btn-send-reply');
      const indicator = document.getElementById('typing-indicator');
      btn.disabled = true;
      indicator.style.display = 'inline';

      try {
        const res = await fetch('/api/support/conversations/' + currentConversationId + '/reply', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ message: text, agentName: 'Customer Support Desk' }),
        });
        if (await handleAuthChallenge(res)) return;
        
        if (res.ok) {
          input.value = '';
          // Refresh conversation messages instantly
          await selectConversation(currentConversationId);
          await loadConversations();
        } else {
          alert('Failed to send WhatsApp message. Please check connection.');
        }
      } catch (err) {
        console.error('Reply error', err);
        alert('Network error sending message.');
      } finally {
        btn.disabled = false;
        indicator.style.display = 'none';
      }
    }

    function handleInputKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendReply();
      }
    }

    async function toggleBotStatus() {
      if (!currentConversationId || !currentConversation) return;

      const newStatus = currentConversation.status === 'escalated' ? 'active' : 'escalated';
      const promptMsg = newStatus === 'escalated' 
        ? 'Pause automated AI responses for this customer so you can chat directly as a human agent?'
        : 'Resume automated AI concierge for this customer?';

      if (!confirm(promptMsg)) return;

      try {
        const res = await fetch('/api/support/conversations/' + currentConversationId + '/status', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ status: newStatus }),
        });
        if (await handleAuthChallenge(res)) return;
        if (res.ok) {
          currentConversation.status = newStatus;
          updateHeaderStatus();
          await loadConversations();
        }
      } catch (err) {
        console.error('Error toggling bot status', err);
      }
    }

    async function resolveCurrentTicket() {
      if (!currentTicket) return;
      if (!confirm('Mark escalation ticket as resolved and re-enable AI bot for this customer?')) return;

      try {
        const res = await fetch('/api/support/tickets/' + currentTicket.id + '/resolve', {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        if (await handleAuthChallenge(res)) return;
        if (res.ok) {
          currentTicket = null;
          if (currentConversation) currentConversation.status = 'active';
          updateHeaderStatus();
          await selectConversation(currentConversationId);
          await loadConversations();
        }
      } catch (err) {
        console.error('Resolve error', err);
      }
    }

    async function refreshCurrentView() {
      await loadConversations();
      if (currentConversationId) {
        await selectConversation(currentConversationId);
      }
    }

    function exportChatTranscript() {
      if (!currentConversation || !currentMessagesList || currentMessagesList.length === 0) {
        alert('No messages in this conversation to export.');
        return;
      }

      let transcript = '========================================\n';
      transcript += '${brandName} WhatsApp Support Transcript\n';
      transcript += 'Customer: ' + (currentConversation.customerName || 'Customer') + ' (+' + currentConversation.phoneNumber + ')\n';
      transcript += 'Status: ' + (currentConversation.status || 'unknown') + '\n';
      transcript += 'Conversation ID: ' + currentConversation.id + '\n';
      transcript += 'Exported: ' + new Date().toLocaleString() + '\n';
      transcript += '========================================\n\n';

      for (const m of currentMessagesList) {
        const time = new Date(m.createdAt).toLocaleString();
        let sender = 'Customer';
        if (m.role === 'assistant') sender = 'Mintara AI Concierge';
        else if (m.role === 'human_agent') sender = 'Human Agent';
        transcript += '[' + time + '] ' + sender + ':\n' + m.content + '\n\n';
      }

      const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chat_' + currentConversation.phoneNumber + '_' + Date.now() + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    async function saveInternalNote() {
      if (!currentConversationId) return;
      const noteInput = document.getElementById('internal-note-input');
      const noteText = noteInput ? noteInput.value.trim() : '';
      const saveBtn = document.getElementById('btn-save-note');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Saving...';
      }

      try {
        const res = await fetch('/api/support/conversations/' + currentConversationId + '/notes', {
          method: 'PATCH',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ note: noteText }),
        });
        if (await handleAuthChallenge(res)) return;
        if (res.ok) {
          if (saveBtn) saveBtn.innerText = '✅ Saved!';
          if (currentConversation) {
            currentConversation.metadata = currentConversation.metadata || {};
            currentConversation.metadata.internalNote = noteText;
          }
          setTimeout(() => {
            if (saveBtn) {
              saveBtn.disabled = false;
              saveBtn.innerText = '💾 Save Internal Note';
            }
          }, 1500);
        } else {
          alert('Failed saving note.');
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = '💾 Save Internal Note';
          }
        }
      } catch (err) {
        alert('Network error saving note.');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = '💾 Save Internal Note';
        }
      }
    }

    // Event listeners binding for CSP Level 3 environments
    function initEventListeners() {
      const bind = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.bound) {
          el.dataset.bound = 'true';
          el.addEventListener(event, handler);
        }
      };

      bind('btn-admin-key', 'click', () => openKeyModal());
      bind('btn-refresh-view', 'click', () => refreshCurrentView());
      bind('btn-toggle-bot', 'click', () => toggleBotStatus());
      bind('btn-resolve-ticket', 'click', () => resolveCurrentTicket());
      bind('btn-export-chat', 'click', () => exportChatTranscript());
      bind('btn-send-reply', 'click', () => sendReply());
      bind('btn-toggle-pwd', 'click', () => togglePasswordVisibility());
      bind('btn-close-key-modal', 'click', () => closeKeyModal());
      bind('btn-save-key', 'click', () => saveAdminKey());

      bind('search-input', 'input', (e) => handleSearch(e.target.value));
      bind('reply-input', 'keydown', (e) => handleInputKey(e));
      bind('auth-key-input', 'keydown', (e) => {
        if (e.key === 'Enter') saveAdminKey();
      });

      bind('tab-all', 'click', () => setFilter('all'));
      bind('tab-attention', 'click', () => setFilter('escalated'));
      bind('tab-active', 'click', () => setFilter('active'));
      bind('tab-resolved', 'click', () => setFilter('resolved'));

      bind('btn-open-new-chat', 'click', () => openNewChatModal());
      bind('btn-close-new-chat-modal', 'click', () => closeNewChatModal());
      bind('btn-submit-new-chat', 'click', () => startNewChat());
      bind('new-chat-phone', 'keydown', (e) => {
        if (e.key === 'Enter') startNewChat();
      });

      bind('btn-back-to-inbox', 'click', () => {
        const layout = document.getElementById('main-layout');
        if (layout) {
          layout.classList.remove('view-chat', 'view-dossier');
        }
      });

      bind('btn-toggle-dossier', 'click', () => {
        const layout = document.getElementById('main-layout');
        const dossierPanel = document.getElementById('dossier-panel');
        if (window.innerWidth < 768) {
          if (layout) {
            layout.classList.remove('view-chat');
            layout.classList.add('view-dossier');
          }
        } else {
          if (dossierPanel) {
            dossierPanel.classList.toggle('drawer-open');
          }
        }
      });

      bind('btn-back-to-chat', 'click', () => {
        const layout = document.getElementById('main-layout');
        const dossierPanel = document.getElementById('dossier-panel');
        if (window.innerWidth < 768) {
          if (layout) {
            layout.classList.remove('view-dossier');
            layout.classList.add('view-chat');
          }
        } else {
          if (dossierPanel) {
            dossierPanel.classList.remove('drawer-open');
          }
        }
      });

      document.querySelectorAll('.btn-quick-reply').forEach(btn => {
        if (!btn.dataset.bound) {
          btn.dataset.bound = 'true';
          btn.addEventListener('click', () => {
            const textarea = document.getElementById('reply-input');
            if (textarea && btn.dataset.text) {
              textarea.value = btn.dataset.text;
              textarea.focus();
            }
          });
        }
      });

      const convContainer = document.getElementById('conversations-container');
      if (convContainer && !convContainer.dataset.bound) {
        convContainer.dataset.bound = 'true';
        convContainer.addEventListener('click', (e) => {
          const card = e.target.closest('.conv-card');
          if (card && card.dataset.id) {
            selectConversation(card.dataset.id);
            return;
          }
          const authBtn = e.target.closest('#btn-auth-unlock');
          if (authBtn) {
            openKeyModal();
            return;
          }
        });
      }

      const authModal = document.getElementById('auth-modal');
      if (authModal && !authModal.dataset.bound) {
        authModal.dataset.bound = 'true';
        authModal.addEventListener('click', (e) => {
          if (e.target === authModal) closeKeyModal();
        });
      }

      const newChatModal = document.getElementById('new-chat-modal');
      if (newChatModal && !newChatModal.dataset.bound) {
        newChatModal.dataset.bound = 'true';
        newChatModal.addEventListener('click', (e) => {
          if (e.target === newChatModal) closeNewChatModal();
        });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initEventListeners);
    } else {
      initEventListeners();
    }

    // Initial boot
    loadConversations();

    // Background auto-refresh polling every 4 seconds
    pollInterval = setInterval(async () => {
      if (isAuthModalOpen || authFailed) return;
      await loadConversations();
      if (currentConversationId) {
        try {
          const res = await fetch('/api/support/conversations/' + currentConversationId, {
            headers: getAuthHeaders(),
          });
          if (res.ok) {
            const data = await res.json();
            renderMessages(data.messages || []);
          }
        } catch {
          // Non-fatal background poll error
        }
      }
    }, 4000);
  </script>
</body>
</html>`;
}
