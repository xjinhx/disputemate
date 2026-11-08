# DisputeMate

AI-assisted transaction dispute management for a Singapore digital bank. IS419 Group 5 prototype.

Customers spot disputable transactions, prepare a dispute with AI help, submit it for human approval and track it to resolution. Bank reviewers approve, reject or request more information. Administrators manage routing rules, deadlines, categories and roles.

> Prototype only. Bank data is simulated, submissions are simulated and no money moves.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind CSS 4 |
| Data, auth, files | Supabase (Postgres with row level security, Supabase Auth, private Storage bucket) |
| AI | Anthropic Claude via `@anthropic-ai/sdk`, structured outputs, optional |
| Hosting | Vercel (production from `main`, previews for branches and PRs) |
| Tests | Vitest (deterministic domain logic), GitHub Actions CI |

## What is built (MVP, PRD section 1.5)

- **Auth and roles** (FR-01): Supabase email/password, sessions refreshed in `src/proxy.ts`, role checks on every page and action. Staff roles can only be granted by an admin.
- **Transaction dashboard** (FR-02): history with search and date/status filters, dispute indicators, duplicate-dispute guard.
- **Detection** (FR-03): duplicate charges (same merchant and amount within a configurable window) and failed-but-debited transfers. Alerts are confirmed or dismissed by the customer, never auto-filed.
- **Dispute initiation** (FR-04): categories, category questions, AI category recommendation the customer can accept or ignore.
- **Evidence** (FR-05): uploads to a private bucket (signed URLs only), AI extraction labelled as unverified, missing-info checklist.
- **AI preparation** (FR-06): structured, editable summary traceable to sources, with a deterministic template fallback when AI is off or fails.
- **Routing and deadlines** (FR-07): deterministic rules engine, separate card and e-payment rules, escalation when uncertain.
- **Human review** (FR-08): queue with priority, full case view, approve, reject, request info, return for correction, escalate to fraud, recategorise, notes.
- **Simulated filing** (FR-09): reference numbers, idempotent filing guarded by status checks and a unique constraint.
- **Tracking, notifications, decisions** (FR-10 to FR-12): timeline, deduplicated in-app notifications, bank decision shown verbatim with an AI plain-language version.
- **Admin** (section 5.2): stats, AI monitoring, detection settings, routing rules, categories, users, audit log.

### What the AI never does

Deadlines, routing, validation, status transitions, permissions, approvals and liability are all deterministic code in `src/lib/domain`. The AI only recommends, extracts and summarises, and everything it produces is labelled and editable.

## Project structure

```
src/
  app/
    app/            customer screens (home, transactions, disputes, updates)
    review/         reviewer dashboard, queue, case review
    admin/          admin overview, rules, categories, users, audit
    actions/        server actions (customer, reviewer, admin, auth)
    api/            REST endpoints (health, transactions, disputes)
  components/       UI building blocks
  lib/
    domain/         deterministic business rules (tested)
    supabase/       server, admin and proxy clients
    ai.ts           Claude integration with safety rules
  proxy.ts          session refresh and route protection
supabase/migrations schema, RLS, triggers, reference data
scripts/seed.ts     demo accounts and a sample case
tests/              unit tests
docs/DEPLOYMENT.md  Supabase and Vercel setup
```

## Local development

Prerequisites: Node 20.9+ and a Supabase project (free tier is fine).

```bash
git clone https://github.com/<you>/disputemate.git
cd disputemate
npm install
cp .env.example .env.local   # fill in your Supabase keys
```

1. **Database.** In the Supabase SQL editor, run the files in `supabase/migrations/` in order. Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.
2. **Auth.** For quick demos, turn off "Confirm email" under Authentication > Providers > Email, or keep it on and set the Site URL (see deployment docs).
3. **Demo data.** `DEMO_PASSWORD='something-strong' npm run seed` creates `customer@`, `reviewer@` and `admin@demo.disputemate.app` plus a sample case.
4. **Run.** `npm run dev` and open http://localhost:3000.

Every new sign-up gets 12 sample transactions, including a duplicate charge pair and a failed FAST transfer, so detection has something to find.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route types and TypeScript |
| `npm test` | Unit tests for detection, routing, deadlines, status machine, validation |
| `npm run seed` | Demo accounts and sample case |

## Demo walkthrough (PRD section 11)

- **Scenario A, duplicate:** sign in as the customer, accept the "Possible duplicate charge" alert on Home, add details, generate the summary, submit. Sign in as the reviewer, approve. The customer sees a `DM-` reference and can track it.
- **Scenario B, unauthorised:** on a transaction tap "I don't recognise this". Mentioning an OTP or a caller triggers scam indicators and fraud escalation.
- **Scenario C, more info:** as reviewer, "Request info" with a note. The customer is notified, uploads a file and resubmits.
- **Scenario D, tracking:** My Disputes shows status, timeline, deadline and the final decision.

## Branching

| Branch | Purpose |
|---|---|
| `main` | Stable, deploys to production |
| `develop` | Integration of completed features |
| `feature/*` | Feature work, gets a Vercel preview |
| `fix/*` | Bug fixes |

## Security notes

- `.env*` files are git-ignored. Only `.env.example` is committed.
- `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are server-only and never reach the browser.
- Customers have read-only RLS access to their own rows. All writes go through server actions that check ownership and role first.
- Evidence lives in a private bucket and is served through 10-minute signed URLs.
- Uploaded documents are treated as untrusted input in AI prompts.
- Seeded routing windows and reason codes are placeholders to be confirmed against real bank and MAS procedures.
