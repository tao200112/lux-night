# Contributing to Lux Night

Thanks for your interest in Lux Night. This project is early-stage and aims to become a serious open-source foundation for self-hosted nightlife and event ticketing.

## Local Setup

1. Fork and clone the repository.

   ```bash
   git clone https://github.com/<your-username>/lux-night.git
   cd lux-night
   ```

2. Install dependencies.

   ```bash
   pnpm install
   ```

3. Copy environment variables.

   ```bash
   cp .env.example .env.local
   ```

4. Start Supabase locally if you are working on database-backed features.

   ```bash
   pnpm supabase:start
   pnpm supabase:reset
   ```

5. Run the relevant app.

   ```bash
   pnpm dev:customer
   pnpm dev:internal
   pnpm dev:admin
   ```

## Branch Guidelines

Use short, descriptive branch names:

```text
feat/ticket-redemption-audit
fix/stripe-webhook-idempotency
docs/self-hosting-supabase
chore/ci-cache
```

Prefer focused branches that address one feature, bug, or documentation topic.

## Commit Guidelines

Use clear commits that explain the change:

```text
feat: add ticket redemption audit log
fix: make checkout webhook idempotent
docs: clarify Supabase setup
test: cover invite usage limits
```

Keep generated files, local environment files, and unrelated formatting churn out of commits.

## Issues

Before opening an issue, search existing issues and documentation. When filing a bug, include:

- What happened.
- What you expected.
- Steps to reproduce.
- The affected app or package.
- Relevant logs or screenshots with secrets removed.
- Whether you are using local Supabase, hosted Supabase, Stripe test mode, or production-like infrastructure.

For feature requests, describe the operator or customer problem first, then the proposed behavior.

## Pull Requests

Pull requests should be small enough to review carefully. Please include:

- A concise summary of the change.
- The motivation or issue it addresses.
- Screenshots or recordings for UI changes.
- Database migration notes for schema or policy changes.
- Security considerations for payment, webhook, auth, RLS, service-role, invite, or ticket redemption changes.
- Verification steps, including commands run.

Before opening a PR, run:

```bash
pnpm lint
pnpm build
```

If your change adds a new script, test, migration, or manual verification step, document it in the PR.

## Security-Sensitive Changes

Changes to Stripe checkout, webhooks, Supabase RLS, service-role usage, rate limiting, ticket redemption, invite codes, authentication, or authorization need extra care. Prefer small PRs, explicit tests, and clear notes about failure modes.

Do not include real credentials, customer data, payment data, Supabase secrets, Stripe secrets, webhook secrets, or private logs in issues or pull requests.
