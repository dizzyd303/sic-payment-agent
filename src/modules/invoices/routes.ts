import { Router } from 'express';
import { getPayPalAgent } from '../../services/paypal/agent-toolkit.js';
import { db } from '../../db/init.js';
import crypto from 'node:crypto';

export const invoicesRouter = Router();

invoicesRouter.post('/', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { 
      recipientEmail, 
      recipientName, 
      items, 
      note, 
      dueDays,
      sendImmediately = true 
    } = req.body;
    
    if (!recipientEmail || !recipientName || !items?.length) {
      return res.status(400).json({ error: 'recipientEmail, recipientName, items required' });
    }

    const result = await agent.createAndSendInvoice({ 
      recipientEmail, 
      recipientName, 
      items, 
      note, 
      dueDays 
    });
    
    if (result.success && result.steps.length > 0) {
      const createStep = result.steps.find(s => s.tool === 'create_invoice');
      const output = createStep?.output as Record<string, unknown> | undefined;
      if (output?.invoice_id) {
        const id = crypto.randomUUID();
        const stmt = db.prepare(`
          INSERT INTO invoices (id, paypal_invoice_id, recipient_email, recipient_name, amount_cents, currency, status, due_date, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        await stmt.run(
          id,
          output.invoice_id as string,
          recipientEmail,
          recipientName,
          items.reduce((sum: number, i: any) => sum + i.unitPrice * i.quantity, 0),
          'USD',
          sendImmediately ? 'sent' : 'draft',
          dueDays ? new Date(Date.now() + dueDays * 86400000).toISOString().split('T')[0] : null,
          note ?? null
        );
      }
    }
    
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

invoicesRouter.get('/', async (_, res) => {
  const stmt = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC');
  const rows = await stmt.all();
  res.json(rows);
});

invoicesRouter.get('/:id', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM invoices WHERE id = ?');
  const row = await stmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

invoicesRouter.post('/:id/send', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const stmt = db.prepare('SELECT * FROM invoices WHERE id = ?');
    const row = await stmt.get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    const result = await agent.sendInvoiceDirect(row.paypal_invoice_id);
    
    if (result?.invoice_id) {
      const updateStmt = db.prepare('UPDATE invoices SET status = ? WHERE id = ?');
      await updateStmt.run('sent', req.params.id);
    }
    
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

invoicesRouter.post('/:id/remind', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const stmt = db.prepare('SELECT * FROM invoices WHERE id = ?');
    const row = await stmt.get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    const tools = agent.getRawTools();
    const sendReminder = tools['send_invoice_reminder'];
    if (!sendReminder) throw new Error('send_invoice_reminder tool not available');
    
    const result = await sendReminder.execute({ invoice_id: row.paypal_invoice_id });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

invoicesRouter.post('/:id/qr-code', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const stmt = db.prepare('SELECT * FROM invoices WHERE id = ?');
    const row = await stmt.get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    const tools = agent.getRawTools();
    const generateQR = tools['generate_invoice_qr_code'];
    if (!generateQR) throw new Error('generate_invoice_qr_code tool not available');
    
    const result = await generateQR.execute({ invoice_id: row.paypal_invoice_id });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

invoicesRouter.post('/:id/record-payment', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const stmt = db.prepare('SELECT * FROM invoices WHERE id = ?');
    const row = await stmt.get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    const { amountCents, paymentDate, paymentMethod, note } = req.body;
    const tools = agent.getRawTools();
    const recordPayment = tools['record_payment_for_invoice'];
    if (!recordPayment) throw new Error('record_payment_for_invoice tool not available');
    
    const result = await recordPayment.execute({
      invoice_id: row.paypal_invoice_id,
      amount: { value: (amountCents/100).toFixed(2), currency: 'USD' },
      date: paymentDate ?? new Date().toISOString().split('T')[0],
      payment_method: paymentMethod ?? 'OTHER',
      note: note ?? '',
    });
    
    if (result?.payment_id) {
      const updateStmt = db.prepare('UPDATE invoices SET status = ? WHERE id = ?');
      await updateStmt.run('paid', req.params.id);
    }
    
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

invoicesRouter.post('/recurring/create', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { 
      recipientEmail, 
      recipientName, 
      items, 
      frequency, 
      startDate, 
      note 
    } = req.body;
    
    if (!recipientEmail || !recipientName || !items?.length || !frequency) {
      return res.status(400).json({ error: 'recipientEmail, recipientName, items, frequency required' });
    }
    
    const tools = agent.getRawTools();
    const createSeries = tools['create_recurring_series'];
    if (!createSeries) throw new Error('create_recurring_series tool not available');
    
    const result = await createSeries.execute({
      billing_info: [{
        email: recipientEmail,
        name: recipientName,
      }],
      items: items.map((i: any) => ({
        name: i.name,
        description: i.description,
        quantity: i.quantity,
        unit_price: { value: (i.unitPrice/100).toFixed(2), currency: 'USD' },
      })),
      frequency,
      start_date: startDate,
      note: note ?? '',
    });
    
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});