import { Router } from 'express';
import { getPayPalAgent } from '../../services/paypal/agent-toolkit.js';

export const agentRouter: Router = Router();

agentRouter.get('/tools', (_, res) => {
  try {
    const agent = getPayPalAgent();
    const tools = agent.getRawTools();
    res.json({ 
      tools: Object.values(tools).map((t: any) => ({ 
        name: t.name, 
        description: t.description,
        parameters: t.parameters 
      })) 
    });
  } catch (e: any) {
    res.status(503).json({ error: e.message });
  }
});

agentRouter.post('/workflow', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { prompt, model } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    
    const result = await agent.executeWorkflow(prompt, { model });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

agentRouter.post('/invoice/create-and-send', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { recipientEmail, recipientName, items, note, dueDays } = req.body;
    if (!recipientEmail || !recipientName || !items?.length) {
      return res.status(400).json({ error: 'recipientEmail, recipientName, items required' });
    }
    
    const result = await agent.createAndSendInvoice({ recipientEmail, recipientName, items, note, dueDays });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

agentRouter.post('/subscription/create-plan', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { name, description, priceCents, billingCycle, currency } = req.body;
    if (!name || !description || !priceCents || !billingCycle) {
      return res.status(400).json({ error: 'name, description, priceCents, billingCycle required' });
    }
    
    const result = await agent.createSubscriptionPlan({ name, description, priceCents, billingCycle, currency });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

agentRouter.post('/subscription/subscribe', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { planId, customerEmail, customerName, startDate } = req.body;
    if (!planId || !customerEmail) {
      return res.status(400).json({ error: 'planId, customerEmail required' });
    }
    
    const result = await agent.subscribeCustomer({ planId, customerEmail, customerName, startDate });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

agentRouter.post('/order/create', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { amountCents, currency, description, customerEmail } = req.body;
    if (!amountCents) {
      return res.status(400).json({ error: 'amountCents required' });
    }
    
    const result = await agent.createOrderForPayment({ amountCents, currency, description, customerEmail });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

agentRouter.post('/shipment/track', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { orderId, trackingNumber, carrier, status } = req.body;
    if (!orderId || !trackingNumber || !carrier || !status) {
      return res.status(400).json({ error: 'orderId, trackingNumber, carrier, status required' });
    }
    
    const result = await agent.trackShipment({ orderId, trackingNumber, carrier, status });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

agentRouter.get('/insights', async (_, res) => {
  try {
    const agent = getPayPalAgent();
    const result = await agent.getMerchantInsights();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

agentRouter.get('/transactions', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { startDate, endDate, transactionType, limit } = req.query;
    const result = await agent.listTransactions({
      startDate: startDate as string,
      endDate: endDate as string,
      transactionType: transactionType as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

agentRouter.get('/status', (_, res) => {
  try {
    getPayPalAgent();
    res.json({ available: true });
  } catch {
    res.json({ available: false, reason: 'PayPal credentials not configured' });
  }
});