import { Router } from 'express';
import { getPayPalAgent } from '../../services/paypal/agent-toolkit.js';
import { db } from '../../db/init.js';
import crypto from 'node:crypto';

export const productsRouter: Router = Router();

// Channel3 integration (if API key available)
const CHANNEL3_API_KEY = process.env.CHANNEL3_API_KEY;
const CHANNEL3_BASE_URL = 'https://api.channel3.io/v1';

async function channel3Search(query: string, filters: any = {}) {
  if (!CHANNEL3_API_KEY) {
    throw new Error('Channel3 API key not configured');
  }
  
  const params = new URLSearchParams({
    q: query,
    limit: String(filters.limit || 20),
    ...(filters.category && { category: filters.category }),
    ...(filters.minPrice && { min_price: String(filters.minPrice) }),
    ...(filters.maxPrice && { max_price: String(filters.maxPrice) }),
  });
  
  const response = await fetch(`${CHANNEL3_BASE_URL}/products/search?${params}`, {
    headers: {
      'Authorization': `Bearer ${CHANNEL3_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Channel3 API error: ${response.status}`);
  }
  
  return response.json();
}

productsRouter.get('/search', async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q required' });
    }
    
    if (CHANNEL3_API_KEY) {
      try {
        const results = await channel3Search(q as string, { category, minPrice, maxPrice, limit });
        res.json({ source: 'channel3', results });
        return;
      } catch (e: any) {
        console.warn('[Products] Channel3 search failed, falling back to local', e.message);
      }
    }
    
    // Fallback to local products
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: any[] = [];
    
    if (q) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit as string) || 20);
    
    const stmt = db.prepare(query);
    const rows = await stmt.all(...params);
    res.json({ source: 'local', results: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

productsRouter.get('/', async (_, res) => {
  const stmt = db.prepare('SELECT * FROM products ORDER BY created_at DESC');
  const rows = await stmt.all();
  res.json(rows);
});

productsRouter.post('/', async (req, res) => {
  try {
    const agent = getPayPalAgent();
    const { name, description, type, category, imageUrl, homeUrl } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'name, type required' });
    }
    
    const tools = agent.getRawTools();
    const createProduct = tools['create_product'];
    if (!createProduct) throw new Error('create_product tool not available');
    
    const result = await createProduct.execute({
      name,
      description: description ?? '',
      type,
      category: category ?? '',
      image_url: imageUrl ?? '',
      home_url: homeUrl ?? '',
    });
    
    if (result?.product_id) {
      const id = crypto.randomUUID();
      const stmt = db.prepare(`
        INSERT INTO products (id, paypal_product_id, name, description, type, category, image_url, home_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      await stmt.run(id, result.product_id, name, description ?? null, type, category ?? null, imageUrl ?? null, homeUrl ?? null);
    }
    
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

productsRouter.get('/:id', async (req, res) => {
  const stmt = db.prepare('SELECT * FROM products WHERE id = ?');
  const row = await stmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

productsRouter.post('/from-channel3', async (req, res) => {
  try {
    const { channel3ProductId } = req.body;
    if (!channel3ProductId) {
      return res.status(400).json({ error: 'channel3ProductId required' });
    }
    
    if (!CHANNEL3_API_KEY) {
      return res.status(503).json({ error: 'Channel3 API key not configured' });
    }
    
    const response = await fetch(`${CHANNEL3_BASE_URL}/products/${channel3ProductId}`, {
      headers: { 'Authorization': `Bearer ${CHANNEL3_API_KEY}` },
    });
    
    if (!response.ok) {
      throw new Error(`Channel3 API error: ${response.status}`);
    }
    
    const product = await response.json();
    
    // Create in PayPal catalog
    const agent = getPayPalAgent();
    const tools = agent.getRawTools();
    const createProduct = tools['create_product'];
    if (!createProduct) throw new Error('create_product tool not available');
    
    const result = await createProduct.execute({
      name: product.name,
      description: product.description,
      type: 'PHYSICAL',
      category: product.category,
      image_url: product.images?.[0]?.url ?? '',
      home_url: product.url ?? '',
    });
    
    if (result?.product_id) {
      const id = crypto.randomUUID();
      const stmt = db.prepare(`
        INSERT INTO products (id, paypal_product_id, name, description, type, category, image_url, home_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      await stmt.run(id, result.product_id, product.name, product.description, 'PHYSICAL', product.category, product.images?.[0]?.url ?? '', product.url ?? '');
    }
    
    res.json({ channel3Product: product, paypalProduct: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

productsRouter.get('/categories/list', async (req, res) => {
  if (CHANNEL3_API_KEY) {
    try {
      const response = await fetch(`${CHANNEL3_BASE_URL}/categories`, {
        headers: { 'Authorization': `Bearer ${CHANNEL3_API_KEY}` },
      });
      if (response.ok) {
        const categories = await response.json();
        return res.json({ source: 'channel3', categories });
      }
    } catch (e: any) {
      console.warn('[Products] Channel3 categories failed', e.message);
    }
  }
  
  // Fallback to local categories
  const stmt = db.prepare('SELECT DISTINCT category FROM products WHERE category IS NOT NULL');
  const rows = await stmt.all() as { category: string }[];
  res.json({ source: 'local', categories: rows.map((r: { category: string }) => r.category) });
});