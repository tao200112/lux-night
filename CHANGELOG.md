# Changelog

All notable changes to Lux Night will be documented in this file.

This project is early-stage. Version labels are intended to communicate project maturity and repository milestones, not production adoption.

## v0.1.0-alpha

### Added

- Open-source readiness pass for positioning Lux Night as a self-hostable nightlife and event ticketing platform.
- Professional README with project status, architecture, local setup, Supabase setup, Stripe checkout/webhook setup, security notes, roadmap, contributing, and license sections.
- MIT license, contributing guide, security policy, issue templates, and GitHub Actions CI workflow.
- Monorepo documentation covering the customer, merchant/staff, and admin applications.
- Self-hosting documentation for environment variables, Supabase, Stripe, webhook URLs, local development, and production deployment.
- Codex for Open Source support document describing how Codex can help maintain the project.
- Root package metadata for open-source discoverability while keeping the workspace private for monorepo safety.

### Existing Platform Capabilities Documented

- `apps/customer-web` for customer discovery, checkout, wallet, orders, profile, public tickets, and redemption links.
- `apps/internal-web` for merchant/staff operations, ticket scanning, manual lookup, invite flows, staff management, and event/change requests.
- `apps/admin-web` for merchants, customers, orders, approvals, invites, exports, regions, events, and settings.
- Stripe Checkout integration and webhook-based fulfillment.
- Ticket wallet, QR-backed tickets, scanning, and manual lookup workflows.
- Invite code validation, redemption, usage limits, and operational notes.
- Supabase migrations, Auth, RLS-aware access patterns, RPC usage, and service-role-sensitive server routes.
- Security and rate-limit documentation for payment, webhook, RLS, ticket redemption, and invite flows.

### Notes

- This alpha milestone does not claim external adoption, production usage, downloads, stars, testimonials, or community contributors.
- The project still needs stronger automated tests and security review before production use.
