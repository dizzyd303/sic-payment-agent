import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

class PayPalMCPClient {
  private client: Client | null = null;
  private tools: MCPTool[] = [];
  private connected = false;

  async connect(config: MCPServerConfig): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }

    let transport;
    
    if (config.type === 'stdio' && config.command) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: config.env,
      });
    } else if (config.type === 'sse' && config.url) {
      transport = new SSEClientTransport(new URL(config.url));
    } else {
      throw new Error('Invalid MCP server config: must provide either stdio (command) or sse (url)');
    }

    this.client = new Client({
      name: 'sic-payment-agent',
      version: '1.0.0',
    });

    await this.client.connect(transport);
    
    // List available tools
    const toolsResult = await this.client.listTools();
    this.tools = toolsResult.tools.map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema,
    }));
    
    this.connected = true;
    console.log(`[MCP] Connected to ${config.name} with ${this.tools.length} tools`);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.tools = [];
      this.connected = false;
    }
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected');
    }
    
    const result = await this.client.callTool({ name, arguments: args });
    return result;
  }
}

// Predefined PayPal MCP configurations
export const PAYPAL_MCP_CONFIGS = {
  remote: {
    name: 'paypal-remote',
    type: 'sse' as const,
    url: process.env.PAYPAL_MCP_URL || 'https://mcp.paypal.com/sse',
  },
  local: {
    name: 'paypal-local',
    type: 'stdio' as const,
    command: 'npx',
    args: ['@paypal/agent-toolkit', 'mcp'],
    env: {
      PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
      PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || '',
      PAYPAL_ENVIRONMENT: process.env.PAYPAL_MODE || 'sandbox',
    },
  },
};

let mcpClientInstance: PayPalMCPClient | null = null;

export function getMCPClient(): PayPalMCPClient {
  if (!mcpClientInstance) {
    mcpClientInstance = new PayPalMCPClient();
  }
  return mcpClientInstance;
}

export async function initializeMCP(useRemote = true): Promise<PayPalMCPClient> {
  const client = getMCPClient();
  const config = useRemote ? PAYPAL_MCP_CONFIGS.remote : PAYPAL_MCP_CONFIGS.local;
  
  try {
    await client.connect(config);
    return client;
  } catch (error: any) {
    console.error('[MCP] Connection failed:', error.message);
    // Try fallback
    if (useRemote) {
      console.log('[MCP] Trying local fallback...');
      return initializeMCP(false);
    }
    throw error;
  }
}

export { PayPalMCPClient, type MCPTool, type MCPServerConfig };