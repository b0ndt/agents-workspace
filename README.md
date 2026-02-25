# Multi-Agent Development Workspace

Ein modernes, agentengesteuertes Entwicklungs-Setup fuer Cursor IDE. Projekte werden durch eine Pipeline von 5 spezialisierten KI-Agenten gefuehrt — von der Idee bis zum fertigen, geprueften Code auf Vercel.

## Agenten-Uebersicht

| # | Agent | Custom Mode | Modell | Aufgabe |
|---|-------|-------------|--------|---------|
| 1 | **Requirements Engineer** | `Req Engineer` | Claude 4.6 Opus | Anforderungen, User Stories, Akzeptanzkriterien |
| 2 | **Architect** | `Architect` | Claude 4.6 Opus | Systemarchitektur, ADRs, API-Specs, Datenmodelle |
| 3 | **UX/UI Designer** | `UX Designer` | Gemini 3.1 Pro | Neo-Skeuomorphic Design System, User Flows, Screen Specs |
| 4 | **Engineer** | `Engineer` | Claude 4.6 Sonnet | Code-Implementierung, Tests, Vercel Deployment |
| 5 | **QA Reviewer** | `QA Reviewer` | Claude 4.6 Sonnet | Security Audit, Code Review, Vercel Preview Check |

Jeder Agent hat sein eigenes Modell und eigene Tool-Berechtigungen via Cursor Custom Modes.

## Zwei Betriebsmodi

### Modus A: Autonome Pipeline (vollautomatisch)

Ein einziger Befehl startet alle 5 Agenten nacheinander als Cursor Cloud Agents:

```bash
npx tsx scripts/pipeline.ts --project "mein-projekt" --prompt "Baue eine moderne Todo-App mit..."
```

Die Pipeline:
- Erstellt einen Feature-Branch (`feat/mein-projekt`)
- Startet jeden Agenten mit dem richtigen Modell
- Wartet auf Abschluss, bevor die naechste Phase startet
- Pusht Code fuer automatische Vercel Preview Deployments
- Der QA Reviewer prueft am Ende alles inkl. Live-Preview

### Modus B: Manuelle Custom Modes

Wechsle zwischen Custom Modes im Cursor Chat:

1. **Req Engineer** → Anforderungen definieren
2. **Architect** → Architektur planen
3. **UX Designer** → Design erstellen
4. **Engineer** → Code implementieren
5. **QA Reviewer** → Code pruefen

## Workflow

```
Prompt → Req Engineer → Architect → UX Designer → Engineer → QA Reviewer → Fertig
                                                       │            │
                                                 Vercel Preview     │
                    ← ─ ─ ─ ─ ─ ─ ─ Feedback Loop ─ ─ ─ ─ ─ ─ ─ ─┘
```

## Ersteinrichtung

### 1. Dependencies

```bash
npm install
```

### 2. Cursor Custom Modes (fuer Modus B)

1. `Cmd+,` → **Features** → **Chat** → **Custom Modes** aktivieren
2. 5 Custom Modes einrichten → [Anleitung](docs/setup/custom-modes.md)

### 3. Cloud Agents API (fuer Modus A)

1. API Key erstellen unter [cursor.com/dashboard → Integrations](https://cursor.com/dashboard?tab=integrations)
2. `.env` einrichten → [Anleitung](docs/setup/pipeline.md)

### 4. Vercel

1. Repository unter [vercel.com/new](https://vercel.com/new) verbinden
2. Jeden Push auf `feat/*` Branches erzeugt ein Preview Deployment

### 5. Git (falls noch nicht eingerichtet)

```bash
git init && git add . && git commit -m "initial: multi-agent workspace"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

## Neues Projekt starten

### Automatisch (Pipeline)

```bash
npx tsx scripts/pipeline.ts -p mein-projekt -m "Baue eine moderne Todo-App mit Kategorien und Dark Mode"
```

### Manuell (Custom Modes)

1. Sage dem Agenten: **"Starte ein neues Projekt: mein-projekt"**
2. Wechsle zum Mode **Req Engineer** und definiere Anforderungen
3. Wechsle Phase fuer Phase weiter — du entscheidest, wann es weitergeht

## Parallele Projekte (Git Worktrees)

Arbeite an mehreren Projekten gleichzeitig — jedes in seinem eigenen Worktree:

```bash
bash scripts/worktree.sh create todo-app       # Worktree erstellen
bash scripts/worktree.sh create dashboard       # Noch eines
bash scripts/worktree.sh list                   # Alle anzeigen
bash scripts/worktree.sh remove todo-app        # Aufraumen
```

Jedes Worktree ist ein eigenes Verzeichnis mit eigenem Branch — komplett isoliert.

## Projektstruktur

```
AGENTS/                              ← Workspace Root
├── .cursor/rules/                   ← Agenten-Regeln (automatisch geladen)
│   ├── 00-orchestrator.mdc          ← Pipeline-Koordination
│   ├── 01-req-engineer.mdc          ← Requirements Engineer
│   ├── 02-architect.mdc             ← Architect
│   ├── 03-ux-designer.mdc           ← UX/UI Designer (Neo-Skeuomorphic)
│   ├── 04-engineer.mdc              ← Engineer + Vercel Deploy
│   ├── 05-qa-reviewer.mdc           ← QA Reviewer + Preview Check
│   ├── 06-project-structure.mdc     ← Projektstruktur-Konventionen
│   ├── 07-new-project.mdc           ← Projekt-Scaffolding
│   └── 08-worktree.mdc              ← Git Worktree Strategie
├── scripts/
│   ├── pipeline.ts                  ← Autonome Agent-Pipeline
│   └── worktree.sh                  ← Git Worktree Helper
├── docs/
│   ├── templates/                   ← Dokument-Templates
│   └── setup/
│       ├── custom-modes.md          ← Custom Modes Einrichtung
│       └── pipeline.md              ← Pipeline Einrichtung
├── AGENTS.md                        ← Zentrale Agenten-Dokumentation
├── package.json
├── .env.example                     ← API Keys Template
└── <projekt-name>/                  ← Deine Projekte (je ein Ordner)
```

## Design-Sprache

Der UX Designer Agent verwendet **Neo-Skeuomorphic Cinematic** — eine visuelle Sprache, die physische Materialien mit futuristischer Beleuchtung verbindet:

- **Brushed Metal & Matte Panels** — Metalloberflaechentexturen als Primaerflaechen
- **Neon Glow Accents** — Leuchtende Akzente fuer interaktive Elemente
- **Embossed Labels** — Erhabene Typografie mit Licht/Schatten
- **Cinematic Lighting** — Gerichtete Beleuchtung (145 Grad) fuer dramatische Tiefe
- **Purposeful Animations** — Physikbasierte Transitions mit Bedeutung

## Quellen & Best Practices

- [Cursor Agent Best Practices](https://cursor.com/blog/agent-best-practices) — Offizielle Empfehlungen
- [Agentic Workflows 2026 Playbook](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/) — Produktions-Patterns
- [Git Worktrees for Parallel AI Development](https://dev.to/arifszn/git-worktrees-the-power-behind-cursors-parallel-agents-19j1) — Worktree-Konzept
- [cursor-agent-team Framework](https://github.com/thiswind/cursor-agent-team) — Multi-Role Collaboration
- [Cursor Cloud Agents API](https://cursor.com/docs/api) — API-Dokumentation
- [Vercel Cursor Plugin](https://github.com/vercel-labs/cursor-plugin) — React/Next.js Best Practices
