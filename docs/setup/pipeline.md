# Pipeline Setup

The pipeline runs 5 agents sequentially as Cursor Cloud Agents. Each project gets its own GitHub repo, optional Slack channel, and Vercel deployment.

## Prerequisites

- **Cursor Pro** (or higher) with Cloud Agents API
- **Node.js 18+**
- **GitHub account** with a Personal Access Token

## Setup

```bash
npm install
cp .env.example .env   # fill in tokens
```

### Required Tokens

| Variable | Where | Purpose |
|----------|-------|---------|
| `CURSOR_API_KEY` | [cursor.com/dashboard → Integrations](https://cursor.com/dashboard?tab=integrations) | Cloud Agents API |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | [github.com/settings/tokens](https://github.com/settings/tokens) | Repo creation, branches |
| `GITHUB_REPO_OWNER` | Your GitHub username | Repo owner |
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) | Preview deployments |

### Optional: NanoBanana (AI image generation)

| Variable | Where | Purpose |
|----------|-------|---------|
| `NANOBANANA_API_KEY` | [nanobananaapi.ai/api-key](https://nanobananaapi.ai/api-key) | Logos, mockups, hero images via Gemini 3.1 Flash |

When set, the pipeline generates images from `docs/design/visual-prompts.md` after the Creative Director phase.

### Optional: Slack

| Variable | Where | Purpose |
|----------|-------|---------|
| `SLACK_BOT_TOKEN` | Your Slack App | Channel creation, notifications, HitL |

Slack App scopes needed: `chat:write`, `channels:manage`, `channels:history`, `channels:read`.

## Running the Pipeline

### New project

```bash
npx tsx scripts/pipeline.ts -p my-app -m "Build a modern todo app with..."
```

This auto-creates `b0ndt/my-app` on GitHub if it doesn't exist.

### Iterate on existing project

```bash
npx tsx scripts/pipeline.ts -p my-app -m "Add dark mode and calendar view" --interactive
```

Same project name = same repo. Agents branch off `main` with all prior work.

### Interactive mode (recommended)

```bash
npx tsx scripts/pipeline.ts -p my-app -m "..." --interactive
```

After each phase:
- **Terminal**: `a` (approve) / `f <msg>` (followup) / `s` (stop) / `r` (retry)
- **Slack**: Same commands as thread replies in `#proj-my-app`

### Resume from phase N

```bash
npx tsx scripts/pipeline.ts -p my-app -m "..." --from 3 --ref cursor/arch-branch
```

## What Happens

```
Phase 1: Requirements Engineer → docs/requirements/
Phase 2: Architect → docs/architecture/ + ADRs
Phase 3: Creative Director → docs/design/ + wireframes/ + visual-prompts.md
         → NanoBanana generates logos, mockups (if NANOBANANA_API_KEY set)
         → Wireframe preview deployed to Vercel for review
Phase 4: Engineer → src/ + tests/ + vercel.json
Phase 5: QA Reviewer → docs/reviews/
Final:   Vercel Preview Deploy → Merge to main
```

With Slack enabled, all phases post updates to `#proj-<project>`.

## CLI Reference

```
-p, --project      Project name (kebab-case)
-m, --prompt       Project/feature description
-f, --from         Start from phase N (1-5)
-r, --ref          Source branch (with --from)
-i, --interactive  Pause after each phase
-s, --status       Check agent status
--models           List available models
--verify           Verify API key
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Missing env var | Check `.env` file |
| Branch not found | Ensure Cursor GitHub App has repo access |
| Agent ERROR | Check with `--status <id>` |
| Rate limit (429) | Pipeline auto-waits 60s |
