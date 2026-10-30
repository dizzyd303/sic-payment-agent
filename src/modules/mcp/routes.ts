import { Router } from 'express';
import { getMCPClient, initializeMCP } from '../../services/paypal/mcp-client.js';

export const mcpRouter: Router = Router();

mcpRouter.get('/status', (_, res) => {
  const client = getMCPClient();
  res.json({ 
    connected: client.isConnected(),
    tools: client.getTools().map(t => t.name),
  });
});

mcpRouter.post('/connect', async (req, res) => {
  try {
    const { remote = true } = req.body;
    const client = await initializeMCP(remote);
    res.json({ 
      success: true, 
      connected: client.isConnected(),
      tools: client.getTools().map(t => t.name),
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

mcpRouter.post('/disconnect', async (_, res) => {
  try {
    const client = getMCPClient();
    await client.disconnect();
    res.json({ success: true, connected: false });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

mcpRouter.get('/tools', (_, res) => {
  const client = getMCPClient();
  res.json({ tools: client.getTools() });
});

mcpRouter.post('/tools/:name', async (req, res) => {
  try {
    const client = getMCPClient();
    if (!client.isConnected()) {
      return res.status(503).json({ error: 'MCP not connected' });
    }
    
    const { name } = req.params;
    const args = req.body;
    
    const result = await client.callTool(name, args);
    res.json({ success: true, result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
