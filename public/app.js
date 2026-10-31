const API = ''; // same-origin: UI is served by the API server, so fetches use relative /api/...
const views = {
  dashboard: document.getElementById('view-dashboard'),
  approvals: document.getElementById('view-approvals'),
  chat: document.getElementById('view-chat'),
  decisions: document.getElementById('view-decisions'),
};

let gridInstances = {};

function parseStoredTime(s) {
  if (!s) return new Date(NaN);
  if (typeof s === "string" && s.length === 19 && s.charAt(10) === " ") {
    return new Date(s.replace(" ", "T") + "Z");
  }
  return new Date(s);
}


function show(view) {
  Object.entries(views).forEach(([k, v]) => v.classList.toggle('hidden', k !== view));
  document.querySelectorAll('.links a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  
  if (view === 'dashboard') loadDashboard();
  if (view === 'approvals') loadApprovalsGrid();
  if (view === 'chat') loadChat();
  if (view === 'decisions') loadDecisionsGrid();
}

window.addEventListener('hashchange', () => {
  const h = location.hash.replace('#/', '') || 'dashboard';
  show(h);
});
show(location.hash.replace('#/', '') || 'dashboard');

// ==================== DASHBOARD ====================
async function loadDashboard() {
  views.dashboard.innerHTML = `
    <div class="monitor">
      <div class="sys-strip" id="sysStrip"></div>
      <div class="monitor-body">
        <div class="stream-wrap">
          <h2>DECISION STREAM</h2>
          <div id="stream" class="stream"></div>
        </div>
        <div class="command-wrap">
          <h3>COMMAND INPUT</h3>
          <div class="chat-box">
            <div class="chat-messages" id="streamMsgs"></div>
            <div class="chat-input">
              <input id="cmdInput" placeholder="e.g. pay the plumber $200">
              <button class="btn" id="cmdSend">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  loadSysStrip();
  startStream();
  setupCommandInput();
}

let streamInterval;
async function startStream() {
  if (streamInterval) clearInterval(streamInterval);
  const render = async () => {
    const rows = await fetch('/api/decisions').then(r => r.json()).catch(() => []);
    const el = document.getElementById('stream');
    if (!el) return;
    el.innerHTML = rows.slice(0, 50).map(r => `
      <div class="stream-card">
        <div class="sc-head">
          <span class="sc-mod">${r.module}</span>
          <span class="sc-time">${parseStoredTime(r.created_at).toLocaleString()}</span>
        </div>
        <div class="sc-action">${r.action_type} → ${r.decision}</div>
        <div class="sc-conf">confidence <b>${(r.confidence * 100).toFixed(1)}%</b> / threshold ${(r.threshold * 100).toFixed(0)}%</div>
        <div class="sc-bar"><div style="width:${Math.min(100, r.confidence * 100)}%"></div></div>
        <div class="sc-narr">${r.narration || ''}</div>
        <div class="sc-out">${r.outcome ? 'Outcome: ' + r.outcome : 'pending'}</div>
      </div>`).join('');
  };
  render();
  streamInterval = setInterval(render, 2000);
}

async function loadSysStrip() {
  const [pend, pp] = await Promise.all([
    fetch('/api/guard/pending').then(r => r.json()).catch(() => []),
    fetch('/api/paypal/status').then(r => r.json()).catch(() => ({ healthy: true }))
  ]);
  const decs = await fetch('/api/decisions').then(r => r.json()).catch(() => []);
  const hitRate = decs.length ? (decs.filter(d => d.outcome).length / decs.length * 100).toFixed(0) : 0;
  const el = document.getElementById('sysStrip');
  if (!el) return;
  el.innerHTML = `
    <div class="sys-item">THRESHOLD: guard 70%</div>
    <div class="sys-item">HIT RATE: ${hitRate}%</div>
    <div class="sys-item">PAYPAL: ${pp.healthy ? 'SANDBOX OK' : 'DRY'}</div>
    <div class="sys-item">LLM: nvidia/nemotron-3.5-lightning-30b-a3b</div>
    <div class="sys-item">PENDING: ${pend.length}</div>
  `;
}

function setupCommandInput() {
  const input = document.getElementById('cmdInput');
  const sendBtn = document.getElementById('cmdSend');
  const msgs = document.getElementById('streamMsgs');
  if (!input) return;
  const add = (who, text) => { const d = document.createElement('div'); d.className = 'msg ' + (who === 'user' ? 'user' : 'ai'); d.textContent = text; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; };
  const send = async () => {
    const text = input.value.trim(); if (!text) return;
    add('user', text); input.value = '';
    const res = await fetch('/api/chat/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) }).then(r => r.json());
    add('ai', res.reply);
  };
  sendBtn.onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
}

// ==================== AG GRID HELPERS ====================
function createGrid(containerId, columnDefs, rowData, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  
  // Destroy existing grid if any
  if (gridInstances[containerId]) {
    gridInstances[containerId].destroy();
  }
  
  const gridOptions = {
    columnDefs,
    rowData,
    defaultColDef: {
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 100,
      ...options.defaultColDef,
    },
    pagination: true,
    paginationPageSize: 20,
    paginationPageSizeSelector: [10, 20, 50, 100],
    animateRows: true,
    rowSelection: 'multiple',
    suppressRowClickSelection: true,
    ...options,
  };
  
  const grid = typeof agGrid.createGrid === "function" ? agGrid.createGrid(container, gridOptions) : new agGrid.Grid(container, gridOptions);
  gridInstances[containerId] = grid;
  return grid;
}

function destroyGrid(containerId) {
  if (gridInstances[containerId]) {
    gridInstances[containerId].destroy();
    delete gridInstances[containerId];
  }
}

async function loadApprovalsGrid() {
  views.approvals.innerHTML = `
    <div class="grid-toolbar">
      <h2>Pending Approvals</h2>
      <button class="btn secondary" onclick="loadApprovalsGrid()">Refresh</button>
    </div>
    <div id="approvalsGrid" class="ag-theme-quartz" style="height: 600px; width: 100%;"></div>
  `;
  
  const rows = await fetch('/api/guard/pending').then(r => r.json()).catch(() => []);
  
  const columnDefs = [
    { headerName: 'ID', field: 'id', width: 100, cellRenderer: params => `<a href="#/approvals/${params.value}">${params.value.slice(0,8)}...</a>` },
    { headerName: 'Vendor', field: 'vendor_name', minWidth: 150 },
    { headerName: 'Amount', field: 'amount_cents', valueFormatter: params => '$' + (params.value / 100).toFixed(2), width: 120 },
    { headerName: 'Confidence', field: 'confidence', valueFormatter: params => (params.value * 100).toFixed(1) + '%', width: 120,
      cellStyle: params => ({ color: params.value >= 0.7 ? '#00aa00' : params.value >= 0.5 ? '#ff8800' : '#ff4444' }) },
    { headerName: 'Narration', field: 'notes', minWidth: 200, flex: 1 },
    {
      headerName: 'Actions',
      cellRenderer: params => `
        <button class="btn btn-sm" onclick="approvePayout('${params.data.id}', '${params.data.receiver || ''}')">Approve</button>
        <button class="btn btn-sm secondary" onclick="rejectPayout('${params.data.id}')">Reject</button>
      `,
      width: 200,
    },
  ];
  
  createGrid('approvalsGrid', columnDefs, rows);
}

window.approvePayout = async (id, receiver) => {
  if (!receiver) {
    receiver = prompt('PayPal email for this payout? No payment will move without a real receiver.');
    if (!receiver) { alert('Cancelled: no receiver supplied, no payment sent.'); return; }
  }
  const res = await fetch('/api/guard/approve/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiver: receiver }) }).then(r => r.json());
  alert(res.batchId ? 'Payout approved! Batch: ' + res.batchId : 'Error: ' + (res.message || res.error));
  loadApprovalsGrid();
}

window.rejectPayout = async (id) => {
  await fetch(`/api/guard/reject/${id}`, { method: 'POST' });
  loadApprovalsGrid();
};

// ==================== CHAT ====================
function loadChat() {
  if (views.chat.dataset.loaded) return;
  views.chat.innerHTML = `<h2>Conversational Money Movement</h2>
  <div class="chat-box">
    <div class="chat-messages" id="chatMsgs"></div>
    <div class="chat-input"><input id="chatInput" placeholder="e.g. pay the plumber $200"><button class="btn" id="chatSend">Send</button></div>
  </div>`;
  views.chat.dataset.loaded = '1';
  const msgs = document.getElementById('chatMsgs');
  const add = (who, text) => { const d = document.createElement('div'); d.className = 'msg ' + (who === 'user' ? 'user' : 'ai'); d.textContent = text; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; };
  const sendChat = async () => {
    const input = document.getElementById('chatInput');
    const text = input.value.trim(); if (!text) return;
    add('user', text); input.value = '';
    const res = await fetch('/api/chat/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) }).then(r => r.json());
    add('ai', res.reply);
    if (res.requiresApproval && res.pendingId) {
      let receiver = res.receiver || null;
      if (!receiver) {
        receiver = prompt('PayPal email for ' + (res.vendor || 'this vendor') + '? No payment will move without a real receiver.');
        if (!receiver) { add('ai', 'Cancelled: no receiver supplied, no payment sent.'); return; }
      }
      if (confirm('Confirm payout of $' + (res.amount_cents / 100).toFixed(2) + ' to ' + receiver + '?')) {
        const conf = await fetch('/api/chat/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pendingId: res.pendingId, receiver }) }).then(r => r.json());
        add('ai', conf.autoApproved ? ('Payout sent, batch ' + (conf.batchId || '')) : ('Not sent: ' + (conf.error || conf.message || 'approval failed')));
      }
    }
  };
  document.getElementById('chatSend').onclick = sendChat;
  document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
}

// ==================== DECISIONS GRID ====================
async function loadDecisionsGrid() {
  views.decisions.innerHTML = `
    <div class="grid-toolbar">
      <h2>Decision Log</h2>
      <button class="btn secondary" onclick="loadDecisionsGrid()">Refresh</button>
    </div>
    <div id="decisionsGrid" class="ag-theme-quartz" style="height: 600px; width: 100%;"></div>
  `;
  
  const rows = await fetch('/api/decisions').then(r => r.json()).catch(() => []);
  
  const columnDefs = [
    { headerName: 'Time', field: 'created_at', valueFormatter: params => parseStoredTime(params.value).toLocaleString(), width: 180 },
    { headerName: 'Module', field: 'module', width: 120 },
    { headerName: 'Action', field: 'action_type', width: 120 },
    { headerName: 'Confidence', field: 'confidence', valueFormatter: params => (params.value * 100).toFixed(1) + '%', width: 120 },
    { headerName: 'Threshold', field: 'threshold', valueFormatter: params => (params.value * 100).toFixed(1) + '%', width: 120 },
    { headerName: 'Decision', field: 'decision', cellRenderer: params => `<span class="decision-badge decision-${params.value}">${params.value}</span>`, width: 120 },
    { headerName: 'Outcome', field: 'outcome', valueFormatter: params => params.value || '-', width: 100 },
    { headerName: 'Narration', field: 'narration', minWidth: 200, flex: 1 },
  ];
  
  createGrid('decisionsGrid', columnDefs, rows);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  if (typeof agGrid === 'undefined') {
    console.error('AG Grid not loaded!');
  } else {
    console.log('AG Grid loaded:', agGrid.Grid);
  }
});
