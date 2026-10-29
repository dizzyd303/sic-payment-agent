import { Router } from 'express';
import { getAPIMaticService } from '../../services/apimatic/client.js';

export const apimaticRouter = Router();

apimaticRouter.get('/context', async (_, res) => {
  try {
    const service = getAPIMaticService();
    const context = await service.generatePayPalContext();
    res.json({ context });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apimaticRouter.post('/context-for-query', async (req, res) => {
  try {
    const service = getAPIMaticService();
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query required' });
    }
    const context = await service.getContextForQuery(query);
    res.json({ context, query });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apimaticRouter.get('/status', (_, res) => {
  const hasKey = !!process.env.APIMATIC_API_KEY;
  res.json({ 
    configured: hasKey,
    mode: hasKey ? 'apimatic' : 'built-in-fallback',
  });
});