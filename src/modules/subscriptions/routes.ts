import { Router } from 'express';
import { getPayPalAgent } from '../../services/paypal/agent-toolkit.js';
import { db } from '../../db/init.js';
import crypto from 'node:crypto';

export const subscriptionsRouter: Router = Router();

subscriptionsRouter.post('/plans', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { name, description, priceCents, billingCycle, currency } = req.body;
    if (!name || !description || !priceCents || !billingCycle) {
      return res.status(400).json({ error: 'name, description, priceCents, billingCycle required' });
    }
    
    const result = await agent.createSubscriptionPlan({ name, description, priceCents, billingCycle, currency });
    const planStep = result.steps?.find((s: any) => s.tool === "create_subscription_plan");
    const planOut = planStep?.output as Record<string, unknown> | undefined;
    const planId = (planOut?.id || planOut?.plan_id) as string | undefined;
    if (planId) {
      const id = crypto.randomUUID();
      await db.prepare("INSERT INTO subscription_plans (id, paypal_plan_id, name, description, amount_cents, currency, billing_cycle) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, planId, name, description, priceCents, currency || "USD", billingCycle);
    }
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

subscriptionsRouter.get('/plans', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const tools = agent.getRawTools();
    const listPlans = tools['list_subscription_plans'];
    if (!listPlans) throw new Error('list_subscription_plans tool not available');
    
    const result = await listPlans.execute({});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

subscriptionsRouter.get('/plans/:id', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const tools = agent.getRawTools();
    const showPlan = tools['show_subscription_plan_details'];
    if (!showPlan) throw new Error('show_subscription_plan_details tool not available');
    
    const result = await showPlan.execute({ plan_id: req.params.id });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

subscriptionsRouter.post('/subscribe', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { planId, customerEmail, customerName, startDate } = req.body;
    if (!planId || !customerEmail) {
      return res.status(400).json({ error: 'planId, customerEmail required' });
    }
    
    const result = await agent.subscribeCustomer({ planId, customerEmail, customerName, startDate });
    
    if (result.success && result.steps.length > 0) {
      const createStep = result.steps.find(s => s.tool === 'create_subscription');
      const output = createStep?.output as Record<string, unknown> | undefined;
      if (output?.subscription_id) {
        const planStmt = db.prepare('SELECT * FROM subscription_plans WHERE paypal_plan_id = ?');
        const planRow = await planStmt.get(planId) as any;
        if (planRow) {
          const id = crypto.randomUUID();
          const insertStmt = db.prepare(`
            INSERT INTO subscriptions (id, paypal_subscription_id, paypal_plan_id, customer_email, customer_name, status, amount_cents, currency, billing_cycle, next_billing_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `);
          await insertStmt.run(
            id,
            output.subscription_id as string,
            planId,
            customerEmail,
            customerName ?? null,
            'active',
            planRow.amount_cents,
            planRow.currency,
            planRow.billing_cycle,
            startDate ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
          );
        }
      }
    }
    
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

subscriptionsRouter.get('/', async (_, res) => {
  const stmt = db.prepare('SELECT * FROM subscriptions ORDER BY created_at DESC');
  const rows = await stmt.all();
  res.json(rows);
});

subscriptionsRouter.get('/:id', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
  const row = await stmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

subscriptionsRouter.post('/:id/cancel', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
    const row = await stmt.get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    const tools = agent.getRawTools();
    const cancelSub = tools['cancel_subscription'];
    if (!cancelSub) throw new Error('cancel_subscription tool not available');
    
    const result = await cancelSub.execute({ subscription_id: row.paypal_subscription_id });
    
    if (result?.status === 'CANCELLED') {
      const updateStmt = db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?');
      await updateStmt.run('cancelled', req.params.id);
    }
    
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

subscriptionsRouter.post('/:id/pause', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
    const row = await stmt.get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    const tools = agent.getRawTools();
    const updateSub = tools['update_subscription'];
    if (!updateSub) throw new Error('update_subscription tool not available');
    
    const result = await updateSub.execute({ 
      subscription_id: row.paypal_subscription_id,
      status: 'PAUSED',
    });
    
    if (result?.status === 'PAUSED') {
      const updateStmt = db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?');
      await updateStmt.run('paused', req.params.id);
    }
    
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

subscriptionsRouter.post('/:id/resume', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
    const row = await stmt.get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    const tools = agent.getRawTools();
    const updateSub = tools['update_subscription'];
    if (!updateSub) throw new Error('update_subscription tool not available');
    
    const result = await updateSub.execute({ 
      subscription_id: row.paypal_subscription_id,
      status: 'ACTIVE',
    });
    
    if (result?.status === 'ACTIVE') {
      const updateStmt = db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?');
      await updateStmt.run('active', req.params.id);
    }
    
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});