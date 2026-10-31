const API = ''; // same-origin: UI is served by the API server, so fetches use relative /api/...
const views = {
  dashboard: document.getElementById('view-dashboard'),
  receivables: document.getElementById('view-receivables'),
  approvals: document.getElementById('view-approvals'),
  chat: document.getElementById('view-chat'),
  decisions: document.getElementById('view-decisions'),
  invoices: document.getElementById('view-invoices'),
  subscriptions: document.getElementById('view-subscriptions'),
  products: document.getElementById('view-products'),
  mcp: document.getElementById('view-mcp'),
  apimatic: document.getElementById('view-apimatic'),
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
  if (view === 'receivables') loadReceivablesGrid();
  if (view === 'approvals') loadApprovalsGrid();
  if (view === 'chat') loadChat();
  if (view === 'decisions') loadDecisionsGrid();
  if (view === 'invoices') loadInvoicesGrid();
  if (view === 'subscriptions') loadSubscriptionsGrid();
  if (view === 'products') loadProductsGrid();
  if (view === 'mcp') loadMCPView();
  if (view === 'apimatic') loadAPIMaticView();
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
  const [rec, pend, pp] = await Promise.all([
    fetch('/api/receivables').then(r => r.json()).catch(() => []),
    fetch('/api/guard/pending').then(r => r.json()).catch(() => []),
    fetch('/api/paypal/status').then(r => r.json()).catch(() => ({ healthy: true }))
  ]);
  const decs = await fetch('/api/decisions').then(r => r.json()).catch(() => []);
  const hitRate = decs.length ? (decs.filter(d => d.outcome).length / decs.length * 100).toFixed(0) : 0;
  const el = document.getElementById('sysStrip');
  if (!el) return;
  el.innerHTML = `
    <div class="sys-item">THRESHOLDS: receivables 60% • guard 70%</div>
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

// ==================== RECEIVABLES GRID ====================
async function loadReceivablesGrid() {
  views.receivables.innerHTML = `
    <div class="grid-toolbar">
      <h2>Receivables</h2>
      <div class="toolbar-actions">
        <button class="btn" onclick="showCreateReceivableModal()">Create Receivable</button>
        <button class="btn secondary" onclick="loadReceivablesGrid()">Refresh</button>
      </div>
    </div>
    <div id="receivablesGrid" class="ag-theme-quartz" style="height: 600px; width: 100%;"></div>
    
    <!-- Create Receivable Modal -->
    <div id="createReceivableModal" class="modal hidden">
      <div class="modal-content">
        <h3>Create New Receivable</h3>
        <form id="createReceivableForm">
          <div class="form-group">
            <label>Customer Name</label>
            <input type="text" name="customer_name" required>
          </div>
          <div class="form-group">
            <label>Amount ($)</label>
            <input type="number" name="amount" step="0.01" min="0.01" required>
          </div>
          <div class="form-group">
            <label>Currency</label>
            <select name="currency">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div class="form-group">
            <label>Due Date</label>
            <input type="date" name="due_date">
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea name="notes" rows="3"></textarea>
          </div>
          <div class="form-actions">
            <button type="button" class="btn secondary" onclick="hideModal('createReceivableModal')">Cancel</button>
            <button type="submit" class="btn">Create</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  const rec = await fetch('/api/receivables').then(r => r.json()).catch(() => []);
  
  const columnDefs = [
    { headerName: 'ID', field: 'id', width: 100, cellRenderer: params => `<a href="#/receivables/${params.value}">${params.value.slice(0,8)}...</a>` },
    { headerName: 'Customer', field: 'customer_name', minWidth: 150 },
    { headerName: 'Amount', field: 'amount_cents', valueFormatter: params => '$' + (params.value / 100).toFixed(2), width: 120 },
    { headerName: 'Currency', field: 'currency', width: 100 },
    { headerName: 'Due Date', field: 'due_date', width: 130 },
    { headerName: 'Days Overdue', field: 'days_overdue', valueFormatter: params => params.value > 0 ? `<span style="color: #ff4444;">${params.value}</span>` : params.value, width: 130 },
    { headerName: 'Status', field: 'status', cellRenderer: params => `<span class="status-badge status-${params.value}">${params.value}</span>`, width: 100 },
    { headerName: 'PayPal Order', field: 'paypal_order_id', width: 150 },
    {
      headerName: 'Actions',
      cellRenderer: params => `
        <button class="btn btn-sm" onclick="chaseReceivable('${params.data.id}')" ${params.data.days_overdue <= 0 ? 'disabled' : ''}>Chase</button>
        <button class="btn btn-sm secondary" onclick="viewPayPalOrder('${params.data.paypal_order_id}')">View Order</button>
      `,
      width: 200,
    },
  ];
  
  createGrid('receivablesGrid', columnDefs, rec);
  
  // Form handler
  document.getElementById('createReceivableForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      customer_name: formData.get('customer_name'),
      amount: Math.round(parseFloat(formData.get('amount')) * 100),
      currency: formData.get('currency'),
      due_date: formData.get('due_date') || null,
      notes: formData.get('notes') || null,
    };
    try {
      await fetch('/api/receivables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      hideModal('createReceivableModal');
      loadReceivablesGrid();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

window.showCreateReceivableModal = () => document.getElementById('createReceivableModal').classList.remove('hidden');
window.hideModal = (id) => document.getElementById(id).classList.add('hidden');

window.chaseReceivable = async (id) => {
  const res = await fetch(`/api/receivables/${id}/chase`, { method: 'POST' }).then(r => r.json());
  alert(res.chased ? `Chase email sent:\n${res.message}` : `No action: ${res.reason}`);
  loadReceivablesGrid();
};

window.viewPayPalOrder = (orderId) => {
  if (orderId) window.open(`https://sandbox.paypal.com/orders/${orderId}`, '_blank');
};

// ==================== APPROVALS GRID ====================
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

// ==================== INVOICES GRID ====================
async function loadInvoicesGrid() {
  views.invoices.innerHTML = `
    <div class="grid-toolbar">
      <h2>Invoices</h2>
      <div class="toolbar-actions">
        <button class="btn" onclick="showCreateInvoiceModal()">Create Invoice</button>
        <button class="btn secondary" onclick="loadInvoicesGrid()">Refresh</button>
      </div>
    </div>
    <div id="invoicesGrid" class="ag-theme-quartz" style="height: 600px; width: 100%;"></div>
    
    <!-- Create Invoice Modal -->
    <div id="createInvoiceModal" class="modal hidden">
      <div class="modal-content" style="max-width: 700px;">
        <h3>Create & Send Invoice</h3>
        <form id="createInvoiceForm">
          <div class="form-row">
            <div class="form-group">
              <label>Recipient Email</label>
              <input type="email" name="recipientEmail" required>
            </div>
            <div class="form-group">
              <label>Recipient Name</label>
              <input type="text" name="recipientName" required>
            </div>
          </div>
          <div class="form-group">
            <label>Note</label>
            <textarea name="note" rows="2" placeholder="Payment for services rendered"></textarea>
          </div>
          <div class="form-group">
            <label>Due in Days</label>
            <input type="number" name="dueDays" value="30" min="1">
          </div>
          <h4>Line Items</h4>
          <div id="invoiceItemsContainer"></div>
          <button type="button" class="btn secondary" onclick="addInvoiceItem()">+ Add Item</button>
          <div class="form-actions">
            <button type="button" class="btn secondary" onclick="hideModal('createInvoiceModal')">Cancel</button>
            <button type="submit" class="btn">Create & Send</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  const rows = await fetch('/api/invoices').then(r => r.json()).catch(() => []);
  
  const columnDefs = [
    { headerName: 'ID', field: 'id', width: 100 },
    { headerName: 'PayPal ID', field: 'paypal_invoice_id', width: 180 },
    { headerName: 'Recipient', field: 'recipient_name', minWidth: 150 },
    { headerName: 'Email', field: 'recipient_email', minWidth: 200 },
    { headerName: 'Amount', field: 'amount_cents', valueFormatter: params => '$' + (params.value / 100).toFixed(2), width: 120 },
    { headerName: 'Status', field: 'status', cellRenderer: params => `<span class="status-badge status-${params.value}">${params.value}</span>`, width: 100 },
    { headerName: 'Due Date', field: 'due_date', width: 130 },
    {
      headerName: 'Actions',
      cellRenderer: params => `
        <button class="btn btn-sm" onclick="sendInvoice('${params.data.id}')" ${params.data.status !== 'draft' ? 'disabled' : ''}>Send</button>
        <button class="btn btn-sm" onclick="remindInvoice('${params.data.id}')" ${params.data.status !== 'sent' ? 'disabled' : ''}>Remind</button>
        <button class="btn btn-sm" onclick="generateQR('${params.data.id}')" ${params.data.status !== 'sent' ? 'disabled' : ''}>QR Code</button>
        <button class="btn btn-sm secondary" onclick="recordPaymentModal('${params.data.id}')" ${params.data.status === 'paid' ? 'disabled' : ''}>Record Payment</button>
      `,
      width: 350,
    },
  ];
  
  createGrid('invoicesGrid', columnDefs, rows);
  setupInvoiceForm();
}

function setupInvoiceForm() {
  const container = document.getElementById('invoiceItemsContainer');
  window.addInvoiceItem = () => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'invoice-item';
    itemDiv.innerHTML = `
      <input type="text" name="itemName" placeholder="Item name" required style="flex: 2;">
      <input type="text" name="itemDescription" placeholder="Description" style="flex: 2;">
      <input type="number" name="itemQuantity" placeholder="Qty" value="1" min="1" style="width: 80px;">
      <input type="number" name="itemUnitPrice" placeholder="Unit Price ($)" step="0.01" min="0" style="width: 140px;">
      <input type="number" name="itemTaxRate" placeholder="Tax %" value="0" min="0" step="0.01" style="width: 100px;">
      <button type="button" class="btn btn-sm secondary" onclick="this.parentElement.remove()">Remove</button>
    `;
    container.appendChild(itemDiv);
  };
  window.addInvoiceItem(); // Add first item
  
  document.getElementById('createInvoiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const items = [];
    const itemDivs = container.querySelectorAll('.invoice-item');
    itemDivs.forEach(div => {
      items.push({
        name: div.querySelector('[name="itemName"]').value,
        description: div.querySelector('[name="itemDescription"]').value,
        quantity: parseInt(div.querySelector('[name="itemQuantity"]').value),
        unitPrice: Math.round(parseFloat(div.querySelector('[name="itemUnitPrice"]').value) * 100),
        taxRate: parseFloat(div.querySelector('[name="itemTaxRate"]').value) || 0,
      });
    });
    
    const data = {
      recipientEmail: formData.get('recipientEmail'),
      recipientName: formData.get('recipientName'),
      items,
      note: formData.get('note'),
      dueDays: parseInt(formData.get('dueDays')),
    };
    
    try {
      await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      hideModal('createInvoiceModal');
      loadInvoicesGrid();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

window.sendInvoice = async (id) => {
  await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
  loadInvoicesGrid();
};

window.remindInvoice = async (id) => {
  await fetch(`/api/invoices/${id}/remind`, { method: 'POST' });
  loadInvoicesGrid();
};

window.generateQR = async (id) => {
  const result = await fetch(`/api/invoices/${id}/qr-code`, { method: 'POST' }).then(r => r.json());
  if (result?.qr_code?.image_url) {
    window.open(result.qr_code.image_url, '_blank');
  } else {
    alert('QR code generated: ' + JSON.stringify(result));
  }
};

window.recordPaymentModal = (id) => {
  const amount = prompt('Enter payment amount in cents:');
  if (!amount) return;
  fetch(`/api/invoices/${id}/record-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountCents: parseInt(amount) }) })
    .then(() => loadInvoicesGrid());
};

