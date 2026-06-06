# Security Policy

Lux Night is an early-stage open-source project for ticketing and venue operations. It handles payment workflows, customer data, access control, invite codes, and ticket redemption, so security reports are taken seriously.

## Responsible Disclosure

Please do not open a public GitHub issue for a suspected vulnerability.

Report security concerns privately by emailing the maintainers or, if GitHub private vulnerability reporting is enabled for this repository, by using GitHub's security advisory flow.

When reporting, include:

- A clear description of the issue.
- Steps to reproduce or a proof of concept.
- The affected app, package, route, migration, or policy.
- Impact and suggested mitigation if known.
- Whether credentials, payment flows, ticket redemption, customer data, or admin access are involved.

Please give maintainers reasonable time to investigate and patch before public disclosure.

## Security-Sensitive Areas

Pay special attention to these areas when reviewing or contributing:

- Stripe checkout session creation, payment amount calculation, metadata, success/cancel URLs, and checkout state transitions.
- Stripe webhook processing, signature verification, idempotency, replay handling, order updates, ticket issuance, refunds, and expiration handling.
- Supabase RLS policies, RPC functions, auth helpers, and any route that uses `SUPABASE_SERVICE_ROLE_KEY`.
- Service-role usage in admin, merchant, invite, customer, ticket, upload, and webhook routes.
- Rate limiting for checkout, invite validation, invite redemption, ticket redemption, auth-sensitive routes, and debug endpoints.
- Ticket redemption logic, including public token lookup, venue scoping, validity windows, duplicate scans, refunded tickets, and staff authorization.
- Invite code generation, validation, usage limits, expiration, revocation, venue/region scope, and race conditions.
- Admin and merchant role checks, allowlists, workspace selection, and cross-venue access boundaries.

## Secret Handling

Never commit or disclose:

- Supabase service-role keys.
- Stripe secret keys.
- Stripe webhook signing secrets.
- Upstash Redis tokens.
- Google Maps API keys.
- Admin debug keys.
- Production customer, order, ticket, or payment data.

Use `.env.local` for local secrets and configure deployment secrets in your hosting provider.

## Supported Versions

This repository is currently early-stage. Security fixes are expected to target the default branch unless the maintainers publish a release policy.
