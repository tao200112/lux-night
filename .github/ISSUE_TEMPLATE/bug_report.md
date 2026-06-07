---
name: Bug report
about: Report a reproducible problem in Lux Night
title: "bug: "
labels: bug
assignees: ""
---

## Summary

Describe the bug clearly.

## Affected Area

- [ ] customer-web
- [ ] internal-web
- [ ] admin-web
- [ ] packages/shared
- [ ] packages/security
- [ ] Supabase migrations/RLS/RPC
- [ ] Stripe checkout/webhook
- [ ] Ticket redemption/scanning
- [ ] Invite codes
- [ ] Documentation

## Security-Sensitive Checklist

- [ ] This affects payments, Stripe webhooks, Supabase RLS, service-role usage, rate limiting, ticket redemption, invite codes, auth, or admin access.
- [ ] I removed all secrets, tokens, customer data, payment data, and private URLs from this report.
- [ ] If this may be a vulnerability, I will report it privately instead of posting exploit details publicly.

## Steps to Reproduce

1.
2.
3.

## Expected Behavior

What should have happened?

## Actual Behavior

What happened instead?

## Environment

- OS:
- Node version:
- pnpm version:
- Supabase: local / hosted
- Stripe: test mode / live mode / not configured

## Logs or Screenshots

Paste relevant logs or screenshots here. Remove all secrets, tokens, customer data, payment data, and private URLs.

## Additional Context

Anything else maintainers should know?