// ==================== SUBSCRIPTIONS GRID ====================
async function loadSubscriptionsGrid() {
  views.subscriptions.innerHTML = `
    <div class="grid-toolbar">
      <h2>Subscriptions</h2>
      <div class="toolbar-actions">
        <button class="btn" onclick="showCreatePlanModal()">Create Plan</button>
        <button class="btn" onclick="showSubscribeModal()">Subscribe Customer</button>
        <button class="btn secondary" onclick="loadSubscriptionsGrid()">Refresh</button>
      </div>
    </div>
    <div id="subscriptionsGrid" class="ag-theme-quartz" style="height: 600px; width: 100%;"></div>
  `;
  
  const rows = await fetch('/api/subscriptions').then(r => r.json()).catch(() => []);
  
  const columnDefs = [
    { headerName: 'ID', field: 'id', width: 100 },
    { headerName: 'PayPal ID', field: 'paypal_subscription_id', width: 180 },
    { headerName: 'Plan ID', field: 'paypal_plan_id', width: 150 },
    { headerName: 'Customer', field: 'customer_name', minWidth: 150 },
    { headerName: 'Email', field: 'customer_email', minWidth: 200 },
    { headerName: 'Amount', field: 'amount_cents', valueFormatter: params => '$' + (params.value / 100).toFixed(2), width: 120 },
    { headerName: 'Cycle', field: 'billing_cycle', width: 100 },
    { headerName: 'Status', field: 'status', cellRenderer: params => `<span class="status-badge status-${params.value}">${params.value}</span>`, width: 100 },
    { headerName: 'Next Billing', field: 'next_billing_date', width: 130 },
    {
      headerName: 'Actions',
      cellRenderer: params => {
        const status = params.data.status;
        return `
          <button class="btn btn-sm" onclick="cancelSubscription('${params.data.id}')" ${status === 'cancelled' ? 'disabled' : ''}>Cancel</button>
          <button class="btn btn-sm" onclick="pauseSubscription('${params.data.id}')" ${status !== 'active' ? 'disabled' : ''}>Pause</button>
          <button class="btn btn-sm" onclick="resumeSubscription('${params.data.id}')" ${status !== 'paused' ? 'disabled' : ''}>Resume</button>
        `;
      },
      width: 250,
    },
  ];
  
  createGrid('subscriptionsGrid', columnDefs, rows);
}

