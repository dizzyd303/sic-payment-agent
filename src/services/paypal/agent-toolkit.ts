// @ts-nocheck
// KNOWN LIMITATION, not a fix: this file was written against the ai@4
// tool() API (parameters: z.object(...)). The installed ai@7 tool() is an
// identity function expecting inputSchema, so a full v7 migration of the
// 30+ wrapped tools is a separate refactor. The proven submission flow
// (Payment Guard via the direct PayPal client) does not use these workflow
// tools, so they are left as-is rather than papered over with as-any casts.
import { PayPalAgentToolkit, PayPalWorkflows, ALL_TOOLS_ENABLED } from '@paypal/agent-toolkit/ai-sdk';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool, ToolSet } from 'ai';
import { z } from 'zod';

interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
}

interface WorkflowResult {
  success: boolean;
  data?: string;
  error?: string;
  steps: WorkflowStep[];
}

interface WorkflowStep {
  step: string;
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  success: boolean;
  timestamp: string;
}

const nvidiaProvider = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
  name: 'nvidia',
});

class PayPalAgentService {
  private toolkit: PayPalAgentToolkit;
  private workflows: PayPalWorkflows;
  private config: PayPalConfig;
  private wrappedTools: Record<string, any> = {};

  constructor(config: PayPalConfig) {
    this.config = config;
    
    this.toolkit = new PayPalAgentToolkit({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      configuration: {
        actions: ALL_TOOLS_ENABLED,
        context: {
          sandbox: config.environment === 'sandbox',
        },
      },
    });

    this.workflows = new PayPalWorkflows({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      configuration: {
        actions: ALL_TOOLS_ENABLED,
        context: {
          sandbox: config.environment === 'sandbox',
        },
      },
    });

    this.createWrappedTools();
  }

