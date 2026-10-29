import axios from 'axios';

const APIMATIC_API_KEY = process.env.APIMATIC_API_KEY;
const APIMATIC_BASE_URL = 'https://apimatic.io/api';

interface APIMaticEndpoint {
  method: string;
  path: string;
  summary: string;
  description?: string;
  parameters?: any[];
  requestBody?: any;
  responses?: any;
}

interface APIMaticAPIContext {
  title: string;
  version: string;
  baseUrl: string;
  endpoints: APIMaticEndpoint[];
}

class APIMaticService {
  private cache: Map<string, APIMaticAPIContext> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour

  async generatePayPalContext(): Promise<string> {
    // Check cache first
    const cached = this.cache.get('paypal');
    const expiry = this.cacheExpiry.get('paypal');
    if (cached && expiry && Date.now() < expiry) {
      return this.formatContextForLLM(cached);
    }

    try {
      // Try to get from APIMatic if key is available
      if (APIMATIC_API_KEY) {
        const context = await this.fetchFromAPIMatic();
        if (context) {
          this.cache.set('paypal', context);
          this.cacheExpiry.set('paypal', Date.now() + this.CACHE_TTL);
          return this.formatContextForLLM(context);
        }
      }
    } catch (error: any) {
      console.warn('[APIMatic] Failed to fetch from APIMatic:', error.message);
    }

    // Fallback: Return built-in PayPal API context
    return this.getBuiltInPayPalContext();
  }

  private async fetchFromAPIMatic(): Promise<APIMaticAPIContext | null> {
    if (!APIMATIC_API_KEY) return null;

    try {
      // APIMatic API to get API definition
      // This would typically use their API transformation endpoints
      const response = await axios.get(`${APIMATIC_BASE_URL}/apis/paypal`, {
        headers: {
          'Authorization': `Bearer ${APIMATIC_API_KEY}`,
          'Accept': 'application/json',
        },
      });
      return response.data;
    } catch (error: any) {
      console.warn('[APIMatic] APIMatic fetch failed:', error.message);
      return null;
    }
  }

  private formatContextForLLM(context: APIMaticAPIContext): string {
    let output = `# PayPal API Context (via APIMatic)\n\n`;
    output += `**API:** ${context.title} v${context.version}\n`;
    output += `**Base URL:** ${context.baseUrl}\n\n`;
    output += `## Available Endpoints\n\n`;

    for (const endpoint of context.endpoints) {
      output += `### ${endpoint.method.toUpperCase()} ${endpoint.path}\n`;
      output += `**Summary:** ${endpoint.summary}\n`;
      if (endpoint.description) {
        output += `**Description:** ${endpoint.description}\n`;
      }
      if (endpoint.parameters?.length) {
        output += `**Parameters:**\n`;
        for (const param of endpoint.parameters) {
          output += `- \`${param.name}\` (${param.in}): ${param.description || 'No description'} ${param.required ? '[Required]' : ''}\n`;
        }
      }
      if (endpoint.requestBody) {
        output += `**Request Body:** ${JSON.stringify(endpoint.requestBody, null, 2)}\n`;
      }
      output += `\n`;
    }

    return output;
  }

  private getBuiltInPayPalContext(): string {
    return `# PayPal API Context (Built-in Fallback)

## PayPal REST APIs - Sandbox Environment

**Base URL:** https://api-m.sandbox.paypal.com
**Auth:** OAuth 2.0 Client Credentials (Bearer Token)

### Authentication
- **POST /v1/oauth2/token** - Get access token
  - Body: grant_type=client_credentials
  - Auth: Basic (client_id:client_secret)

### Orders API v2
- **POST /v2/checkout/orders** - Create order
  - Intent: CAPTURE | AUTHORIZE
  - Purchase units with amount, currency, items
- **GET /v2/checkout/orders/{id}** - Get order details
- **POST /v2/checkout/orders/{id}/capture** - Capture payment
- **POST /v2/checkout/orders/{id}/authorize** - Authorize order
- **PATCH /v2/checkout/orders/{id}** - Update order

### Payments API v2
- **GET /v2/payments/captures/{id}** - Get capture details
- **POST /v2/payments/captures/{id}/refund** - Refund capture
- **GET /v2/payments/refunds/{id}** - Get refund details

### Payouts API v1
- **POST /v1/payments/payouts** - Create payout batch
  - sender_batch_header with sender_batch_id, email_subject
  - items with recipient_type, amount, receiver, note
- **GET /v1/payments/payouts/{batch_id}** - Get payout batch status
- **GET /v1/payments/payouts-item/{item_id}** - Get payout item details

### Invoicing API
- **POST /v2/invoicing/invoices** - Create invoice
- **GET /v2/invoicing/invoices/{id}** - Get invoice
- **POST /v2/invoicing/invoices/{id}/send** - Send invoice
- **POST /v2/invoicing/invoices/{id}/remind** - Send reminder
- **POST /v2/invoicing/invoices/{id}/cancel** - Cancel invoice
- **POST /v2/invoicing/invoices/{id}/generate-qr-code** - Generate QR code
- **POST /v2/invoicing/invoices/{id}/payments** - Record payment

### Subscriptions API
- **POST /v1/billing/plans** - Create billing plan
- **GET /v1/billing/plans/{id}** - Get plan
- **PATCH /v1/billing/plans/{id}** - Update plan
- **POST /v1/billing/subscriptions** - Create subscription
- **GET /v1/billing/subscriptions/{id}** - Get subscription
- **POST /v1/billing/subscriptions/{id}/cancel** - Cancel subscription
- **POST /v1/billing/subscriptions/{id}/suspend** - Suspend subscription
- **POST /v1/billing/subscriptions/{id}/activate** - Activate subscription

### Catalog API
- **POST /v1/catalogs/products** - Create product
- **GET /v1/catalogs/products/{id}** - Get product
- **GET /v1/catalogs/products** - List products

### Disputes API
- **GET /v1/customer/disputes** - List disputes
- **GET /v1/customer/disputes/{id}** - Get dispute
- **POST /v1/customer/disputes/{id}/accept-claim** - Accept claim
- **POST /v1/customer/disputes/{id}/provide-evidence** - Provide evidence

### Webhooks
- **POST /v1/notifications/webhooks** - Create webhook
- **GET /v1/notifications/webhooks** - List webhooks
- **GET /v1/notifications/webhooks/{id}** - Get webhook
- **PATCH /v1/notifications/webhooks/{id}** - Update webhook
- **DELETE /v1/notifications/webhooks/{id}** - Delete webhook

### Key Sandbox Notes
- Token expires ~9 hours, refresh 5 min early
- Payouts GET uses api.sandbox.paypal.com (different host)
- Orders links may use api.sandbox.paypal.com
- Invoicing scope may not be provisioned on all sandbox accounts
- Payouts allow same-account testing, fees still apply in response
`;
  }

  // Generate context specifically for a user query
  async getContextForQuery(query: string): Promise<string> {
    const fullContext = await this.generatePayPalContext();
    
    // For demo purposes, return full context
    // In production, you'd filter based on query relevance
    return fullContext;
  }
}

let apimaticInstance: APIMaticService | null = null;

export function getAPIMaticService(): APIMaticService {
  if (!apimaticInstance) {
    apimaticInstance = new APIMaticService();
  }
  return apimaticInstance;
}

export { APIMaticService, type APIMaticAPIContext, type APIMaticEndpoint };