window.showCreatePlanModal = () => {
  const name = prompt('Plan name:');
  if (!name) return;
  const desc = prompt('Description:');
  const price = prompt('Price in cents (e.g. 2999 for $29.99):');
  const cycle = prompt('Billing cycle (MONTH, YEAR, WEEK, DAY):', 'MONTH');
  if (!name || !price || !cycle) return;
  
  fetch('/api/agent/subscription/create-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: desc, priceCents: parseInt(price), billingCycle: cycle }) })
    .then(r => r.json())
    .then(r => { alert(JSON.stringify(r, null, 2)); loadSubscriptionsGrid(); });
};

window.showSubscribeModal = () => {
  const planId = prompt('Plan ID:');
  const email = prompt('Customer email:');
  const name = prompt('Customer name (optional):');
  if (!planId || !email) return;
  
  fetch('/api/agent/subscription/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId, customerEmail: email, customerName: name }) })
    .then(r => r.json())
    .then(r => { alert(JSON.stringify(r, null, 2)); loadSubscriptionsGrid(); });
};

window.cancelSubscription = async (id) => {
  await fetch(`/api/subscriptions/${id}/cancel`, { method: 'POST' });
  loadSubscriptionsGrid();
};

window.pauseSubscription = async (id) => {
  await fetch(`/api/subscriptions/${id}/pause`, { method: 'POST' });
  loadSubscriptionsGrid();
};

window.resumeSubscription = async (id) => {
  await fetch(`/api/subscriptions/${id}/resume`, { method: 'POST' });
  loadSubscriptionsGrid();
};

// ==================== PRODUCTS GRID ====================
async function loadProductsGrid() {
  views.products.innerHTML = `
    <div class="grid-toolbar">
      <h2>Product Catalog</h2>
      <div class="toolbar-actions">
        <input type="text" id="productSearch" placeholder="Search products..." style="width: 250px;">
        <select id="productCategory" style="width: 180px;"><option value="">All Categories</option></select>
        <button class="btn" onclick="searchProducts()">Search</button>
        <button class="btn" onclick="showCreateProductModal()">Add Product</button>
        <button class="btn" onclick="loadProductsGrid()">Refresh</button>
      </div>
    </div>
    <div id="productsGrid" class="ag-theme-quartz" style="height: 600px; width: 100%;"></div>
  `;
  
  const rows = await fetch('/api/products').then(r => r.json()).catch(() => []);
  
  const columnDefs = [
    { headerName: 'ID', field: 'id', width: 100 },
    { headerName: 'PayPal ID', field: 'paypal_product_id', width: 150 },
    { headerName: 'Name', field: 'name', minWidth: 200 },
    { headerName: 'Type', field: 'type', width: 100 },
    { headerName: 'Category', field: 'category', width: 150 },
    { headerName: 'Description', field: 'description', minWidth: 200, flex: 1 },
    {
      headerName: 'Actions',
      cellRenderer: params => `
        <button class="btn btn-sm" onclick="createInvoiceFromProduct('${params.data.id}')">Create Invoice</button>
      `,
      width: 180,
    },
  ];
  
  createGrid('productsGrid', columnDefs, rows);
  
  // Load categories
  const cats = await fetch('/api/products/categories/list').then(r => r.json()).catch(() => ({ categories: [] }));
  const select = document.getElementById('productCategory');
  if (cats.categories) {
    cats.categories.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; select.appendChild(opt); });
  }
  
  document.getElementById('productSearch').addEventListener('keypress', e => { if (e.key === 'Enter') searchProducts(); });
}

