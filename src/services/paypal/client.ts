import axios from 'axios';

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

class PayPalClient {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private token?: string;
  private tokenExpiresAt = 0;

  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID ?? '';
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? '';
    this.baseUrl = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
    if (!this.clientId || !this.clientSecret) {
      throw new Error('PAYPAL_CLIENT_ID/SECRET missing');
    }
  }

  private async fetchToken(): Promise<string> {
    const res = await axios.post<TokenResponse>(
      `${this.baseUrl}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        auth: { username: this.clientId, password: this.clientSecret }
      }
    );
    this.token = res.data.access_token;
    // refresh 5 min early
    this.tokenExpiresAt = Date.now() + (res.data.expires_in - 300) * 1000;
    return this.token;
  }

  private async getToken(): Promise<string> {
    if (!this.token || Date.now() >= this.tokenExpiresAt) {
      return this.fetchToken();
    }
    return this.token;
  }

  private async authHeaders() {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}` };
  }

  // Orders v2
  async createOrder(amountCents: number, currency = 'USD') {
    const headers = await this.authHeaders();
    const res = await axios.post(
      `${this.baseUrl}/v2/checkout/orders`,
      {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: currency, value: (amountCents/100).toFixed(2) } }]
      },
      { headers: { 'Content-Type': 'application/json', ...headers } }
    );
    return res.data;
  }

  async getOrder(orderId: string) {
    const headers = await this.authHeaders();
    const res = await axios.get(`${this.baseUrl}/v2/checkout/orders/${orderId}`, { headers });
    return res.data;
  }

  // Payouts v1
  async createPayoutBatch(senderBatchId: string, items: Array<{receiver:string; amountCents:number; note?:string}>) {
    const headers = await this.authHeaders();
    const payload = {
      sender_batch_header: { sender_batch_id: senderBatchId, email_subject: 'Payout from Payment Agent' },
      items: items.map(i => ({
        recipient_type: 'EMAIL',
        amount: { value: (i.amountCents/100).toFixed(2), currency: 'USD' },
        receiver: i.receiver,
        note: i.note ?? ''
      }))
    };
    const res = await axios.post(`${this.baseUrl}/v1/payments/payouts`, payload, {
      headers: { 'Content-Type': 'application/json', ...headers }
    });
    return res.data;
  }

  async getPayoutBatch(batchId: string) {
    // Payouts GET uses api.sandbox host per card quirk
    const token = await this.getToken();
    const res = await axios.get(`https://api.sandbox.paypal.com/v1/payments/payouts/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  }
}

export const paypal = new PayPalClient();
