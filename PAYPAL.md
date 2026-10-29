# PayPal System Card — Sandbox

**Scope:** Orders v2, Payouts v1. Invoicing API not provisioned — do not use.

## Auth
- Flow: OAuth2 Client Credentials
- Token URL: POST https://api-m.sandbox.paypal.com/v1/oauth2/token
- Auth: HTTP Basic with Client ID : Secret
- Body: grant_type=client_credentials
- Response shape actual:
{
  "scope": "...",
  "access_token": "A21AA...",
  "token_type": "Bearer",
  "app_id": "APP-...",
  "expires_in": 32391,
  "nonce": "..."
}
- Token expiry: ~32400s ≈ 9h. Client service must re-authenticate silently before expiry, not fail at hour nine during demo. Refresh on 401/timeout or pre-emptive >5min buffer.
- Recommended pattern: cache token with expiry timestamp, auto-refresh on use.

## Base URLs
- API base: https://api-m.sandbox.paypal.com
- Payouts GET base: https://api.sandbox.paypal.com/v1/payments/payouts/{id}
- Orders GET base: https://api.sandbox.paypal.com/v2/checkout/orders/{id}
- Sandbox UI: https://sandbox.paypal.com

## Orders v2 — Working shapes

Create order
POST /v2/checkout/orders
Headers: Content-Type: application/json, Authorization: Bearer <token>
Body:
{
  "intent": "CAPTURE",
  "purchase_units": [{
    "amount": {"currency_code":"USD","value":"10.00"}
  }]
}
Actual response:
{
  "id": "8Y0205123S588673J",
  "status": "CREATED",
  "links": [...]
}

Get order
GET /v2/checkout/orders/{id}
Actual response:
{
  "id": "...",
  "intent": "CAPTURE",
  "status": "CREATED",
  "purchase_units": [{
    "reference_id":"default",
    "amount":{"currency_code":"USD","value":"10.00","breakdown":{}},
    "payee":{"email_address":"sb-cw14153289646@business.example.com","merchant_id":"KGK8V55CGUJUG"}
  }],
  "create_time":"2026-10-09T20:18:11Z",
  "links":[...]
}
Capture: POST /v2/checkout/orders/{id}/capture

Quirks:
- Status starts CREATED. Approval required to move to APPROVED.
- Payee defaults to sandbox business account.
- Links use both api-m.sandbox and api.sandbox hosts.

## Payouts v1 — Working shapes

Create batch
POST /v1/payments/payouts
Body:
{
  "sender_batch_header":{"sender_batch_id":"test-batch-001","email_subject":"Test payout"},
  "items":[{
    "recipient_type":"EMAIL",
    "amount":{"value":"1.00","currency":"USD"},
    "receiver":"sb-cw14153289646@business.example.com",
    "note":"Test"
  }]
}
Actual response:
{
  "batch_header":{"payout_batch_id":"R6GPQMW6MKX6Q","batch_status":"PENDING","sender_batch_header":{...}},
  "links":[...]
}

Get batch
GET /v1/payments/payouts/{payout_batch_id}
Actual response:
{
  "batch_header":{
    "payout_batch_id":"R6GPQMW6MKX6Q",
    "batch_status":"PROCESSING",
    "time_created":"2026-10-09T20:18:46Z",
    "sender_batch_header":{...},
    "funding_source":"BALANCE",
    "amount":{"currency":"USD","value":"1.00"},
    "fees":{"currency":"USD","value":"0.25"}
  },
  "items":[{
    "payout_item_id":"KW37Q3MVVVR9W",
    "transaction_status":"PENDING",
    ...
  }]
}

Quirks:
- sender_batch_id must be unique per request, idempotent key.
- batch_status progresses PENDING → PROCESSING → SUCCESS/FAILED.
- fees returned in GET response.
- recipient_type EMAIL works with sandbox business email.

## Known Quirks
1. Invoicing API scope not provisioned to this sandbox account — use Orders API as rail.
2. Token scope includes invoicing but endpoint unavailable.
3. Orders API returns links with api.sandbox host, token host is api-m.sandbox.
4. Payouts sandbox allows same-account payouts for testing; fees still apply in response.

## Docs refs
- Orders v2 API: https://developer.paypal.com/api/orders/v2
- Payouts v1 API: https://developer.paypal.com/api/payments.payouts-batch/v1
- REST integration: https://developer.paypal.com/api/rest/integration/orders-api

Last validated: 2026-10-09 sandbox client-test