window.searchProducts = async () => {
  const q = document.getElementById('productSearch').value;
  const cat = document.getElementById('productCategory').value;
  const rows = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`).then(r => r.json()).catch(() => ({ results: [] }));
  const grid = gridInstances['productsGrid'];
  if (grid && rows.results) {
    grid.api.setGridOption('rowData', rows.results);
  }
};

window.showCreateProductModal = () => {
  const name = prompt('Product name:');
  if (!name) return;
  const desc = prompt('Description:');
  const type = prompt('Type (PHYSICAL, DIGITAL, SERVICE):', 'PHYSICAL');
  const category = prompt('Category:');
  if (!type) return;
  
  fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: desc, type, category }) })
    .then(r => r.json())
    .then(r => { alert(JSON.stringify(r, null, 2)); loadProductsGrid(); });
};

window.createInvoiceFromProduct = (productId) => {
  alert('Feature: Create invoice from product ' + productId + ' - would open invoice modal with product pre-filled');
};

// ==================== MCP VIEW ====================
async function loadMCPView() {
  views.mcp.innerHTML = `
    <div class="grid-toolbar">
      <h2>MCP Integration</h2>
      <div class="toolbar-actions">
        <button class="btn" id="mcpConnectRemote" onclick="connectMCP(true)">Connect Remote MCP</button>
        <button class="btn" id="mcpConnectLocal" onclick="connectMCP(false)">Connect Local MCP</button>
        <button class="btn secondary" id="mcpDisconnect" onclick="disconnectMCP()" disabled>Disconnect</button>
      </div>
    </div>
    <div id="mcpStatus" class="status-panel"></div>
    <div id="mcpToolsGrid" class="ag-theme-quartz" style="height: 400px; width: 100%;"></div>
    <div class="tool-test-panel">
      <h3>Test Tool</h3>
      <select id="mcpToolSelect"></select>
      <textarea id="mcpToolArgs" placeholder="JSON arguments" rows="5" style="width: 100%; font-family: monospace;"></textarea>
      <button class="btn" onclick="callMCPTool()">Call Tool</button>
      <pre id="mcpToolResult" style="background: #1e1e1e; color: #0f0; padding: 10px; max-height: 300px; overflow: auto;"></pre>
    </div>
  `;
  
  const status = await fetch('/api/mcp/status').then(r => r.json()).catch(() => ({ connected: false, tools: [] }));
  updateMCPStatus(status);
  
  document.getElementById('mcpToolSelect').addEventListener('change', e => {
    const toolName = e.target.value;
    const tools = JSON.parse(localStorage.getItem('mcpTools') || '[]');
    const tool = tools.find(t => t.name === toolName);
    if (tool) {
      document.getElementById('mcpToolArgs').value = JSON.stringify(tool.inputSchema?.properties || {}, null, 2);
    }
  });
}

window.connectMCP = async (remote) => {
  const btn = document.getElementById(remote ? 'mcpConnectRemote' : 'mcpConnectLocal');
  btn.disabled = true;
  btn.textContent = 'Connecting...';
  
  const res = await fetch('/api/mcp/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remote }) }).then(r => r.json());
  
  if (res.success) {
    updateMCPStatus(res);
    document.getElementById('mcpDisconnect').disabled = false;
    btn.textContent = 'Connected';
    btn.disabled = true;
    document.getElementById(remote ? 'mcpConnectLocal' : 'mcpConnectRemote').disabled = true;
  } else {
    alert('Failed: ' + res.error);
    btn.disabled = false;
    btn.textContent = remote ? 'Connect Remote MCP' : 'Connect Local MCP';
  }
};

window.disconnectMCP = async () => {
  await fetch('/api/mcp/disconnect', { method: 'POST' });
  updateMCPStatus({ connected: false, tools: [] });
  document.getElementById('mcpDisconnect').disabled = true;
  document.getElementById('mcpConnectRemote').disabled = false;
  document.getElementById('mcpConnectRemote').textContent = 'Connect Remote MCP';
  document.getElementById('mcpConnectLocal').disabled = false;
  document.getElementById('mcpConnectLocal').textContent = 'Connect Local MCP';
};

function updateMCPStatus(status) {
  const panel = document.getElementById('mcpStatus');
  panel.innerHTML = `
    <div class="status-item">Status: <strong>${status.connected ? 'CONNECTED' : 'DISCONNECTED'}</strong></div>
    <div class="status-item">Tools Available: <strong>${status.tools?.length || 0}</strong></div>
  `;
  
  if (status.tools) {
    localStorage.setItem('mcpTools', JSON.stringify(status.tools));
    const select = document.getElementById('mcpToolSelect');
    select.innerHTML = '<option value="">Select tool...</option>';
    status.tools.forEach(t => { const opt = document.createElement('option'); opt.value = t.name; opt.textContent = t.name; select.appendChild(opt); });
    
    const columnDefs = [
      { headerName: 'Tool Name', field: 'name', minWidth: 200 },
      { headerName: 'Description', field: 'description', minWidth: 300, flex: 1 },
    ];
    createGrid('mcpToolsGrid', columnDefs, status.tools);
  }
}

window.callMCPTool = async () => {
  const toolName = document.getElementById('mcpToolSelect').value;
  const argsText = document.getElementById('mcpToolArgs').value;
  if (!toolName) return alert('Select a tool');
  
  let args;
  try { args = JSON.parse(argsText); } catch { return alert('Invalid JSON'); }
  
  const resultEl = document.getElementById('mcpToolResult');
  resultEl.textContent = 'Calling...';
  
  const result = await fetch(`/api/mcp/tools/${toolName}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) }).then(r => r.json());
  resultEl.textContent = JSON.stringify(result, null, 2);
};

