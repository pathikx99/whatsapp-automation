export function renderSupportDashboardHtml(brandName = 'D2C Store'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName} - Live Agent Escalation Desk</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #22c55e;
      --accent-hover: #16a34a;
      --danger: #ef4444;
      --warning: #f59e0b;
      --info: #3b82f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    header { background: var(--card-bg); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-size: 1.15rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
    .badge-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-open { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-resolved { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
    .main-layout { display: grid; grid-template-columns: 320px 1fr 340px; flex: 1; overflow: hidden; }
    
    /* Left Panel: Tickets */
    .tickets-panel { border-right: 1px solid var(--border); background: var(--card-bg); display: flex; flex-direction: column; height: 100%; }
    .panel-header { padding: 14px; border-bottom: 1px solid var(--border); font-size: 0.9rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
    .ticket-list { overflow-y: auto; flex: 1; }
    .ticket-card { padding: 14px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
    .ticket-card:hover { background: rgba(255, 255, 255, 0.03); }
    .ticket-card.active { background: rgba(59, 130, 246, 0.1); border-left: 3px solid var(--info); }
    .ticket-card .title { font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; display: flex; justify-content: space-between; }
    .ticket-card .meta { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 6px; }
    .ticket-card .reason { font-size: 0.8rem; color: #fbbf24; background: rgba(245, 158, 11, 0.1); padding: 4px 6px; border-radius: 4px; word-break: break-word; }

    /* Center Panel: Chat */
    .chat-panel { display: flex; flex-direction: column; height: 100%; background: #0b1120; }
    .chat-header { padding: 14px 20px; border-bottom: 1px solid var(--border); background: var(--card-bg); display: flex; justify-content: space-between; align-items: center; }
    .chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .message-bubble { max-width: 75%; padding: 10px 14px; border-radius: 12px; font-size: 0.9rem; line-height: 1.4; word-break: break-word; }
    .msg-user { align-self: flex-start; background: #1e293b; color: #f1f5f9; border: 1px solid var(--border); border-bottom-left-radius: 2px; }
    .msg-bot { align-self: flex-end; background: #1e3a8a; color: #bfdbfe; border-bottom-right-radius: 2px; }
    .msg-human { align-self: flex-end; background: #065f46; color: #a7f3d0; border-bottom-right-radius: 2px; }
    .msg-meta { font-size: 0.7rem; opacity: 0.7; margin-top: 4px; text-align: right; }
    .chat-input-area { padding: 16px; border-top: 1px solid var(--border); background: var(--card-bg); display: flex; gap: 10px; align-items: flex-end; }
    .chat-textarea { flex: 1; background: #0f172a; border: 1px solid var(--border); border-radius: 8px; color: #fff; padding: 10px; font-size: 0.9rem; resize: none; min-height: 48px; max-height: 120px; outline: none; }
    .chat-textarea:focus { border-color: var(--accent); }
    .btn { padding: 8px 16px; border-radius: 6px; font-weight: 500; font-size: 0.85rem; cursor: pointer; border: none; transition: opacity 0.15s; }
    .btn:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary { background: var(--accent); color: #000; font-weight: 600; }
    .btn-resolve { background: #334155; color: #e2e8f0; border: 1px solid #475569; }
    .btn-resolve:hover { background: var(--info); color: #fff; }

    /* Right Panel: Dossier */
    .dossier-panel { border-left: 1px solid var(--border); background: var(--card-bg); display: flex; flex-direction: column; overflow-y: auto; padding: 16px; }
    .dossier-section { margin-bottom: 20px; }
    .dossier-section h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 4px; }
    .dossier-row { display: flex; justify-content: space-between; font-size: 0.85rem; padding: 4px 0; }
    .dossier-row .label { color: var(--text-muted); }
    .dossier-row .value { font-weight: 500; }
    .order-card { background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; padding: 10px; margin-top: 8px; font-size: 0.85rem; }
    .order-card .order-header { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 4px; }
    .order-card .items-list { font-size: 0.8rem; color: var(--text-muted); }

    .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 20px; }
  </style>
</head>
<body>
  <header>
    <h1>
      <span>⚡</span> ${brandName} Live Agent Support Desk
      <span class="badge badge-success">Zero Meta OTP Friction</span>
    </h1>
    <div style="display: flex; gap: 10px; align-items: center;">
      <span id="sync-status" class="badge badge-success">Connected</span>
      <button class="btn btn-resolve" onclick="loadTickets()">🔄 Refresh</button>
    </div>
  </header>

  <div class="main-layout">
    <!-- Left: Tickets List -->
    <div class="tickets-panel">
      <div class="panel-header">
        <span>Escalation Tickets</span>
        <span id="ticket-count" class="badge badge-open">0 Open</span>
      </div>
      <div id="tickets-container" class="ticket-list">
        <div class="empty-state">Loading tickets...</div>
      </div>
    </div>

    <!-- Center: Chat Window -->
    <div class="chat-panel">
      <div id="chat-header" class="chat-header" style="display: none;">
        <div>
          <div id="active-customer-name" style="font-weight: 600; font-size: 1rem;">Customer Name</div>
          <div id="active-customer-phone" style="font-size: 0.8rem; color: var(--text-muted);">+91...</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="btn-resolve-ticket" class="btn btn-resolve" onclick="resolveCurrentTicket()">
            ✅ Resolve & Re-enable AI
          </button>
        </div>
      </div>

      <div id="messages-container" class="chat-messages">
        <div class="empty-state">Select an escalation ticket from the left panel to begin.</div>
      </div>

      <div id="chat-input-area" class="chat-input-area" style="display: none;">
        <textarea id="reply-input" class="chat-textarea" placeholder="Type WhatsApp reply to customer... (Press Enter to send)" onkeydown="handleInputKey(event)"></textarea>
        <button id="btn-send-reply" class="btn btn-primary" onclick="sendReply()">Send WhatsApp</button>
      </div>
    </div>

    <!-- Right: Customer Dossier -->
    <div class="dossier-panel">
      <div id="dossier-container">
        <div class="empty-state">Customer Supabase context will appear here.</div>
      </div>
    </div>
  </div>

  <script>
    let currentTicketId = null;
    let currentConversationId = null;
    let tickets = [];

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
        const key = prompt('Admin authentication required. Enter your admin key:');
        if (key) {
          localStorage.setItem('d2c_admin_key', key.trim());
          await loadTickets();
          return true;
        }
      }
      return false;
    }

    async function loadTickets() {
      try {
        const res = await fetch('/api/support/tickets', {
          headers: getAuthHeaders(),
        });
        if (await handleAuthChallenge(res)) return;
        const data = await res.json();
        tickets = data.tickets || [];
        renderTicketsList();
      } catch (err) {
        console.error('Failed loading tickets', err);
      }
    }

    function renderTicketsList() {
      const container = document.getElementById('tickets-container');
      const openCount = tickets.filter(t => t.status === 'open').length;
      document.getElementById('ticket-count').innerText = openCount + ' Open';

      if (tickets.length === 0) {
        container.innerHTML = '<div class="empty-state">No open escalation tickets. All customers satisfied! 🎉</div>';
        return;
      }

      container.innerHTML = tickets.map(t => {
        const isActive = t.id === currentTicketId ? 'active' : '';
        const statusBadge = t.status === 'resolved' 
          ? '<span class="badge badge-resolved">Resolved</span>' 
          : '<span class="badge badge-open">Open</span>';
        const dateStr = new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return '<div class="ticket-card ' + isActive + '" onclick="selectTicket(\\'' + escapeHtml(t.id) + '\\')">' +
          '<div class="title"><span>' + escapeHtml(t.customerName || t.phoneNumber) + '</span>' + statusBadge + '</div>' +
          '<div class="meta">' + escapeHtml(t.phoneNumber) + ' • ' + escapeHtml(dateStr) + '</div>' +
          '<div class="reason">⚠️ ' + escapeHtml(t.reason || 'Escalation') + '</div>' +
        '</div>';
      }).join('');
    }

    async function selectTicket(ticketId) {
      currentTicketId = ticketId;
      renderTicketsList();
      document.getElementById('chat-header').style.display = 'flex';
      document.getElementById('chat-input-area').style.display = 'flex';

      try {
        const res = await fetch('/api/support/tickets/' + ticketId, {
          headers: getAuthHeaders(),
        });
        if (await handleAuthChallenge(res)) return;
        const data = await res.json();
        const ticket = data.ticket;
        currentConversationId = ticket.conversationId;

        document.getElementById('active-customer-name').innerText = ticket.customerName || 'Customer';
        document.getElementById('active-customer-phone').innerText = ticket.phoneNumber + ' • Ticket #' + ticket.id.slice(0, 8);

        // Render messages safely with HTML entity escaping (Stored XSS Prevention)
        const msgsContainer = document.getElementById('messages-container');
        const messages = data.messages || [];
        if (messages.length === 0) {
          msgsContainer.innerHTML = '<div class="empty-state">No messages in transcript yet.</div>';
        } else {
          msgsContainer.innerHTML = messages.map(m => {
            let roleClass = 'msg-user';
            let roleName = 'Customer';
            if (m.role === 'assistant' || m.sender === 'assistant') {
              roleClass = 'msg-bot';
              roleName = 'AI Concierge';
            } else if (m.role === 'human_agent' || m.sender === 'human_agent') {
              roleClass = 'msg-human';
              roleName = 'Agent';
            }
            const timeStr = new Date(m.createdAt || m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return '<div class="message-bubble ' + roleClass + '">' +
              '<div style="font-size: 0.75rem; font-weight: 600; margin-bottom: 2px;">' + roleName + '</div>' +
              '<div>' + escapeHtml(m.body || m.content) + '</div>' +
              '<div class="msg-meta">' + escapeHtml(timeStr) + '</div>' +
            '</div>';
          }).join('');
          msgsContainer.scrollTop = msgsContainer.scrollHeight;
        }

        // Render customer Supabase dossier safely
        renderDossier(data.customerDossier, ticket);
      } catch (err) {
        console.error('Error fetching ticket details', err);
      }
    }

    function renderDossier(dossier, ticket) {
      const container = document.getElementById('dossier-container');
      const cust = dossier?.customer;
      const orders = dossier?.orders || [];

      let html = '<div class="dossier-section">' +
        '<h3>Customer Intelligence</h3>' +
        '<div class="dossier-row"><span class="label">Name:</span><span class="value">' + escapeHtml(cust?.firstName || ticket.customerName || 'Unknown') + '</span></div>' +
        '<div class="dossier-row"><span class="label">Phone:</span><span class="value">' + escapeHtml(ticket.phoneNumber) + '</span></div>' +
        '<div class="dossier-row"><span class="label">Orders Placed:</span><span class="value">' + (cust?.totalOrders ?? orders.length) + '</span></div>' +
        '<div class="dossier-row"><span class="label">Total LTV:</span><span class="value">₹' + (cust?.totalSpend ?? orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0)) + '</span></div>' +
      '</div>';

      html += '<div class="dossier-section">' +
        '<h3>Order History (' + orders.length + ')</h3>';

      if (orders.length === 0) {
        html += '<div style="font-size: 0.8rem; color: var(--text-muted);">No recorded past orders.</div>';
      } else {
        html += orders.slice(0, 5).map(o => {
          const itemsSummary = (o.items || []).map(i => i.quantity + 'x ' + escapeHtml(i.productName)).join(', ') || 'Items';
          return '<div class="order-card">' +
            '<div class="order-header"><span>#' + escapeHtml(o.orderNumber || o.id.slice(0, 8)) + '</span><span>₹' + o.totalAmount + '</span></div>' +
            '<div style="font-size: 0.75rem; color: #4ade80; margin-bottom: 4px;">Status: ' + escapeHtml(o.status) + '</div>' +
            '<div class="items-list">' + itemsSummary + '</div>' +
          '</div>';
        }).join('');
      }
      html += '</div>';

      container.innerHTML = html;
    }

    async function sendReply() {
      const input = document.getElementById('reply-input');
      const text = input.value.trim();
      if (!text || !currentConversationId) return;

      const btn = document.getElementById('btn-send-reply');
      btn.disabled = true;

      try {
        const res = await fetch('/api/support/conversations/' + currentConversationId + '/reply', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ message: text, agentName: 'Support Desk' })
        });
        if (await handleAuthChallenge(res)) return;
        if (res.ok) {
          input.value = '';
          await selectTicket(currentTicketId);
        } else {
          alert('Failed to send reply. Please check connection.');
        }
      } catch (err) {
        console.error('Reply error', err);
        alert('Network error sending message.');
      } finally {
        btn.disabled = false;
      }
    }

    function handleInputKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendReply();
      }
    }

    async function resolveCurrentTicket() {
      if (!currentTicketId) return;
      if (!confirm('Mark ticket as resolved and re-enable AI bot for this customer?')) return;

      try {
        const res = await fetch('/api/support/tickets/' + currentTicketId + '/resolve', {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        if (await handleAuthChallenge(res)) return;
        if (res.ok) {
          alert('Ticket resolved! AI Concierge un-muted.');
          await loadTickets();
          if (currentTicketId) await selectTicket(currentTicketId);
        }
      } catch (err) {
        console.error('Resolve error', err);
      }
    }

    // Initial load and periodic refresh every 10s
    loadTickets();
    setInterval(loadTickets, 10000);
  </script>
</body>
</html>`;
}
