# Self-Hosting Lux Night

This guide explains the main steps for running Lux Night with your own Supabase and Stripe accounts.

Lux Night is early-stage software. Review authentication, RLS policies, payment flows, and operational controls before using it for real events.

## 1. Prerequisites

- Node.js 18 or newer.
- pnpm 8 or newer.
- A Supabase project or local Supabase CLI.
- A Stripe account.
- Stripe CLI for local webhook testing.
- A deployment platform that can run Next.js apps.

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Configure Environment Variables

Start from the example file:

```bash
cp .env.example .env.local
```

Minimum configuration:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

Recommended production additions:

```env
ADMIN_EMAIL_ALLOWLIST=owner@example.com,operator@example.com
UPSTASH_REDIS_REST_URL=your_upstash_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
RATE_LIMIT_PREFIX=luxnight
```

Optional integrations:

```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com
REDEEM_EARLY_MINUTES=0
REDEEM_LATE_MINUTES=30
```

Never expose server-only values in browser code. Anything without `NEXT_PUBLIC_` should be treated as a secret.

## 4. Supabase Setup

### Local Supabase

Start Supabase:

```bash
pnpm supabase:start
```

Apply migrations and reset local data:

```bash
pnpm supabase:reset
```

Check local credentials:

```bash
pnpm supabase:status
```

Copy the local API URL, anon key, and service-role key into `.env.local`.

### Hosted Supabase

Create a Supabase project, then link it:

```bash
pnpm supabase:link <project-ref>
```

Push migrations:

```bash
pnpm supabase:push
```

In the Supabase dashboard:

- Confirm Auth settings and redirect URLs for each deployed app.
- Review RLS policies.
- Keep the service-role key private.
- Configure storage buckets if you use poster uploads.

## 5. Stripe Setup

Create or use a Stripe account in test mode first.

Set:

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

For local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the generated `whsec_...` value into:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

For production, create a Stripe webhook endpoint:

```text
https://your-customer-domain.example/api/stripe/webhook
```

Enable the payment events your deployment handles, then test checkout, webhook delivery, ticket issuance, expiration, refunds, and duplicate event retries.

## 6. Run Locally

Run one app at a time:

```bash
pnpm dev:customer
pnpm dev:internal
pnpm dev:admin
```

Default ports:

- Customer app: `http://localhost:3000`
- Internal app: `http://localhost:3001`
- Admin app: `http://localhost:3002`

## 7. Production Deployment

Deploy the three apps separately:

- `apps/customer-web`
- `apps/internal-web`
- `apps/admin-web`

Each deployment should receive the environment variables it needs. At minimum, all apps need Supabase public values. Server routes that perform privileged operations need `SUPABASE_SERVICE_ROLE_KEY`. Checkout and webhook routes need Stripe server secrets.

Recommended production setup:

- Use separate domains or subdomains for each app.
- Set `NEXT_PUBLIC_APP_URL` to the public customer app URL.
- Configure Supabase Auth redirect URLs for all deployed auth callback routes.
- Configure Stripe webhook URL to the customer app webhook route.
- Restrict admin access with `ADMIN_EMAIL_ALLOWLIST`.
- Enable Redis-backed rate limiting for public and sensitive routes.
- Monitor webhook failures and order/ticket fulfillment errors.
- Rotate keys after staging demos or shared testing.

## 8. Pre-Launch Checklist

- `pnpm lint` passes.
- `pnpm build` passes.
- Supabase migrations are applied.
- Supabase RLS policies are reviewed.
- Stripe test checkout completes successfully.
- Stripe webhook signatures are verified.
- Duplicate webhook delivery does not create duplicate tickets.
- Ticket redemption rejects wrong venue, duplicate, expired, refunded, or unauthorized scans.
- Invite codes enforce usage limits, expiration, revocation, and venue/region scope.
- Admin routes are restricted to trusted operators.
- Service-role keys are only present in server environments.