// ==================== APIMATIC VIEW ====================
async function loadAPIMaticView() {
  views.apimatic.innerHTML = `
    <div class="grid-toolbar">
      <h2>APIMatic Integration</h2>
      <div class="toolbar-actions">
        <button class="btn" id="apimaticLoad" onclick="loadAPIMaticContext()">Load PayPal API Context</button>
        <button class="btn secondary" onclick="copyAPIMaticContext()">Copy to Clipboard</button>
      </div>
    </div>
    <div id="apimaticStatus" class="status-panel"></div>
    <div class="context-panel">
      <h3>PayPal API Context for LLM</h3>
      <pre id="apimaticContext" style="background: #1e1e1e; color: #0f0; padding: 16px; max-height: 600px; overflow: auto; font-size: 12px; line-height: 1.5;"></pre>
    </div>
    <div class="tool-test-panel">
      <h3>Query-Specific Context</h3>
      <textarea id="apimaticQuery" placeholder="Enter a query to get relevant API context..." rows="3" style="width: 100%;"></textarea>
      <button class="btn" onclick="getQueryContext()">Get Context for Query</button>
      <pre id="apimaticQueryResult" style="background: #1e1e1e; color: #0f0; padding: 16px; max-height: 400px; overflow: auto; margin-top: 12px; font-size: 12px;"></pre>
    </div>
  `;
  
  const status = await fetch('/api/apimatic/status').then(r => r.json()).catch(() => ({ configured: false }));
  const statusEl = document.getElementById('apimaticStatus');
  statusEl.innerHTML = `
    <div class="status-item">Mode: <strong>${status.mode || 'unknown'}</strong></div>
    <div class="status-item">APIMatic Configured: <strong>${status.configured ? 'YES' : 'NO (using built-in fallback)'}</strong></div>
  `;
}

