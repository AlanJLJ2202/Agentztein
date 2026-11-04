<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/landing/img/logo-light.webp">
    <img src="apps/landing/img/logo.webp" alt="Agentztein" width="420">
  </picture>
</p>

<h3 align="center">Self-improvement is easy to claim. Hard to prove.</h3>

<p align="center">
  Agentztein is an experimental self-evolving AI agent powered by Meta's Muse models, designed to make autonomous
  improvement measurable, testable, and reversible.
</p>

<p align="center">
  <a href="#how-it-works">How it works</a> ·
  <a href="#powered-by-meta">Powered by Meta</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#evaluation-methodology">Evaluation</a> ·
  <a href="#current-implementation-status">Status</a> ·
  <a href="#limitations-and-research-integrity">Limitations</a> ·
  <a href="#getting-started">Getting started</a>
</p>

---

> **In one sentence:** the point of Agentztein is not to make an AI agent that can change itself. It is to find
> out how those changes can be measured, evaluated, and trusted.

## Why Agentztein exists

AI agents can now write code, research, use tools and work through long tasks. The obvious next step is to let them
improve themselves: write a new skill, change their instructions, rewrite part of their own code.

But a change that helps an agent in one situation can quietly hurt it in another. A rule that fixes one kind of
task can break a different one. Usually nobody notices, because nobody re-checks what the agent could already do.

Agentztein treats self-improvement as a claim that has to be tested before it is accepted. Every proposed change is
measured against what the agent already knows how to do, and it is kept only if it passes explicit rules.

## The problem: improvement versus regression

> **Research question.** How can an autonomous agent improve its own capabilities without silently degrading
> capabilities it already has?

