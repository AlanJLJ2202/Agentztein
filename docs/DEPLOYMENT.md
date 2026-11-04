# Deployment and configuration

This guide holds the operational setup that used to live in the README: the cloud-only deployment flow (ADR-015),
sign-in with Google or email (ADR-019, ADR-020, ADR-025), the per-user Meta key, optional sound and voice, site
traffic (ADR-034), and the pointers to code evolution (ADR-026) and memory (ADR-031). Variable names are listed
here. Values never go in the repository.

- [1. Cloud flow (no local machine)](#1-cloud-flow-no-local-machine)
- [2. Sign-in (Google or email with a code)](#2-sign-in-google-or-email-with-a-code)
- [3. The Meta key (bring your own)](#3-the-meta-key-bring-your-own)
- [4. Sound and voice (optional, ElevenLabs)](#4-sound-and-voice-optional-elevenlabs)
- [5. Site traffic (optional)](#5-site-traffic-optional)
- [6. Code evolution and memory](#6-code-evolution-and-memory)
- [7. Environment variables at a glance](#7-environment-variables-at-a-glance)
- [8. Running locally (optional)](#8-running-locally-optional)

## 1. Cloud flow (no local machine)

The project can be operated from the browser:

1. **Supabase.** Create the project. In *Project Settings → Data API*, remove `public` from the exposed schemas.
   Download the CA certificate from *Database Settings → SSL*.
2. **GitHub → Settings → Environments → `production`.** Add the secrets `DATABASE_URL` (the *Session pooler*
   connection string, port 5432) and `DATABASE_SSL_CA` (the full contents of the `.crt` certificate).
3. **GitHub → Actions → `db-migrate` → Run workflow**, typing `migrate`. Migrations only add. They never edit
   history.
4. **Vercel.** Import the repository. `vercel.json` already says how to build the site (`pnpm build:site`): the
   landing (`apps/landing`) at `/`, the app (`apps/app`) at `/app/` and the panel (`apps/panel`) at `/panel/`.
   Production deploys from `main`. Every branch gets its own preview URL.
5. Every push runs `ci` (lint, typecheck, dataset verification, tests with an ephemeral Postgres 16, agent-core
   tests and the panel and app builds, all through `pnpm check`).
6. **Code evolution (optional).** Each user runs it with their own Meta key. The server needs `AGENT_GH_TOKEN`,
   `AGENT_GH_REPO` and `EVOLVE_CI_SECRET` in Vercel, the same `EVOLVE_CI_SECRET` as a repository secret, and
   migration `0008`. Steps in [`EVOLVE.md`](EVOLVE.md).
7. **Memory and dreams.** Run `db-migrate` for migration `0009` (lessons and dreams). No new keys are needed: it
   dreams with the user's same Meta key (ADR-031).

## 2. Sign-in (Google or email with a code)

The app at `/app/` signs people in with Supabase Auth. Google sign-in uses Google's official button (Google
Identity Services). The ID token goes to Supabase with `signInWithIdToken` and a nonce, and Supabase verifies it.
On Vercel previews, where hosts change and can't be registered as Google origins, the app falls back to Supabase's
redirect flow.

1. **Google Cloud Console** (console.cloud.google.com), in a new or existing project:
   - *Google Auth Platform → Branding:* app name (Agentztein), support email, optional logo. Under *Authorized
     domains*, your production domain and `<project>.supabase.co`.
   - *Audience:* type **External** and **Publish app** (in *Testing* mode only test users can sign in).
   - *Data Access:* only the basic scopes `openid`, `email` and `profile` (they don't require Google
     verification).
   - *Clients → Create client → Web application:*
     - *Authorized JavaScript origins* (for the Google button): `https://<domain>` and `http://localhost:5173`.
     - *Authorized redirect URIs* (redirect flow, used by previews): `https://<project>.supabase.co/auth/v1/callback`.
     - Copy the **Client ID** and the **Client Secret**.
2. **Supabase → Authentication → Sign In / Providers:**
   - **Google:** enable it with the Client ID and Client Secret from step 1 (leave *Skip nonce checks* off).
     With *Allow new users to sign up* on (Authentication → Sign In / Providers → User Signups), the same button
     registers first-time users: the account is created with their Google name, email and photo.
   - **Email:** enabled, with *Confirm email* on and *Email OTP length* = 6.
3. **Supabase → Authentication → Emails:** paste the templates from `supabase/templates/` into *Confirm signup*
   and *Reset password*. They use `{{ .Token }}`, so the user receives a 6-digit code instead of a link.
   Supabase's built-in email sender has a very low hourly limit. For production, configure your own SMTP
   (*Authentication → Emails → SMTP Settings*, e.g. Resend or SES).
4. **Supabase → Authentication → URL Configuration:** *Site URL* = the production domain. Under *Redirect URLs*,
   add `https://<domain>/app/` and `https://*-<team>.vercel.app/app/` (previews).
5. **Vercel → Settings → Environment Variables:** `GOOGLE_CLIENT_ID` (public: the same Client ID as step 1),
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public), `DATABASE_URL` (*Transaction pooler*, port 6543),
   `DATABASE_SSL_CA` and `KEYS_ENCRYPTION_SECRET` (32+ random characters, e.g. `openssl rand -base64 48`).
   If any is missing, `/app/` says which.
6. **Check Google:** run `pnpm auth:check` with `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `GOOGLE_CLIENT_ID` set in
   the environment, or open `/api/config?check=google`. It confirms that Google is enabled in Supabase and that
   Supabase and the button use the same Client ID. If not, it says what to fix (otherwise Supabase would reject
   the token with "Unacceptable audience").
7. Run `db-migrate` to create the `app` schema (migrations `0005`, `0006` and `0007`: keys, notes, budget, the
   agent's skills and the harness log). It is not exposed through Supabase's Data API.

## 3. The Meta key (bring your own)

Agentztein's model calls go only to Meta. Each user pastes their own **Meta Model API** key
(`https://api.meta.ai/v1`, OpenAI-compatible, created at dev.meta.ai). It replaced the Llama API (retired on
6 July 2026) and serves the Muse models. At the time of writing it is a public developer preview for developers in
the United States.

- The key is verified with Meta, encrypted with AES-256-GCM (bound to the user and the provider as additional
  data) and never returns to the browser. The app only shows its last four characters.
- By default the newest standard Muse Spark model the key lists is used. `-contributor` models are never chosen
  automatically, because Meta may train on their data.
- Each user has a monthly budget (`app.user_limits`, $5 by default, adjustable from $0.50 to $1,000). Every call's
  worst case is checked against it before calling, and every call is logged in `app.harness_runs`.
- Buying AI credits inside the app is planned for a later phase.

## 4. Sound and voice (optional, ElevenLabs)

ElevenLabs is a third-party service, not a Meta model. It is used in two independent places:

**Landing sound (deployer's key).** The landing plays footsteps, coil discharges, doors, the harness alarm and
Agentztein's voice saying its fixed lines (English and Spanish). To use ElevenLabs, add `ELEVENLABS_API_KEY` in
Vercel (and `ELEVENLABS_VOICE_ID` for a different voice; the default is the premade voice "George"). The key stays
on the server: `/api/audio` only generates the sounds and lines in the closed list of
`api/_data/audio-catalog.js` (nobody can request their own text), and the CDN caches each clip for a year, so each
one is paid for once. Without a key, the site synthesizes its own effects in the browser and the lines appear only
in the speech bubble. The speaker button (bottom left) turns sound on and off. It starts on the first touch unless
you muted it.

**In-app read-aloud (user's own key).** In the app, answers are read aloud with the browser's speech synthesis by
default. A user can instead connect their own ElevenLabs key (stored encrypted like the Meta key, as
`provider = 'elevenlabs'`). Those calls are billed to the user's ElevenLabs account, not to their Meta budget
(ADR-029).

## 5. Site traffic (optional)

The landing and the app count visits in `app.visit_events` (migration `0010`, ADR-034): which landing sections each
visitor reached, whether they played with the 3D lab, which button they clicked to enter, whether they opened the
app and signed in, and whether they then saved a key and ran the agent.

- No cookies, no IP address and no fingerprinting. The browser keeps a random id, the country comes from Vercel and
  the device is reduced to phone, tablet or computer. Bots are discarded, and nothing is sent with *Global Privacy
  Control*, *Do Not Track* or `?notrack=1`.
- To see it, add `ADMIN_EMAILS` (comma-separated) in Vercel and run `db-migrate`. The app shows a **Traffic** tab
  only to those accounts, and their own browser stops being counted.
- To exclude another browser, open the site once with `?notrack=1` (`?notrack=0` reverts it). For campaigns, use
  `?utm_source=…&utm_medium=…&utm_campaign=…` in links.
- There is no automatic retention. If the table grows, delete old rows with
  `DELETE FROM app.visit_events WHERE created_at < now() - interval '13 months'`.

## 6. Code evolution and memory

- **Code evolution:** full setup (migration, shared secret, fine-grained GitHub token, optional caps and Muse Code
  installer variables), costs and remaining risks are in [`EVOLVE.md`](EVOLVE.md).
- **Memory and dreams:** migration `0009`. No extra configuration. Design in ADR-031
  ([`DECISIONS.md`](DECISIONS.md)).

## 7. Environment variables at a glance

Names only. Set values in Vercel (server), GitHub (Actions) or a local `.env` that is never committed.

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel, GitHub `production` env, local | Postgres connection (Transaction pooler for Vercel, Session pooler for migrations) |
| `DATABASE_SSL_CA` | Vercel, GitHub `production` env | Supabase CA certificate (empty for local Postgres) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Vercel | Supabase project URL and public anon key (served to the app by `/api/config`) |
| `GOOGLE_CLIENT_ID` | Vercel | Google OAuth client id for the official button (public) |
| `KEYS_ENCRYPTION_SECRET` | Vercel | Encrypts users' API keys. Changing it makes saved keys unreadable |
| `ADMIN_EMAILS` | Vercel | Accounts that see the Traffic tab |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Vercel (optional) | Landing sound effects and fixed voice lines |
| `AGENT_GH_TOKEN`, `AGENT_GH_REPO` | Vercel (optional) | Dispatch the `evolve` workflow (fine-grained token, Actions read and write only) |
| `EVOLVE_CI_SECRET` | Vercel and GitHub repo secret (optional) | Shared secret between the app and the `evolve` workflow |
| `EVOLVE_APP_URL`, `EVOLVE_MAX_USD`, `EVOLVE_DAILY_RUNS` | Vercel (optional) | Where CI reports, the per-run cap ($2 default) and runs per user per day (3 default) |
| `GITHUB_TOKEN` | Vercel (optional) | Raises the radar's GitHub search rate limit (falls back to `AGENT_GH_TOKEN`) |
| `META_API_KEY` | GitHub repo secret (optional) | Lets `agent-gate` examine PRs that change the platform core |
| `MUSE_INSTALL_URL`, `MUSE_INSTALL_SHA256`, `MUSE_EXEC_FLAGS` | GitHub repo variables (optional) | Muse Code installer and flags for the `evolve` workflow |

## 8. Running locally (optional)

Requirements: Node 22 (≥ 22.12), pnpm 10, PostgreSQL 16 (through `docker compose up` or a local install).

```bash
pnpm install
```

```bash
docker compose up -d postgres
```

```bash
cp .env.example .env && export DATABASE_URL=postgres://skillab:skillab@localhost:5432/skillab
```

```bash
pnpm db:migrate
```

```bash
pnpm check
```

`pnpm check` runs lint, typecheck, dataset verification, the Vitest suite, the agent-core tests and the panel and
app builds. Without `DATABASE_URL`, the Postgres tests are marked as skipped (visibly) and the rest still run.

Dataset and environment tools:

```bash
pnpm datasets:generate
```

```bash
pnpm env:conflict
```

```bash
pnpm datasets:review
```

`datasets:generate` writes `adaptation/`, `validation/` and `sealed/test/` plus the manifest.
`env:conflict` shows the A/B conflict and the R1→R2 effect with reference oracles. `datasets:review` regenerates
[`GROUND_TRUTH_REVIEW.md`](GROUND_TRUTH_REVIEW.md) for human review.

The authenticated app depends on the serverless functions in `api/` and on Supabase. The documented way to run it
end to end is a Vercel deployment (section 1). `pnpm --filter @skillab/app dev` serves only its front end.
