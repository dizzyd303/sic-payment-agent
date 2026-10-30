import { Router } from 'express';
import { createReceivable, chaseReceivable, listReceivables } from './service.js';
export const receivablesRouter: Router = Router();

receivablesRouter.post('/', async (req,res)=> {
  try {
    const { customer_name, amount, currency, due_date, notes } = req.body;
    const result = await createReceivable(customer_name, amount, currency, due_date, notes);
    res.json(result);
  } catch(e:any){ res.status(500).json({error:e.message}) }
});

receivablesRouter.get('/', async (_,res)=> res.json(listReceivables()));
receivablesRouter.post('/:id/chase', async (req,res)=> {
  try { res.json(await chaseReceivable(req.params.id)); } catch(e:any){ res.status(500).json({error:e.message}) }
});
