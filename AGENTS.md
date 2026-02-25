# AGENTS.md — Multi-Agent Development Workspace

This workspace uses a structured 5-phase pipeline to develop software projects. Agents run autonomously via the Cloud Agents API or manually via Cursor Custom Modes.

## Quick Reference

| Phase | Agent | Model | Produces |
|-------|-------|-------|----------|
| 1 | Requirements Engineer | Claude 4.6 Opus | Project brief, structured requirements, glossary |
| 2 | Architect | Claude 4.6 Opus | System overview, ADRs, API specs, data models |
| 3 | UX/UI Designer | Gemini 3.1 Pro | User flows, design system, screen/component specs |
| 4 | Engineer | Claude 4.6 Sonnet | Production code, tests, Vercel deployment |
| 5 | QA Reviewer | Claude 4.6 Sonnet | Review reports, security audits, preview checks |

## How to Start a New Project

### Autonomous (recommended)

```bash
npx tsx scripts/pipeline.ts --project "<name>" --prompt "<description>"
```

### Manual

1. Say "Start a new project called `<name>`" — the agent scaffolds the structure
2. Switch to each Custom Mode in sequence: Req Engineer → Architect → UX Designer → Engineer → QA Reviewer

## Agent Handoff Protocol

Each agent writes a handoff summary at the end of its primary output document:

```markdown
## Handoff

**Phase**: <phase name>
**Status**: Complete
**Key artifacts**:
- <file path> — <description>

**Open questions for next phase**:
- <anything requiring attention>

**Blockers**: None
```

Downstream agents MUST read the handoff before starting.

## Pipeline Flow

```
[1] Requirements → [2] Architecture → [3] Design → [4] Engineering → [5] QA Review
        ↑                                                    │              │
        │                                              Vercel Preview       │
        └────────────────────── Feedback Loop ─────────────────────────────┘
```

## Parallel Projects

Use git worktrees for parallel work:

```bash
bash scripts/worktree.sh create <project>   # New isolated worktree
bash scripts/worktree.sh list                # List active worktrees
bash scripts/worktree.sh remove <project>    # Clean up
```

## Vercel Integration

- Every push to `feat/*` branches generates a Vercel Preview Deployment
- QA Reviewer checks the live preview URL
- Merge to `main` triggers Production Deployment

## Project Structure

```
<project-name>/
├── docs/
│   ├── requirements/     ← Phase 1 output
│   ├── architecture/     ← Phase 2 output
│   │   └── adr/
│   ├── design/           ← Phase 3 output
│   │   ├── screens/
│   │   └── components/
│   └── reviews/          ← Phase 5 output
├── src/                  ← Phase 4 output
├── tests/
├── vercel.json
└── README.md
```

## Templates

Reusable document templates are in `docs/templates/`. Agents use these as starting points.

## Design Language

The UX Designer uses **Neo-Skeuomorphic Cinematic**: brushed metal panels, neon glow accents, embossed labels, cinematic directional lighting (145deg), and physics-based animations. Dark mode is the primary palette.