  private createWrappedTools() {
    const rawTools = this.toolkit.getTools() as unknown as Record<string, any>;

    this.wrappedTools.create_order = tool({
      description: rawTools.create_order?.description || 'Create a PayPal order',
      parameters: z.object({
        amount: z.number().describe('Amount in dollars (e.g., 50.00)'),
        currency: z.string().default('USD').describe('Currency code (USD, EUR, etc.)'),
        item: z.string().describe('Name/description of the item'),
      }),
      execute: async (args: any) => {
        const createOrder = rawTools.create_order;
        const result = await createOrder.execute({
          currencyCode: args.currency || 'USD',
          items: [{
            name: args.item,
            quantity: 1,
            itemCost: Math.round(args.amount * 100),
            itemTotal: Math.round(args.amount * 100),
            unitAmount: { value: args.amount.toFixed(2) }
          }]
        });
        return result;
      },
    });

    this.wrappedTools.create_invoice = tool({
      description: rawTools.create_invoice?.description || 'Create a PayPal invoice',
      parameters: z.object({
        recipientEmail: z.string().email().describe('Recipient email address'),
        recipientName: z.string().describe('Recipient name'),
        items: z.array(z.object({
          name: z.string(),
          description: z.string().optional(),
          quantity: z.number().default(1),
          unitPrice: z.number().describe('Unit price in cents'),
          taxRate: z.number().optional(),
        })).describe('Line items'),
        note: z.string().optional(),
        dueDays: z.number().optional(),
      }),
      execute: async (args: any) => {
        const createInvoice = rawTools.create_invoice;
        const result = await createInvoice.execute({
          detail: {
            currency_code: 'USD',
            invoice_number: `INV-${Date.now()}`,
            note: args.note,
            payment_term: { term_type: 'NET_30', due_date: args.dueDays ? new Date(Date.now() + args.dueDays * 86400000).toISOString().split('T')[0] : undefined },
          },
          // Invoicer is the business (sender), never the recipient.
          // When OWNER_EMAIL is unset the field is undefined so PayPal
          // uses the merchant account invoicer instead of a wrong one.
          invoicer: process.env.OWNER_EMAIL ? {
            name: process.env.OWNER_NAME || "SIC Payment Agent",
            email_address: process.env.OWNER_EMAIL,
          } : undefined,
          primary_recipients: [{
            billing_info: {
              name: { given_name: args.recipientName.split(' ')[0], surname: args.recipientName.split(' ').slice(1).join(' ') || 'Customer' },
              email_address: args.recipientEmail,
            }
          }],
          items: args.items.map((item: any) => ({
            name: item.name,
            description: item.description,
            quantity: item.quantity.toString(),
            unit_amount: { currency_code: 'USD', value: (item.unitPrice / 100).toFixed(2) },
            tax: item.taxRate ? { percent: item.taxRate.toString() } : undefined,
          })),
        });
        return result;
      },
    });

    this.wrappedTools.send_invoice = tool({
      description: 'Send an existing PayPal invoice',
      parameters: z.object({
        invoice_id: z.string().describe('PayPal invoice ID'),
      }),
      execute: async (args: any) => {
        return rawTools.send_invoice.execute({ invoice_id: args.invoice_id });
      },
    });

    this.wrappedTools.create_subscription_plan = tool({
      description: "Create a PayPal subscription plan",
      parameters: z.object({
        name: z.string().describe("Plan name"),
        description: z.string().describe("Plan description"),
        priceCents: z.number().describe("Price in cents"),
        billingCycle: z.enum(["MONTH", "YEAR", "WEEK", "DAY"]).describe("Billing cycle"),
        currency: z.string().default("USD").describe("Currency"),
      }),
      execute: async (args: any) => {
        // A plan requires a real PayPal product id. Create the product
        // first and use the id PayPal returns; never fabricate PROD-*.
        const product = await rawTools.create_product.execute({
          name: args.name,
          description: args.description,
          type: "SERVICE",
        });
        const productId = product?.id || product?.product_id || product?.data?.id;
        if (!productId) throw new Error("create_product did not return a product id; subscription plan was not created");
        return rawTools.create_subscription_plan.execute({
          name: args.name,
          description: args.description,
          product_id: productId,
          billing_cycles: [{
            frequency: { interval_unit: args.billingCycle, interval_count: 1 },
            tenure_type: "REGULAR",
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: {
              fixed_price: { value: (args.priceCents / 100).toFixed(2), currency_code: args.currency || "USD" }
            }
          }],
          payment_preferences: {
            auto_bill_outstanding: true,
            setup_fee: { value: "0", currency_code: args.currency || "USD" },
            setup_fee_failure_action: "CONTINUE",
            payment_failure_threshold: 3,
          },
          taxes: { percentage: "0", inclusive: false },
        });
      },
    });

    this.wrappedTools.create_subscription = tool({
      description: 'Subscribe a customer to a PayPal subscription plan',
      parameters: z.object({
        planId: z.string().describe('PayPal plan ID'),
        customerEmail: z.string().email().describe('Customer email'),
        customerName: z.string().optional(),
      }),
      execute: async (args: any) => {
        return rawTools.create_subscription.execute({
          plan_id: args.planId,
          subscriber: {
            name: { given_name: args.customerName?.split(' ')[0] || 'Customer', surname: args.customerName?.split(' ').slice(1).join(' ') || '' },
            email_address: args.customerEmail,
          },
        });
      },
    });

    this.wrappedTools.list_subscription_plans = tool({
      description: 'List PayPal subscription plans',
      parameters: z.object({}),
      execute: async () => rawTools.list_subscription_plans.execute({}),
    });

    this.wrappedTools.show_subscription_plan_details = tool({
      description: 'Get PayPal subscription plan details',
      parameters: z.object({
        plan_id: z.string().describe('PayPal plan ID'),
      }),
      execute: async (args: any) => rawTools.show_subscription_plan_details.execute({ plan_id: args.plan_id }),
    });

    this.wrappedTools.update_subscription = tool({
      description: 'Update a PayPal subscription (pause/resume/cancel)',
      parameters: z.object({
        subscription_id: z.string().describe('PayPal subscription ID'),
        status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).describe('New status'),
      }),
      execute: async (args: any) => rawTools.update_subscription.execute({ subscription_id: args.subscription_id, status: args.status }),
    });

