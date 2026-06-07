# Codex for Open Source

Lux Night is a good fit for Codex assistance because the project combines ordinary product work with security-sensitive infrastructure: payments, webhooks, Supabase RLS, service-role routes, invite codes, ticket redemption, and multiple Next.js apps in one monorepo.

Codex/API credits would help maintain the project in practical, reviewable ways.

## Automated Issue Triage

Codex can help classify new reports by affected area: customer app, merchant/staff app, admin app, Supabase migrations/RLS/RPC, Stripe checkout/webhooks, ticket redemption, invite codes, setup, documentation, or CI.

That would help maintainers respond faster without pretending there is a large support team behind the project.

## PR Review Assistance

The repository has repeated patterns across three apps. Codex can review pull requests for consistency across customer, internal, admin, shared, and security packages, especially when a change touches shared auth or data helpers.

Useful review targets include:

- Route authorization.
- Server-only secret handling.
- Cross-venue data access.
- Error handling and retry behavior.
- Documentation drift.

## Security-Sensitive Code Review

Lux Night needs careful review around:

- `SUPABASE_SERVICE_ROLE_KEY` usage.
- Admin and merchant authorization boundaries.
- Supabase RLS policies and RPC functions.
- Public ticket token lookup.
- Staff ticket redemption.
- Invite code validation, redemption, and usage limits.

Codex would help produce repeatable review checklists and identify routes or policies that deserve human maintainer attention.

## Stripe Webhook Edge-Case Testing

Webhook fulfillment is one of the most important parts of the project. Codex can help generate and maintain tests for:

- Duplicate Stripe events.
- Webhook retries.
- Failed partial fulfillment.
- Expired checkout sessions.
- Refund events.
- Race conditions around sold counts and invite usage.
- Signature verification failures.

## Supabase RLS Review

The project relies on Supabase Auth, Postgres, RLS policies, RPC functions, and server-side service-role operations. Codex can assist with structured RLS reviews by comparing intended access rules against migrations, route handlers, and shared auth helpers.

The goal is not to replace human security review, but to make review coverage more systematic.

## Release Notes

Codex can generate draft release notes from commits and pull requests while keeping the wording honest: no fake adoption claims, no invented metrics, and clear notes about migrations, security-sensitive changes, and operator actions.

## Documentation Maintenance

As the platform evolves, Codex can keep README, self-hosting docs, architecture docs, environment variable references, and security notes aligned with the codebase.

This is especially useful for an early-stage project where setup details change quickly and stale docs can create security or deployment mistakes.
