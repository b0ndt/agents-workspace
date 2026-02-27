# Multi-Agent Development Pipeline

A 6-phase agent-driven development system for Cursor IDE. Enter a prompt, and specialized AI agents build your project — from requirements to deployed code on Vercel.

Each project gets its own GitHub repo, Slack channel, and Vercel deployment.

## Agents

| # | Agent | Cloud Model | Produces |
|---|-------|-------------|----------|
| 1 | **Requirements Engineer** | gpt-5.2-high | Requirements, user stories, glossary |
| 2 | **Architect** | claude-4.6-opus-high-thinking | System design, ADRs, API specs, data model |
| 3 | **Design Explorer** | gpt-5.2-high | Design directions (text prompts → NanoBanana mockups) |
| 4 | **Design Translator** | claude-4.6-opus-high-thinking | Design system, screens, brand asset prompts |
| 5 | **Engineer** | gpt-5.3-codex-high | Production code, tests, Vercel deployment |
| 6 | **QA Reviewer** | composer-1.5 | Review report, security audit |

## Quick Start

```bash
npm install
cp .env.example .env   # fill in your tokens

# Preview what will happen (no agents launched)
npx tsx scripts/pipeline.ts -p my-app -m "Build a modern todo app" --dry-run

# New project (auto-creates GitHub repo + Slack channel)
npx tsx scripts/pipeline.ts -p my-app -m "Build a modern todo app" --interactive

# Override auto-detected scope
npx tsx scripts/pipeline.ts -p my-app -m "Build a modern todo app" --scope nano

# Iterate on existing project (same name = same repo)
npx tsx scripts/pipeline.ts -p my-app -m "Add dark mode" --interactive

# Resume from phase 4
npx tsx scripts/pipeline.ts -p my-app -m "..." --from 4 --ref cursor/branch
```

## How It Works

```
Prompt → ensureRepo → inferScope
  → Phase 1: Requirements Engineer
  → Phase 2: Architect
  → Phase 3: Design Explorer → NanoBanana mockup variants → HitL selection
  → Phase 4: Design Translator → design-system + screens → NanoBanana brand assets
  → Phase 5: Engineer → app logic on top of design system
  → Phase 6: QA Reviewer → review report (skipped in nano scope)
  → Final Vercel deploy + merge/PR
  → Status updates in #proj-<project> on Slack
```

## Scope (auto-detected)

| Level | Trigger | Effect |
|-------|---------|--------|
| nano | ≤30 words or "simple/todo/landing" | Minimal docs, 2 variants, QA skipped |
| micro | ≤50 words | Lean docs, 2 variants, light QA |
| standard | 50-120 words | Full docs, 3 variants |
| large | >120 words or 4+ complexity signals | Extended docs, 4 variants |

Override with `--scope nano|micro|standard|large`.

## Image Generation

Agents write text prompts only — **they never generate images**.
The pipeline orchestrator calls NanoBanana Pro automatically:
- After Phase 3: mockup variants from `design-exploration.md`
- After Phase 4: brand assets from `visual-prompts.md`

## Interactive Mode

With `--interactive`, the pipeline pauses after each phase:
- **Terminal**: `a` (approve) / `f <msg>` (followup) / `s` (stop) / `r` (retry)
- **Slack**: Same commands as replies in the `#proj-<project>` channel thread

## Required Tokens

| Variable | Where | Purpose |
|----------|-------|---------|
| `CURSOR_API_KEY` | [cursor.com/dashboard](https://cursor.com/dashboard?tab=integrations) | Cloud Agents API |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | [github.com/settings/tokens](https://github.com/settings/tokens) | Repo creation, branches, merges |
| `GITHUB_REPO_OWNER` | Your GitHub username | Repo owner |
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) | Deployments |
| `NANOBANANA_API_KEY` | [nanobananaapi.ai](https://nanobananaapi.ai/api-key) | AI mockup/asset generation (optional) |
| `V0_API_KEY` | [v0.dev/chat/settings/keys](https://v0.dev/chat/settings/keys) | Code scaffold from mockup (optional) |
| `SLACK_BOT_TOKEN` | Your Slack App | Channel creation, HitL (optional) |
| `SLACK_USER_ID` | Slack profile → Copy member ID | @mention in Slack (optional) |

## MCP Setup

The GitHub MCP server reads `GITHUB_PERSONAL_ACCESS_TOKEN` from your shell environment.
Make sure the token is exported before Cursor starts:

```bash
# Add to ~/.zshrc or ~/.bashrc:
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token_here
```

> **Security**: `.cursor/mcp.json` is in `.gitignore` — never commit tokens in config files.

## Project Structure

```
AGENTS/                              # This workspace
├── .cursor/
│   ├── mcp.json                     # Vercel + GitHub MCP (gitignored)
│   └── rules/                       # Agent rules (00-09)
├── scripts/
│   ├── pipeline.ts                  # Main pipeline orchestrator
│   └── lib/                         # Modular pipeline components
│       ├── types.ts                 # Shared types
│       ├── phases.ts                # Agent prompts per phase
│       ├── github.ts                # GitHub API (repo, branch, merge, PR)
│       ├── cursor.ts                # Cursor Cloud Agents API
│       ├── slack.ts                 # Slack + HitL
│       ├── vercel.ts                # Vercel deployments
│       ├── nanobanana.ts            # NanoBanana Pro image generation
│       ├── v0.ts                    # v0 code scaffold
│       ├── scope.ts                 # Scope/mode/phase inference
│       ├── fetch-retry.ts           # Retry wrapper (3x exponential backoff)
│       └── env.ts                   # Env helpers
├── .env.example
├── AGENTS.md
└── README.md
```

Each project created by the pipeline:
```
<project>/                           # Own GitHub repo
├── docs/
│   ├── requirements/                # Phase 1
│   ├── architecture/                # Phase 2
│   │   └── adr/
│   ├── design/                      # Phase 3 + 4
│   │   ├── design-exploration.md    # Design directions (text prompts)
│   │   ├── approved-direction.md    # Selected variant
│   │   ├── mockups/                 # NanoBanana-generated PNGs
│   │   ├── design-spec.md           # Extracted spec
│   │   └── visual-prompts.md        # Brand asset prompts
│   └── reviews/                     # Phase 6
├── design-system/                   # Phase 4
│   ├── tailwind.config.ts
│   ├── globals.css
│   └── components/ui/
├── screens/                         # Phase 4
├── public/                          # Brand assets (NanoBanana PNGs)
├── src/                             # Phase 5
├── tests/                           # Phase 5
└── vercel.json
```
