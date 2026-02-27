# AGENTS.md — Multi-Agent Development Pipeline

6-phase pipeline that auto-creates GitHub repos, Slack channels, and Vercel deployments per project.

## Agents

| Phase | Agent | Model | Output |
|-------|-------|-------|--------|
| 1 | Requirements Engineer | gpt-5.2-high | Requirements, stories, glossary |
| 2 | Architect | claude-4.6-opus-high-thinking | System design, ADRs, API specs |
| 3 | Design Explorer | gpt-5.2-high | Design directions (text prompts → NanoBanana mockups) |
| 4 | Design Translator | claude-4.6-opus-high-thinking | Design system, screens, brand asset prompts |
| 5 | Engineer | gpt-5.3-codex-high | Code, tests, Vercel deploy |
| 6 | QA Reviewer | composer-1.5 | Review report |

## Scope (auto-detected)

| Level | Trigger | Effect |
|-------|---------|--------|
| nano | ≤30 words or "simple/todo/landing" | Minimal docs, 2 variants, QA skipped |
| micro | ≤50 words | Lean docs, 2 variants, light QA |
| standard | 50-120 words | Full docs, 3 variants |
| large | >120 words or 4+ signals | Extended docs, 4 variants |

## Start a Project

```bash
npx tsx scripts/pipeline.ts -p "my-app" -m "Build a..." --interactive
```

Same project name = iterate on existing repo. New name = new repo.

## Pipeline Flow

```
ensureRepo → inferScope → [1] Req → [2] Arch → [3] Design Explorer → NanoBanana variants → HitL → [4] Design Translator → NanoBanana assets → [5] Eng → [6] QA → Vercel Deploy → Merge/PR
```

## Image Generation

Agents write text prompts only. The pipeline orchestrator calls NanoBanana Pro:
- After Phase 3: mockup variants from `design-exploration.md`
- After Phase 4: brand assets from `visual-prompts.md`

## Interactive Commands

Terminal or Slack thread: `a` (approve) / `f <msg>` (followup) / `s` (stop) / `r` (retry)

## Handoff Protocol

Every agent writes:
```
## Handoff
Artifacts: <files>
Open questions: <items>
Blockers: <app-related only — never image generation>
```