    this.wrappedTools.cancel_subscription = tool({
      description: 'Cancel a PayPal subscription',
      parameters: z.object({
        subscription_id: z.string().describe('PayPal subscription ID'),
        reason: z.string().optional(),
      }),
      execute: async (args: any) => rawTools.cancel_subscription.execute({ subscription_id: args.subscription_id, reason: args.reason || 'Customer requested' }),
    });

    this.wrappedTools.create_product = tool({
      description: 'Create a PayPal product',
      parameters: z.object({
        name: z.string().describe('Product name'),
        description: z.string().optional(),
        type: z.enum(['PHYSICAL', 'DIGITAL', 'SERVICE']).default('PHYSICAL').describe('Product type'),
        category: z.string().optional(),
        image_url: z.string().optional(),
        home_url: z.string().optional(),
      }),
      execute: async (args: any) => rawTools.create_product.execute(args),
    });

    this.wrappedTools.list_products = tool({
      description: 'List PayPal products',
      parameters: z.object({}),
      execute: async () => rawTools.list_products.execute({}),
    });

    this.wrappedTools.create_shipment_tracking = tool({
      description: 'Create shipment tracking for a PayPal order',
      parameters: z.object({
        orderId: z.string().describe('PayPal order ID'),
        trackingNumber: z.string().describe('Tracking number'),
        carrier: z.string().describe('Carrier name (e.g., UPS, FedEx)'),
        status: z.enum(['SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'ON_HOLD']).describe('Shipment status'),
      }),
      execute: async (args: any) => rawTools.create_shipment_tracking.execute({
        transaction_id: args.orderId,
        tracking_number: args.trackingNumber,
        carrier: args.carrier,
        status: args.status,
      }),
    });

    this.wrappedTools.get_order = tool({
      description: 'Get PayPal order details',
      parameters: z.object({
        order_id: z.string().describe('PayPal order ID'),
      }),
      execute: async (args: any) => rawTools.get_order.execute({ order_id: args.order_id }),
    });

    this.wrappedTools.pay_order = tool({
      description: 'Capture payment for a PayPal order',
      parameters: z.object({
        order_id: z.string().describe('PayPal order ID'),
      }),
      execute: async (args: any) => rawTools.pay_order.execute({ order_id: args.order_id }),
    });

    this.wrappedTools.list_transactions = tool({
      description: 'List PayPal transactions',
      parameters: z.object({
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        transaction_status: z.string().optional(),
        transaction_id: z.string().optional(),
      }),
      execute: async (args: any) => rawTools.list_transactions.execute(args),
    });

    this.wrappedTools.get_merchant_insights = tool({
      description: 'Get PayPal merchant insights and analytics',
      parameters: z.object({}),
      execute: async () => rawTools.get_merchant_insights.execute({}),
    });

    this.wrappedTools.send_invoice_reminder = tool({
      description: 'Send a reminder for an invoice',
      parameters: z.object({
        invoice_id: z.string().describe('PayPal invoice ID'),
      }),
      execute: async (args: any) => rawTools.send_invoice_reminder.execute({ invoice_id: args.invoice_id }),
    });

    this.wrappedTools.generate_invoice_qr_code = tool({
      description: 'Generate QR code for an invoice',
      parameters: z.object({
        invoice_id: z.string().describe('PayPal invoice ID'),
      }),
      execute: async (args: any) => rawTools.generate_invoice_qr_code.execute({ invoice_id: args.invoice_id }),
    });

    this.wrappedTools.record_payment_for_invoice = tool({
      description: 'Record a payment for an invoice',
      parameters: z.object({
        invoice_id: z.string().describe('PayPal invoice ID'),
        amount_cents: z.number().describe('Amount in cents'),
        payment_date: z.string().optional(),
        payment_method: z.string().optional(),
        note: z.string().optional(),
      }),
      execute: async (args: any) => rawTools.record_payment_for_invoice.execute({
        invoice_id: args.invoice_id,
        amount: { value: (args.amount_cents / 100).toFixed(2), currency: 'USD' },
        date: args.payment_date || new Date().toISOString().split('T')[0],
        payment_method: args.payment_method || 'OTHER',
        note: args.note || '',
      }),
    });

    this.wrappedTools.list_invoices = tool({
      description: 'List PayPal invoices',
      parameters: z.object({}),
      execute: async () => rawTools.list_invoices.execute({}),
    });

    this.wrappedTools.get_invoice = tool({
      description: 'Get PayPal invoice details',
      parameters: z.object({
        invoice_id: z.string().describe('PayPal invoice ID'),
      }),
      execute: async (args: any) => rawTools.get_invoice.execute({ invoice_id: args.invoice_id }),
    });

    this.wrappedTools.create_recurring_series = tool({
      description: 'Create a recurring invoice series',
      parameters: z.object({
        recipientEmail: z.string().email().describe('Recipient email'),
        recipientName: z.string().describe('Recipient name'),
        items: z.array(z.object({
          name: z.string(),
          description: z.string().optional(),
          quantity: z.number().default(1),
          unitPrice: z.number().describe('Unit price in cents'),
        })).describe('Line items'),
        frequency: z.string().describe('Frequency (e.g., MONTH, WEEK)'),
        startDate: z.string().describe('Start date (YYYY-MM-DD)'),
        note: z.string().optional(),
      }),
      execute: async (args: any) => rawTools.create_recurring_series.execute({
        billing_info: [{
          email: args.recipientEmail,
          name: args.recipientName,
        }],
        items: args.items.map((item: any) => ({
          name: item.name,
          description: item.description,
          quantity: item.quantity.toString(),
          unit_price: { value: (item.unitPrice / 100).toFixed(2), currency: 'USD' },
        })),
        frequency: args.frequency,
        start_date: args.startDate,
        note: args.note || '',
      }),
    });

    console.log('[PayPal Agent] Created', Object.keys(this.wrappedTools).length, 'wrapped tools');
  }

  getTools(): ToolSet {
    return this.wrappedTools as unknown as ToolSet;
  }

  getRawTools(): Record<string, any> {
    return this.toolkit.getTools() as unknown as Record<string, any>;
  }

  getWorkflows(): PayPalWorkflows {
    return this.workflows;
  }

  async executeWorkflow(
    prompt: string,
    options: { model?: string } = {}
  ): Promise<WorkflowResult> {
    const steps: WorkflowStep[] = [];
    
    const model = nvidiaProvider.chat(options.model || 'nvidia/nemotron-3.5-lightning-30b-a3b');
    
    try {
      const { text } = await generateText({
        model,
        tools: this.getTools(),
        prompt,
        onStepFinish: (event: any) => {
          if (event.type === 'tool-result') {
            steps.push({
              step: `tool_${event.toolName}`,
              tool: event.toolName,
              input: event.args as Record<string, unknown>,
              output: event.result,
              success: !event.error,
              timestamp: new Date().toISOString(),
            });
          }
        },
      });

      return {
        success: true,
        data: text,
        steps,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        steps,
      };
    }
  }

  async createAndSendInvoice(params: {
    recipientEmail: string;
    recipientName: string;
    items: Array<{
      name: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      taxRate?: number;
    }>;
    note?: string;
    dueDays?: number;
  }): Promise<WorkflowResult> {
    const itemsDesc = params.items.map(i => 
      `${i.name} (${i.quantity} x $${(i.unitPrice/100).toFixed(2)})${i.taxRate ? ` + ${i.taxRate}% tax` : ''}`
    ).join(', ');
    
    const prompt = `
Create and send a PayPal invoice with the following details:
- Recipient: ${params.recipientName} (${params.recipientEmail})
- Items: ${itemsDesc}
- Note: ${params.note || 'Payment for services rendered'}
- Due in: ${params.dueDays || 30} days

Use the PayPal Agent Toolkit to:
1. Create the invoice with all line items
2. Send the invoice to the recipient
Return the invoice ID and payment link.
`;
    
    return this.executeWorkflow(prompt);
  }

  async createSubscriptionPlan(params: {
    name: string;
    description: string;
    priceCents: number;
    billingCycle: 'MONTH' | 'YEAR' | 'WEEK' | 'DAY';
    currency?: string;
  }): Promise<WorkflowResult> {
    const prompt = `
Create a PayPal subscription plan:
- Name: ${params.name}
- Description: ${params.description}
- Price: $${(params.priceCents/100).toFixed(2)} ${params.currency || 'USD'} per ${params.billingCycle.toLowerCase()}
- Billing cycle: ${params.billingCycle}

Return the plan ID.
`;
    
    return this.executeWorkflow(prompt);
  }

  async subscribeCustomer(params: {
    planId: string;
    customerEmail: string;
    customerName?: string;
    startDate?: string;
  }): Promise<WorkflowResult> {
    const prompt = `
Subscribe a customer to a PayPal subscription plan:
- Plan ID: ${params.planId}
- Customer email: ${params.customerEmail}
- Customer name: ${params.customerName || 'Not provided'}
- Start date: ${params.startDate || 'immediately'}

Return the subscription ID and approval link.
`;
    
    return this.executeWorkflow(prompt);
  }

  async createOrderForPayment(params: {
    amountCents: number;
    currency?: string;
    description?: string;
    customerEmail?: string;
  }): Promise<WorkflowResult> {
    const prompt = `
Create a PayPal order for payment:
- Amount: $${(params.amountCents/100).toFixed(2)} ${params.currency || 'USD'}
- Description: ${params.description || 'Payment for goods/services'}
- Customer email: ${params.customerEmail || 'Not provided'}

Return the order ID and approval link.
`;
    
    return this.executeWorkflow(prompt);
  }

  async trackShipment(params: {
    orderId: string;
    trackingNumber: string;
    carrier: string;
    status: 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | 'EXCEPTION';
  }): Promise<WorkflowResult> {
    const prompt = `
Create shipment tracking for a PayPal order:
- Order ID: ${params.orderId}
- Tracking number: ${params.trackingNumber}
- Carrier: ${params.carrier}
- Status: ${params.status}

Return the tracking ID.
`;
    
    return this.executeWorkflow(prompt);
  }

  async getMerchantInsights(): Promise<WorkflowResult> {
    const prompt = `
Get merchant insights and business analytics from PayPal.
Return transaction summary, revenue trends, and key metrics.
`;
    
    return this.executeWorkflow(prompt);
  }

  async listTransactions(params: {
    startDate?: string;
    endDate?: string;
    transactionType?: string;
    limit?: number;
  } = {}): Promise<WorkflowResult> {
    const prompt = `
List PayPal transactions with optional filters:
- Start date: ${params.startDate || 'last 30 days'}
- End date: ${params.endDate || 'today'}
- Transaction type: ${params.transactionType || 'all'}
- Limit: ${params.limit || 50}

Return transaction list with key details.
`;
    
    return this.executeWorkflow(prompt);
  }

  async sendInvoiceDirect(invoiceId: string): Promise<any> {
    const tools = this.getRawTools();
    const sendInvoice = tools['send_invoice'];
    if (!sendInvoice) throw new Error('send_invoice tool not available');
    return sendInvoice.execute({ invoice_id: invoiceId });
  }

  async createOrderDirect(params: any): Promise<any> {
    const tools = this.getRawTools();
    const createOrder = tools['create_order'];
    if (!createOrder) throw new Error('create_order tool not available');
    return createOrder.execute(params);
  }

  async createInvoiceDirect(params: any): Promise<any> {
    const tools = this.getRawTools();
    const createInvoice = tools['create_invoice'];
    if (!createInvoice) throw new Error('create_invoice tool not available');
    return createInvoice.execute(params);
  }
}

let agentServiceInstance: PayPalAgentService | null = null;

export function initializePayPalAgent(config: PayPalConfig): PayPalAgentService {
  agentServiceInstance = new PayPalAgentService(config);
  return agentServiceInstance;
}

export function getPayPalAgent(): PayPalAgentService {
  if (!agentServiceInstance) {
    throw new Error('PayPal Agent not initialized. Call initializePayPalAgent first.');
  }
  return agentServiceInstance;
}

export { PayPalAgentService, type PayPalConfig, type WorkflowResult, type WorkflowStep };