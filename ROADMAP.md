# Roadmap

Lux Night is an early-stage, actively maintained open-source project. This roadmap focuses on the work needed to make the platform safer, easier to self-host, and more useful for real venue and event operations.

The items below are not promises of a specific release date. They are the current maintenance priorities.

## Reliability and Test Coverage

- Add webhook retry and idempotency tests for duplicate Stripe events, delayed delivery, partial processing failures, refunds, expiration, and replay attempts.
- Add ticket redemption edge-case tests for wrong venue, duplicate scan, expired validity window, early/late grace windows, refunded tickets, unauthorized staff, and public token lookup.
- Add invite code tests for usage limits, expiration, revocation, region/venue scope, and race conditions.
- Add checkout tests for price calculation, ticket availability, invite metadata, and success/cancel URL handling.

## Security

- Complete a Supabase RLS audit across public, authenticated, merchant, staff, and admin access paths.
- Review every `SUPABASE_SERVICE_ROLE_KEY` usage and document why each privileged route needs it.
- Expand rate limiting coverage for checkout, invite validation, invite redemption, ticket redemption, auth-sensitive routes, and debug endpoints.
- Add security regression tests for webhook signature verification and unauthorized admin/merchant access.

## Self-Hosting

- Improve Docker Compose support for local app, Supabase, and supporting services.
- Add clearer production deployment recipes for separate customer, internal, and admin deployments.
- Provide safer demo seed data that does not resemble real customer/payment records.
- Add a one-command local onboarding path for new contributors.

## CI and Release Process

- Improve CI coverage across lint, type-check, build, database migration validation, and targeted route tests.
- Add release automation for changelog generation, version tagging, and GitHub releases.
- Add dependency update checks and security scanning.
- Track warning debt from existing lint output and gradually tighten rules.

## Product and UX

- Polish accessibility across customer, merchant/staff, and admin workflows.
- Improve mobile UX for ticket wallet, scanning, manual lookup, and merchant operations.
- Improve empty states, loading states, and error recovery in operational screens.
- Add clearer operator-facing setup and diagnostics for Stripe, Supabase, webhooks, and admin access.
