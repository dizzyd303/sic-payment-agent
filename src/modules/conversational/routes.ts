import { Router } from 'express';
import { handleMessage } from './service.js';
import { requestPayout } from '../payment-guard/service.js';
export const conversationalRouter = Router();

conversationalRouter.post('/message', async (req,res)=> {
  const { message } = req.body;
  res.json(await handleMessage(message));
});

conversationalRouter.post('/confirm', async (req,res)=> {
  const { vendor, amount_cents, memo } = req.body;
  if (!vendor || !amount_cents) return res.status(400).json({ error: 'vendor and amount_cents required' });
  // Simple confirm: use a dummy receiver for demo
  const result = await requestPayout(vendor, 'acct@paypal.com', amount_cents, memo ?? 'Chat confirmed');
  res.json(result);
});