window.loadAPIMaticContext = async () => {
  const btn = document.getElementById('apimaticLoad');
  btn.disabled = true;
  btn.textContent = 'Loading...';
  
  const result = await fetch('/api/apimatic/context').then(r => r.json()).catch(() => ({ context: 'Error loading context' }));
  
  document.getElementById('apimaticContext').textContent = result.context || 'No context available';
  btn.disabled = false;
  btn.textContent = 'Load PayPal API Context';
};

window.copyAPIMaticContext = () => {
  const text = document.getElementById('apimaticContext').textContent;
  navigator.clipboard.writeText(text);
  alert('Copied to clipboard!');
};

window.getQueryContext = async () => {
  const query = document.getElementById('apimaticQuery').value;
  if (!query) return alert('Enter a query');
  
  const btn = document.querySelector('button[onclick="getQueryContext()"]');
  btn.disabled = true;
  btn.textContent = 'Getting context...';
  
  const result = await fetch('/api/apimatic/context-for-query', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ query }) 
  }).then(r => r.json()).catch(() => ({ context: 'Error' }));
  
  document.getElementById('apimaticQueryResult').textContent = result.context || 'No context available';
  btn.disabled = false;
  btn.textContent = 'Get Context for Query';
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  // Check if AG Grid loaded
  if (typeof agGrid === 'undefined') {
    console.error('AG Grid not loaded!');
  } else {
    console.log('AG Grid loaded:', agGrid.Grid);
  }
});