Recent work points at the same gap. Self-evolving agents
[repair failures but struggle to generalize from them](https://arxiv.org/abs/2610.22984) and
[do not behave like continual learners](https://arxiv.org/abs/2610.25858). Most leaderboards report a final score.
They rarely report **interference**: whether getting better at A made the agent worse at B.

Agentztein's evaluation environments are built to expose exactly that. Each exam has two contexts with different
hidden rules, so a rule learned in one context is a trap in the other (see
[Evaluation methodology](#evaluation-methodology)).

The narrower hypothesis inherited from the project's original proposal is:

> *Do skills with an explicit **scope** (where they apply) and **validity** (which rule version they were tested
> under) let an agent adapt to rule changes with less interference than accumulating skills or rewriting global
> instructions?*

The goal is a reproducible protocol and an honest report, including the case where the answer is "no".

## The Agentztein approach

Agentztein does **not** retrain model weights or fine-tune anything. The models are fixed. What evolves is the system
around them:

| Layer that can change | How it changes today | Who approves |
|---|---|---|
| **Skills** (short instructions scoped to one context) | Written by the planner after studying its mistakes, then re-tested | A person, after the harness passes it |
| **Agent-core code** (`solve(task, tools)`) | Rewritten by Muse Code or Forja in GitHub Actions, then judged on a fresh exam | Server-side gate, which can activate it automatically |
| **Memory** (consolidated lessons) | Updated by "dreaming" over finished cycles, under fixed rules | Automatic rules. A person can pin or forget lessons |
| **Decision strategy** (which exam, model and effort) | Chosen per cycle by a director model within a spending cap | Server validates the plan. Nothing persistent changes |
| **Tools** | The director may *propose* new capabilities (vision, web, …) | Proposal only. Nothing is switched on |

### Core principles

1. **Evidence before adoption.** Improvements are evaluated, not assumed.
2. **Context-aware evolution.** Skills carry an explicit scope instead of becoming global instructions.
3. **Regression awareness.** An improvement in one place must not silently degrade another.
4. **Human oversight.** People approve or reject every skill change. *(The code-evolution gate is different: it
   can activate a passing core version automatically, under server-side rules.)*
5. **Reversibility.** Versions are append-only. Skills can be retired and cores rolled back.
6. **Transparent execution.** Model calls, tools, costs, decisions and verdicts are recorded and shown.
7. **Scientific honesty.** Passing a synthetic exam is not evidence of general intelligence or of performance on an
   official benchmark.

## Live demo and project links

| | |
|---|---|
| **Deployment** | Vercel, deployed from `main`: landing at `/`, authenticated app at `/app/`, read-only panel at `/panel/`. *Public URL: to be added.* |
| **Demo video** | *Not yet published.* |
| **Hackathon** | Built for the [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon). *Submission link: to be added.* |
| **Try it** | Sign in to `/app/` with Google or email, then paste your own Meta Model API key. Every call uses your key and your budget. |
| **Docs** | [Deployment](docs/DEPLOYMENT.md) · [Code evolution](docs/EVOLVE.md) · [Decisions (ADRs)](docs/DECISIONS.md) · [Progress log](docs/PROGRESS.md) · [Benchmark research](docs/FRONTERA.md) |

<p align="center">
  <img src="apps/landing/img/app-process.webp" alt="The Process tab: a TL;DR of one cycle with each decision marked, the candidate skill, the harness verdict, and on the side the spend against the cycle's cap, the models called and the lessons recalled." width="760">
  <br>
  <sub>The <b>Process</b> tab of the app. Screenshot of the real interface <b>with sample data</b>: the numbers in it are not experimental results.</sub>
</p>

<a id="how-it-works"></a>

## How it works: the autonomous improvement cycle

A cycle runs inside the app, one step per request, for one signed-in user, with that user's Meta key. Each step is a
single model call, so it fits in a serverless function. The browser drives the loop while the app is open. There is
**no always-on background agent**.

```mermaid
flowchart TD
    S(["Start: a person picks an exam,<br/>or hands the choice to the director"]) --> D{"Enough undigested<br/>cycles? (≥ 3, auto mode)"}
    D -- yes --> DR["Dream: Muse Wonder consolidates<br/>past cycles into lessons"]
    D -- no --> PL
    DR --> PL["Plan (auto mode): Muse Wonder picks<br/>exam, executor model and effort within the cap"]
    S -. manual mode .-> B
    PL --> B["Baseline: the executor (Muse Spark by default)<br/>answers practice + validation with its active skills"]
    B --> G1["Deterministic grader scores<br/>every answer per context"]
    G1 --> P{"Any mistakes?"}
    P -- no --> N(["Done: nothing to learn"])
    P -- yes --> W["Propose: the planner studies practice mistakes<br/>(with answers), recalled lessons and approved<br/>radar ideas, and writes ONE scoped skill"]
    W --> V["Validate: the executor re-answers<br/>the validation set with the candidate"]
    V --> H{"Harness: target context improves<br/>and no other context drops?"}
    H -- no --> R(["Rejected automatically,<br/>kept in the version history"])
    H -- yes --> A{"Awaiting a person"}
    A -- approve --> ACT(["Active: replaces the previous version<br/>for that context, which is retired"])
    A -- reject --> RJ(["Rejected"])
    ACT --> HIST[("History, trace, costs and verdicts<br/>feed later cycles and dreams")]
    R --> HIST
    RJ --> HIST
```

Every model call passes through the **harness** (`api/_lib/harnessed.js`): before calling, the worst-case cost is
checked against the user's monthly budget and the cycle's own cap. After calling, real tokens and cost are logged
append-only in `app.harness_runs`.

### What happens when things go differently

| Situation | Actual behavior |
|---|---|
| **No improvement is needed** | If the baseline answers every practice and validation item correctly, the cycle ends with `nothing-to-learn`. No skill is written. |
| **The planner's answer is unusable** | Unreadable JSON, a context that doesn't exist or an empty skill ends the cycle as `planner-failed`. |
| **A model call or step fails** | The error is saved on the cycle and the phase does not advance. The step can be retried. A step stuck for 3 minutes frees itself. |
| **The candidate fails the harness** | It is marked `rejected` immediately (`harness-rejected`), with its verdict and deltas stored. It cannot be approved. |
| **A person rejects a passing candidate** | It is marked `rejected`. The active skill for that context stays as it was. |
| **The cycle's spending cap is reached** | A call whose worst case doesn't fit the remaining cap ($0.05 to $20 per cycle, $0.50 default) is refused before reaching Meta. The cycle ends cleanly as `run-budget`, and an untested candidate is rejected rather than left waiting. |
| **The monthly budget is reached** | The call is refused before spending (`budget`). Nothing runs until the person raises the budget or the month changes. |
| **An approved skill is retired** | `op: "retire"` moves it to `retired` (rollback). That context then runs with no skill until a new version is approved. Nothing is deleted. |
| **A memory consolidation cycle occurs** | With ≥ 3 finished, undigested cycles, an autonomous cycle dreams first (or a person triggers it, capped at $0.25). Lessons are reinforced, rewritten as new versions or faded by fixed rules. Skills and code are never edited by a dream. |

## Key capabilities

| Capability | What it does | Where |
|---|---|---|
| **Scoped skill evolution** | Writes one skill per cycle for the context with the most mistakes, re-tests it and gates it | `api/agent.js`, `api/_lib/agent.js` |
| **Regression-aware harness** | Requires a gain in the target context and no drop elsewhere beyond one item of noise | `harnessVerdict` in `api/_lib/agent.js` |
| **Human approval and rollback** | Approve or reject passing skills, retire active ones. Versions are frozen by database triggers | `api/agent.js`, migration `0007` |
| **Self-modifying code** | Per-user versions of the agent core, built in CI and judged on a fresh exam | `packages/agent-core`, `scripts/evolve/`, `.github/workflows/evolve.yml` |
| **Sandboxed execution** | User-evolved cores run in a Node child process with the permission model, no environment and no keys | `api/_lib/sandbox.js` |
| **Spending controls** | Monthly budget per user, per-cycle cap, worst-case check before each call, append-only cost log | `api/_lib/harness.js`, `api/_lib/harnessed.js` |
| **Memory and dreams** | Consolidates finished cycles into scoped lessons that later steps recall within a character budget | `api/_lib/memory.js` |
| **Research radar** | Reads Hacker News, arXiv, Hugging Face Papers and GitHub. The user's model triages them, a person approves ideas | `packages/research`, `api/radar.js` |
| **Companion and voice** | Explains each screen, narrates cycles, answers by text or voice | `api/talk.js`, `api/media.js`, `apps/app/src/Companion.tsx` |
| **Observable execution** | TL;DR of each cycle, step-by-step reasoning, a 3D network per run, a knowledge graph, a 3D lab | `apps/app/src/Process.tsx`, `RunGraph.tsx`, `Mind.tsx`, `Lab3D.tsx` |
| **Bilingual interface** | English and Spanish UI. Model-written text can be translated on demand inside the harness | `apps/app/src/i18n.ts`, `api/_lib/translate.js` |
| **Traffic analytics** | Privacy-preserving visit funnel (no cookies, no IP) for the site owners | `api/track.js`, `api/visits.js`, `apps/app/src/Traffic.tsx` |

<a id="powered-by-meta"></a>

## Powered by Meta

Every model call in Agentztein's AI workflow goes to the **Meta Model API** (`https://api.meta.ai/v1`,
OpenAI-compatible), with the signed-in user's own key. Meta's models plan, act, write skills, propose code changes,
build code, listen and draw. The evaluation itself is **not** done by a model: answers are scored by deterministic
code against known answers, so no LLM grades its own work.

| Model | Responsibility in Agentztein | Where | Status |
|---|---|---|---|
| **Muse Wonder** | Director (chooses exam, model and effort in autonomous cycles), planner (writes skills), dreams (memory consolidation), code-change hypotheses | `api/agent.js`, `api/evolve.js` | Implemented. Falls back to the executor model if the key doesn't list Wonder |
| **Muse Spark** | Executor that takes the exams, companion chat, radar triage, translation, exams in CI | `api/agent.js`, `api/talk.js`, `api/radar.js`, `scripts/evolve/bench.ts` | Implemented. Default model: the newest standard Spark id the key lists |
| **Muse Code** (`muse exec`) | Rewrites the agent core inside GitHub Actions, as an unprivileged user | `.github/workflows/evolve.yml` | Experimental. Not yet verified in CI. Falls back to Forja automatically |
| **Forja** | The repository's own fallback coding agent: a Muse model with function calling and five file tools | `scripts/evolve/forja.ts` | Implemented. Not a separate Meta model |
| **Muse Voice Transcribe** | Speech-to-text for talking to the agent (`/v1/asr/transcribe`, WAV 16 kHz mono) | `api/_lib/voice.js`, `apps/app/src/wav.ts` | Implemented. Depends on the key's access |
| **Muse Image** | Draws an emblem for a skill the agent wrote | `api/media.js` | Experimental. Model id `muse-image-1.0` not confirmed for the API. Cost is an estimate |

Notes on access and fallbacks:

- **Access.** The Meta Model API is, at the time of writing, a public developer preview for developers in the
  United States. Voice and image access depend on the key. Errors say so instead of failing silently.
- **Contributor tiers.** `-contributor` models are never selected automatically, because Meta may train on data
  sent to them.
- **Effort levels.** Muse Spark accepts `reasoning_effort` (`minimal` to `xhigh`). Muse Wonder always reasons at
  full depth and is called without it.
- **Prices** used for budgeting come from a catalog in `packages/research/src/meta.js`. Unknown models are priced
  like the most expensive one, so a budget never underestimates.

**Not Meta technologies:** Supabase (database and auth), Google (OAuth), ElevenLabs (optional speech synthesis),
Vercel, GitHub, and the public research sources are third-party services.

<a id="architecture"></a>

## Architecture

```mermaid
flowchart TB
    subgraph PRES["Presentation"]
        LAND["Landing /<br/>Three.js 3D lab"]
        APP["App /app/<br/>React 19 + Vite"]
        PANEL["Panel /panel/<br/>read-only"]
    end

    subgraph API["API · Vercel functions"]
        AGENTAPI["agent.js<br/>cycles · exams · dreams"]
        EVOAPI["evolve.js<br/>evolve-ci.js"]
        RADARAPI["radar.js"]
        TALKAPI["talk.js<br/>media.js"]
        CFG["keys · limits<br/>config · track · visits"]
    end

    subgraph GUARD["Harness and sandbox"]
        HARN["Budget check before<br/>each call · cost log"]
        SBX["Sandboxed agent core<br/>Node permission model"]
    end

    subgraph INTEL["Meta Model API"]
        WONDER["Muse Wonder<br/>plan · propose · dream"]
        SPARK["Muse Spark<br/>execute · chat · triage"]
        VOICE["Muse Voice<br/>Transcribe"]
        IMAGE["Muse Image<br/>experimental"]
    end

    subgraph EVAL["Evolution and evaluation"]
        CORE["agent-core<br/>solve(task, tools)"]
        BENCH["scenarios →<br/>evalset.js"]
        GRADER["Deterministic grader<br/>+ harness verdict"]
        RULES["core-rules.js<br/>scan + code gate"]
    end

    subgraph INFRA["GitHub Actions"]
        CI["ci.yml"]
        GATE["agent-gate.yml"]
        EVOWF["evolve.yml<br/>Muse Code or Forja"]
        MIG["db-migrate.yml"]
    end

    subgraph DATA["PostgreSQL · Supabase"]
        APPDB[("app schema<br/>keys · budgets · harness_runs<br/>jobs · skills · memories · dreams<br/>cores · evolve_runs · notes · visits")]
        RESDB[("research + sealed schemas<br/>append-only protocol tables")]
    end

    THIRD["Third-party services<br/>Supabase Auth · Google OAuth · ElevenLabs<br/>Hacker News · arXiv · HF Papers · GitHub"]

    PRES -->|"HTTPS + Supabase JWT"| API
    API --> GUARD
    GUARD -->|"user's own key"| INTEL
    API --> EVAL
    API -->|"pg"| DATA
    API -->|"workflow_dispatch"| INFRA
    INFRA -->|"one-time token:<br/>fetch run, send results"| API
    INFRA --> EVAL
    INFRA -->|"migrations"| DATA
    API -.-> THIRD
```

### How the layers communicate

- **Synchronous user requests.** The app sends HTTPS requests with a Supabase JWT. Each function verifies the token
  with Supabase (`/auth/v1/user`), reads and writes the `app` schema with `pg`, and calls Meta only through the
  harness. A cycle is a sequence of short `step` requests driven by the browser. Functions run for at most 30 to 120
  seconds (`vercel.json`).
- **CI-driven code evolution.** A user's request to `/api/evolve` dispatches `evolve.yml` with a run id and a
  one-time token. The workflow fetches the run (including the user's masked key) from `/api/evolve-ci`, builds and
  judges, and posts the result back. The server re-checks the code and the verdict before storing anything. This is
  asynchronous and takes minutes. It is not a background process: each run is started by a user.
- **The platform core** (`packages/agent-core` on `main`) changes only by pull request. `agent-gate.yml` scans and
  examines each such PR and comments its verdict. A person merges.
- **Isolation of the evaluator.** The scorer, the answers and the adoption rules live in `api/` and `scripts/evolve/`,
  outside the code the agent can rewrite.

## Technology stack

Versions are from the package manifests (`^` ranges where the manifest uses them).

| Area | Technology |
|---|---|
| **Frontend: app and panel** | React `^19.3.1`, TypeScript `5.9.3`, Vite `^8.3.5` (`@vitejs/plugin-react ^6.1.2`), custom CSS, English/Spanish i18n, `@supabase/supabase-js ^2.118.0` |
| **Frontend: landing** | Vanilla JavaScript, Three.js `0.187.0` (WebGL), Canvas, Web Audio, built with esbuild `0.28.2`, Figtree variable font |
| **Backend** | Node.js 22, JavaScript ESM serverless functions on Vercel (`api/`), REST-style JSON endpoints, Node child processes with the permission model for sandboxing |
| **Database** | PostgreSQL 16 (Docker locally and in CI, Supabase in production), Drizzle ORM `^0.45.4` and drizzle-kit `^0.31.11` for schema and migrations, `pg ^8.23.1` for queries, append-only tables enforced by triggers |
| **Auth** | Supabase Auth: Google OAuth (Google Identity Services ID token, redirect fallback), email and password confirmed with a 6-digit one-time code |
| **AI** | Meta Model API: Muse Wonder, Muse Spark, Muse Code, Muse Voice Transcribe, Muse Image (experimental), function calling. Optional ElevenLabs text-to-speech (third party) |
| **Contracts and data** | Zod `^4.6.7` schemas, canonical SHA-256 hashing, deterministic synthetic generators (mulberry32 PRNG), dataset manifest |
| **Quality** | Vitest `^5.0.5`, fast-check `^4.10.2` (property tests), `node:test` for the agent core, ESLint `^9.39.5` with `typescript-eslint ^8.72.1` (strict), `tsc` type checking |
| **Infrastructure** | pnpm `10.28.0` workspaces, Vercel (static site + functions), GitHub Actions (`ci`, `agent-gate`, `evolve`, `db-migrate`), Docker Compose for local Postgres |

## Repository structure

```text
apps/
  landing/          Public landing: 3D lab (Three.js), benchmark rooms, sound, live radar feed, visit beacons
  app/              Authenticated app (/app/): Home, Agent, Process, Its code, Radar, Brain, Settings, Traffic
  panel/            Read-only static panel (/panel/): validation of the synthetic environment
api/                Vercel serverless functions
  _lib/             Harness, auth, crypto, sandbox, core rules, memory, director, voice, translation, visits
  _data/            Generated evaluation set (answers stay server-side) and the closed audio catalog
packages/
  agent-core/       The agent's rewritable core: solve(task, tools), no network, files or secrets
  scenarios/        Common framework + 5 benchmark-style exams + 5 original business scenarios
  env-recon/        First synthetic environment (reconciliation): generator, R1/R2 rules, oracles
  contracts/        Zod schemas (source of the types) and canonical hashing
  db/               Drizzle schema and SQL migrations 0000–0010
  research/         Radar sources, triage prompt and validation, Meta model catalog, source logos
scripts/
  evolve/           The judge and workshop: fresh exams, sandboxed bench, gate rules, Forja, CI client
  evalset.ts        Generates api/_data/evalset.js from packages/scenarios
  auth-check.mjs    Verifies the Google + Supabase sign-in configuration
datasets/manifest.json   Hashes of every split (data is regenerated from seeds)
supabase/templates/      Email templates with 6-digit codes
test/               API and evolve tests (Vitest)
docs/               Decisions (ADRs), progress log, code evolution, deployment, research notes
```

## Self-modifying code and evaluation

Beyond text skills, each user's agent can change its own **executable code**: the agent core, the function
`solve(task, tools)` that takes the exams. This is the most distinctive and the most experimental part of
Agentztein. Full design, setup and risks: [`docs/EVOLVE.md`](docs/EVOLVE.md) (ADR-026).

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant API as App API (Vercel)
    participant W as Muse Wonder
    participant GH as GitHub Actions (evolve.yml)
    participant B as Builder: Muse Code or Forja
    participant J as Judge: fresh exam in sandbox
    U->>API: Ask for a code change (optional guidance)
    API->>W: Current core, practice mistakes, approved radar ideas, past attempts
    W-->>API: ONE code-change hypothesis
    API->>GH: workflow_dispatch with run id and one-time token
    GH->>API: Fetch run: masked user key, current core, hypothesis
    GH->>GH: Measure current core on the practice set
    GH->>B: Workshop holding only the core, as unprivileged user "builder"
    B-->>GH: Modified core and CHANGES.md
    GH->>GH: Static scan and the core's own tests
    GH->>J: Current core vs new core on an exam generated from a random seed
    J-->>GH: Scores per scenario
    GH->>API: New code and results
    API->>API: Re-scan code and re-judge verdict
    API-->>U: Active version, or rejected with reason
```

| Aspect | How it works |
|---|---|
| **Per-user versions** | Each user has their own line of core versions in `app.agent_cores`. A version's code cannot be rewritten (trigger in migration `0008`). |
| **Baseline core** | Users without a version run the platform core (v0, `packages/agent-core` on `main`). It changes only by PR, judged by `agent-gate.yml` and merged by a person. |
| **Hypotheses** | Muse Wonder proposes one concrete, testable code change (e.g. its own pure-JS tools, verification or voting between passes, prompt construction, effort per call), avoiding attempts that already failed. A user can also submit their own idea. |
| **Builders** | Muse Code (`muse exec`) runs as an unprivileged `builder` user with no access to the repo, the runner's home, the key file or the judge. If it can't install or doesn't change the core, **Forja** (Muse with function calling, limited to `agent-core/` and `CHANGES.md`) takes over. |
| **Fresh evaluation** | The exam doesn't exist when the code is written: it is generated in each run from a random seed in a seed range no other set uses, with the held-out profile, across all five exams (about 360 records). |
| **Comparison** | The current core and the new one take the same fresh exam, each in a sandboxed child process without the key. |
| **Adoption rules** | Decided by the server (`api/_lib/core-rules.js`), not by CI or the agent. See the table below. |
| **Rollback** | A user can return to any of their versions that passed, or to the platform core (`op: "activate"`). Versions are never deleted. |
| **Security** | Static scan forbids `process`, `fetch`, `require`, dynamic `import()`, `eval`, `Function`, `globalThis`, host APIs, patching built-ins, imports from outside the package and memorized record ids. The sandbox allows reading only the core's folder, gives it an empty environment and no child processes or workers. Its only path to a model is asking the parent, which meters the call. The user's key travels once, with a one-time token whose hash is all the database stores. |
| **Limits** | Up to `EVOLVE_MAX_USD` per run ($2 default, never more than the user has left this month) and `EVOLVE_DAILY_RUNS` runs per user per day (3 default). |

**Adoption gate for code** (`judge` in `api/_lib/core-rules.js`):

| Case | Result |
|---|---|
| The code breaks the static rules | Rejected, not even stored |
| The new core errors in a scenario where the current one doesn't | Rejected (`broken`) |
| Any scenario drops by more than max(1, 3% of its items) | Rejected (`regression`) |
| Total gain below max(2, 2% of the exam) | Rejected (`no-gain`) |
| Improves without breaking anything | **Activated automatically** for that user only |

> **Skills versus code: two different gates.** A skill that passes its harness **waits for a person** to approve it.
> A core version that passes the code gate is **activated automatically** for that user, and the user can roll it
> back. Changes to the shared platform core always go through a human-merged PR.

**Known limitations of code evolution.** The builder holds the user's key (a malicious guidance could only spend the
user's own key). Node's permission model does not block the network, although the sandbox contains no key,
environment or file worth sending. About 360 records and a +2% threshold filter coarse noise, not fine differences.
Muse Code in CI has not been verified: the installer URL is a default to confirm against Meta's documentation, and
runs fall back to Forja. Muse Code's own usage is billed to the user's key but cannot be metered by the harness.
**The pipeline is implemented and covered by tests (`test/api/evolve.test.ts`, `test/evolve/`,
`test/api/sandbox.test.ts`), but the repository does not document a successful end-to-end production run.**

## Memory, research, and multimodal interaction

### Memory and dreams (ADR-031)

Memory has four layers: **working** (what fits in one prompt), **episodic** (each cycle in `app.agent_jobs`, never
sent whole), **lessons** (`app.agent_memories`) and **procedural** (skills and core, which change only through their
gates).

- **Consolidation.** A dream rereads up to 10 undigested cycles, each compressed deterministically into one line,
  plus the active lessons. Muse Wonder answers what to keep, rewrite, add or forget. The server applies it by fixed,
  tested rules (`consolidate`).
- **Strength and lifecycle.** Strength runs 0–5 (starts at 2). Keeping or rewriting raises it. A lesson neither
  mentioned nor used since the last dream loses a point and fades at 0. At most 40 stay active. Rewriting creates
  a new row and marks the old one `superseded`. Text and scope are frozen by trigger. Nothing is deleted.
- **Scope and kind.** Each lesson is scoped `global`, to an exam, or to an exam's situation, and typed `rule`,
  `dead-end`, `strategy` or `fact` (max 240 characters). Lessons naming a specific bench record are discarded.
- **Contextual retrieval with budgets.** The planner receives up to 1,200 characters (the failing situation first,
  then its exam, then global, never another exam), the director 900, the chat 500. Each use refreshes the lesson.
- **Pinning and forgetting.** A person can dream on demand (capped at $0.25), pin a lesson so no dream changes it,
  or forget it.
- **Separation from evaluation.** The executor taking an exam never sees memory, only skills that passed the harness.
  Lessons come from practice mistakes and validation *counts*, never from validation or sealed answers.
- **Not yet measured:** whether memory reduces rejected cycles or planner tokens per approved skill. The trace
  records which lessons were used so this can be measured.

### Research radar

- **Collection.** `fetchResearch` reads Hacker News (Algolia API), arXiv (cs.AI/CL/LG, filtered to agents,
  benchmarks and reasoning), Hugging Face Daily Papers and fast-rising GitHub repositories tagged `llm`. Each source
  has its own timeout and one retry, and falls back to its last good answer from the past 6 hours. One failing
  source doesn't stop the others.
- **Triage.** The user's model labels each item `experiment`, `watch` or `skip`, with expected gain, cost and a
  one-line reason, judging only the title and source. Items are passed as untrusted data, and the reply is validated
  (ids and enums) before it is stored.
- **Influence on improvement.** An `experiment` idea does nothing until a person approves it. Approved ideas (up to
  5) reach the planner and the code-change proposer as optional hints, and the skill records which idea it used.
  **No research finding changes the agent directly.** It can only inspire a candidate that must pass the same gates.

### Voice and conversation

| Function | Implementation | Provider |
|---|---|---|
| Speech-to-text | Muse Voice Transcribe. The app converts recordings to 16 kHz mono WAV before upload | **Meta** |
| Speech-to-text fallback | Browser speech recognition (`SpeechRecognition`), free | Browser |
| Read-aloud | Browser speech synthesis, with selectable voice and speed | Browser |
| Read-aloud (optional) | ElevenLabs with the user's own key. Landing lines use the deployer's key and a closed catalog | **Third party** |
| Companion | `/api/talk` answers in first person, in short sentences, using the lab's state (skills, last cycle, budget, radar, lessons) as context. It may *suggest* an action (start an autonomous cycle, dream, open a tab), which runs only if the person confirms | **Meta** (Muse Spark, low effort) |

Meta does not currently offer a text-to-speech model through this API, which is why read-aloud uses the browser or
ElevenLabs.

### Visual experiences: what is real and what is illustrative

| View | Based on | Nature |
|---|---|---|
| **Process tab** (TL;DR, decisions, "What you are approving", step-by-step trace) | The cycle's stored state and trace, without extra model calls | Real execution state |
| **Run graph** (3D network per cycle, cost meter against the cap) | Only the cycle's trace and state. Grows live and replays finished cycles | Real execution state |
| **Brain** (knowledge graph of exams, situations, skill versions, radar ideas, tools) | Skills, cycles and approved notes from the database, in the order they happened | Real data, stylized layout |
| **Lab 3D in the app** ("Follow Agentztein") | Real trace steps mapped to rooms of the 3D building | Real events, experiential representation |
| **Landing 3D lab and benchmark rooms** | Hand-built scenes, a playable ARC-style floor puzzle, animated agent | **Illustrative**. Not results |
| **Landing app screenshots** | The real interface with sample data | Interface is real. Numbers are not results |

<a id="evaluation-methodology"></a>

## Evaluation methodology

### Benchmark-style synthetic exams

Agentztein currently evaluates on **five synthetic exams inspired by** public benchmark categories. Each is scored
the way its namesake is scored, but **they are not those benchmarks**, and results on them say nothing about
performance on the real ones.

| Exam | Inspired by | Scored like the original by |
|---|---|---|
| `codigo` | SWE-bench Pro (software engineering) | FAIL_TO_PASS and PASS_TO_PASS |
| `terminal` | Terminal-Bench (terminal operations) | The task's tests, not the exit code |
| `razonamiento` | ARC-AGI (reasoning) | Exact grid, two attempts in the competition context |
| `web` | BrowseComp (web research) | All clues plus source |
| `investigacion` | MLE-bench (ML research) | Kaggle-style medals by competition size |

Each exam has **two contexts with different hidden rules**. A rule that is correct in one context is wrong in the
other (the A/B trap), so a skill applied outside its scope causes measurable damage. The generators also define a
**rule change (R1→R2) that affects only one context**. The approximation is deliberate and narrow: these exams keep
the scoring shape and the interference structure, not the difficulty, scale, or validity of the original
benchmarks. The project started with five business scenarios. Four of them (quality inspection, returns,
customer messages, shipping rates) remain in the app's bench as `legacy` so older skills stay readable, and they
accept no new cycles. The fifth, bank reconciliation, lives only in `packages/env-recon` and `packages/scenarios`.

### Protocol

| Element | Implementation today |
|---|---|
| **Baseline vs candidate** | The same executor answers the same validation set before and after the candidate skill. The code gate compares old and new cores on the same fresh exam. |
| **Context-specific policies** | Skills are scoped to one context. The planner targets the context with the most practice mistakes. |
| **Rule changes** | R1→R2 sets exist in the generators and are tested (`packages/scenarios/test`). **In-app cycles currently use the interleaved family under R1.** Rule-change cycles are not yet part of the app loop. |
| **Data separation** | Practice (~40–45 items per exam): the planner sees mistakes with answers. Validation (~60–64): used for the gate. The model never sees its answers. Sealed (~58–64): held-out profile, used only by the separate `exam` operation. |
| **Held-out evaluation** | `op: "exam"` runs the sealed set with the active skills or with none, to compare. Code evolution uses exams generated on the spot from a random seed. |
| **Reproducible data** | Deterministic generators with disjoint seed ranges per split and scenario. `datasets/manifest.json` (`ds-v2`) stores hashes. `pnpm datasets:verify` (in CI) checks both the datasets and that `api/_data/evalset.js` is up to date. |
| **Regression detection** | Skill gate: no other context may drop by more than one item. Code gate: no scenario may drop by more than max(1, 3%). |
| **Versioned skills** | `app.agent_skills` rows are frozen by trigger. Only new versions are added, and only status moves (candidate → active/rejected, active → retired). |
| **Thresholds** | Skill gate: gain in the target context ≥ min(2, remaining errors), at least 1. Code gate: total gain ≥ max(2, 2% of the exam). |
| **Scoring** | Deterministic comparison with known answers. Unanswered items count as wrong. No model-based judging. |

### Statistical limitations

- **Small samples, single runs.** Each gate decision is based on one run on roughly 60 validation items (skills) or
  about 360 items (code). Thresholds are noise floors, not significance tests. No confidence intervals are computed
  in the app.
- **Model non-determinism.** Seeds make the *data* reproducible, not the model's answers. Model ids, tokens and
  costs are logged, but a cycle cannot be replayed exactly.
- **Reused validation set.** Skill cycles are gated repeatedly on the same validation set, which risks adaptive
  overfitting to it. The sealed exam and fresh exams exist to check this, but no systematic held-out report exists
  yet.
- **Pre-registration pending.** The proposal (ADR-003) derives thresholds from baseline variability (max(10 pp,
  2σ) for gain, max(5 pp, 1σ) for regression, plus a bootstrap CI above zero) and freezes them before a
  confirmatory run. That calibration has not been run. The current thresholds are provisional.

### Results

**No experimental results are reported.** There are no measured improvement rates, benchmark scores, accuracy
gains or cost savings for the agent in this repository. The only measured numbers are environment-validation checks
on hand-written oracle rules (e.g. the "same amount and date" rule solving 30/30 batches in one reconciliation
context and 0/15 in the other), which show that the environments contain the intended conflict. They are not agent
results. See [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Current implementation status

### Implemented

Supported by code and tests in this repository:

- Scoped skill cycle (baseline → propose → validate → harness verdict → human decision), retirement and versioning.
- Autonomous mode with a director that chooses exam, executor and effort within a spending cap.
- Harness: monthly budget, per-cycle cap, worst-case check before each call, append-only cost log.
- Five benchmark-style synthetic exams, deterministic grader, sealed held-out exam, dataset manifest checks in CI.
- Memory with dreams, pinning and forgetting, and per-reader recall budgets.
- Research radar over four sources, with model triage and human approval.
- Code-evolution pipeline: per-user cores, static rules, sandbox, workflow, server-side gate, rollback, PR gate for
  the platform core.
- Companion chat, voice input with browser fallback, browser read-aloud, on-demand translation.
- Process view, run graph, brain graph, Lab 3D, landing with 3D lab, read-only panel.
- Supabase sign-in (Google, email with code), encrypted per-user keys, traffic analytics for owners.

### Experimental

Implemented, but reliability, results or external dependencies are not fully validated:

- End-to-end code evolution in production. Muse Code in CI is unverified, and Forja is the fallback.
- Muse Voice Transcribe and Muse Image, which depend on preview access. The Muse Image id is unconfirmed.
- Quality of the director's autonomous plans and of skills the planner writes.
- The effect of memory on cycle outcomes, which is not measured.
- ElevenLabs read-aloud with a user's own key.

### Planned

- Runs on subsets of real benchmarks (e.g. a terminal or code benchmark), with full logs and cost.
- The comparative protocol from the original proposal: frozen baseline (A), accumulated skills (B), rewritten
  global instructions (C) and scoped and versioned skills (D), with ablations, pre-registered thresholds and an
  interference matrix.
- Rule-change (R1→R2) cycles in the app loop, and revising only the skills whose scope covers a changed benchmark.
- A daily, scheduled radar. Enabling capabilities the director proposes (web, vision) behind the same gates.
- Infrastructure-change logging, in-app AI credits, retention for visit data.

## Limitations and research integrity

- **Synthetic, not official.** All evaluation is on synthetic exams. Improving on them does not show that the agent
  improves on SWE-bench Pro, Terminal-Bench, ARC-AGI, BrowseComp, MLE-bench or any real task.
- **No published results yet.** See [Results](#results).
- **Fixed models.** No weights are trained. "Self-improvement" here means changes to skills, memory, strategy and
  core code around a fixed model.
- **Not always-on.** Cycles run while the app drives them. Code evolution runs when a user starts it. The radar runs
  on request.
- **Explicit rule changes.** The system does not detect drift automatically.
- **No real data.** Scenarios are synthetic. No banking or personal data is used.
- **Answers are server-side, not secret from repository readers.** The evaluation set, including sealed answers, is
  generated into `api/_data/evalset.js`. The model never sees validation or sealed answers, but anyone with
  repository access can. Fresh exams for code evolution don't exist until a run starts.
- **Preview dependencies.** The Meta Model API preview is limited to developers in the United States, and some model
  ids and installers are unconfirmed.
- **Independent work.** This project does not depend on or reuse code from the private "Control" repository.
- **Not production-ready.** This is a research prototype built for a hackathon.

## Getting started

**Use the hosted app.** Sign in at `/app/`, paste your Meta Model API key (created at dev.meta.ai) in Settings,
set a monthly budget, and start a cycle from the Agent tab. Every call uses your key and is capped by your budget.

**Run the checks locally.** Requires Node 22 (≥ 22.12), pnpm 10 and Docker (or a local PostgreSQL 16).

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
app builds. Without `DATABASE_URL`, Postgres tests are skipped visibly. Dataset tools (`datasets:generate`,
`env:conflict`, `datasets:review`) and how to deploy the full stack are in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Configuration and security

- **Configuration** is entirely through environment variables in Vercel and GitHub. The full list, with the Google
  and Supabase sign-in setup, is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Code-evolution setup is in
  [`docs/EVOLVE.md`](docs/EVOLVE.md). Never commit `.env` or real values.
- **User keys** are encrypted with AES-256-GCM (bound to user and provider), never returned to the browser, and
  decrypted only inside the harness.
- **Database.** The `app` schema is not exposed through Supabase's Data API. Research and versioning tables are
  append-only by trigger. Migrations are applied manually through `db-migrate`.
- **Evolved code** is statically scanned and runs only in a sandboxed child process without keys or environment.
- **Untrusted inputs.** Radar items and traces are treated as data, not instructions (ADR-014). Model replies are
  parsed and validated before use.
- **Traffic analytics** store no cookies, IPs or fingerprints and respect Global Privacy Control and Do Not Track.
- **Repository** is private, with all rights reserved and no public license yet (ADR-001).

## Roadmap

1. **Calibrate.** Measure baseline variability with repeated runs and derive pre-registered thresholds (ADR-003).
2. **Report honestly.** Publish held-out results on the synthetic exams, with confidence intervals, cost and the
   cases where the agent did not improve.
3. **Rule changes in the loop.** Bring R1→R2 cycles into the app and measure interference across contexts.
4. **Comparative protocol.** Run variants A–D and their ablations on the same budget.
5. **Real benchmarks.** Start with a small subset of a terminal or code benchmark in reproducible containers.
6. **Verify code evolution.** Confirm Muse Code in CI and document end-to-end runs, including rejected ones.
7. **Measure memory.** Compare rejected cycles and planner tokens per approved skill with and without lessons.

Background, sources and the reasoning behind benchmark choices: [`docs/FRONTERA.md`](docs/FRONTERA.md) (ADR-018).
Hackathon presentation audit: [`docs/AUDITORIA-HACKATHON.md`](docs/AUDITORIA-HACKATHON.md).

## Research references and acknowledgments

Agentztein builds on prior work. Credit belongs to the authors, and none of their results have been reproduced in
this repository. References as listed in the project proposal (v1.0, §13). Recent publications may be preprints.

1. Nous Research. *Hermes Agent Self-Evolution*. https://github.com/NousResearch/hermes-agent-self-evolution
2. Nous Research. *Hermes Agent: Skills System and write approval*. https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/
3. Sakana AI. *The Darwin Gödel Machine*. 30 May 2025. https://sakana.ai/dgm/
4. Agrawal et al. *GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning*. ICLR 2026. https://arxiv.org/abs/2507.19457
5. *ACE: Agentic Context Engineering*. https://ace-agent.github.io/
6. Lee et al. *Meta-Harness: End-to-End Optimization of Model Harnesses*. Mar 2026. https://arxiv.org/abs/2603.28052
7. Shang et al. *MESH-Harness: Self-Improving Agent Harnesses via Bandit-Guided Compositional Evolution*. Oct 2026. https://arxiv.org/abs/2610.05300
8. Ma et al. *Skill-V: Verifiable Self-Evolving Skill Library for Interactive Agents*. Oct 2026. https://arxiv.org/html/2610.11781v1
9. Zhou et al. *Counterfactual Trace Auditing of LLM Agent Skills* (CTA). May 2026. https://arxiv.org/abs/2605.11946
10. Zhu et al. *Bad Genius: Counterfactual-Guided Harness Evolution Beyond Task-Specific Shortcuts* (CHASE). Sep 2026. https://arxiv.org/abs/2609.18366
11. Chen et al. *Are Self-Evolving Agents Continual Learners?* 19 Oct 2026. https://arxiv.org/abs/2610.25858
12. Zhao et al. *Self-Evolving Agents Can Repair Failures but Struggle to Generalize from Them*. 16 Oct 2026. https://arxiv.org/abs/2610.22984
13. Huang et al. *From Raw Experience to Skill Consumption: A Systematic Study of Model-Generated Agent Skills*. May 2026. https://arxiv.org/abs/2605.23899
14. Meta. *Global AI Developer Hackathon: themes, criteria and dates*. https://dev.meta.ai/events/global-hackathon

Additional benchmark and self-improvement sources (SWE-bench Pro, Terminal-Bench, ARC-AGI-3, BrowseComp, MLE-bench,
PaperBench, RE-Bench, METR time horizons, process-level evaluation of self-evolving agents) are collected in
[`docs/FRONTERA.md`](docs/FRONTERA.md).

**Acknowledgments.** Meta's Muse models power every reasoning step. Hacker News, arXiv, Hugging Face and GitHub
are used as public research sources. Their logos indicate the source only and imply no affiliation or endorsement.

<sub>Internal code name: `skillab` (package scope `@skillab/*`).</sub>
