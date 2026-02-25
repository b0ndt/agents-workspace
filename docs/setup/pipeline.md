# Pipeline Setup — Autonome Agent-zu-Agent Ausfuehrung

Die Pipeline startet alle 5 Agenten nacheinander als Cursor Cloud Agents. Jeder Agent liest die Artefakte der vorherigen Phase und produziert seine eigenen.

## Voraussetzungen

1. **Cursor Pro** (oder hoeher) mit aktivierter Cloud Agents API
2. **Git Repository** — der Workspace muss ein Git-Repo sein
3. **Node.js 18+** installiert

## Einrichtung

### 1. Dependencies installieren

```bash
npm install
```

### 2. Environment einrichten

Kopiere `.env.example` nach `.env` und trage die Keys ein:

```bash
cp .env.example .env
```

Benoetigte Tokens:

| Variable | Wo erstellen | Wofuer |
|----------|-------------|--------|
| `CURSOR_API_KEY` | [cursor.com/dashboard → Integrations](https://cursor.com/dashboard?tab=integrations) | Cloud Agents API |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | [github.com/settings/tokens](https://github.com/settings/tokens) | Repo-Erstellung, Issues, PRs |
| `GITHUB_REPO_OWNER` | Dein GitHub-Username | Repo-Owner fuer neue Projekte |
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) | Preview Deployments |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) | Direkte LLM-Aufrufe (optional) |

### 3. Git Repo einrichten (falls noch nicht geschehen)

```bash
git init
git add .
git commit -m "initial: multi-agent workspace setup"
git remote add origin https://github.com/your-user/your-repo.git
git push -u origin main
```

## Pipeline starten

```bash
npx tsx scripts/pipeline.ts \
  --project "mein-projekt" \
  --prompt "Baue eine moderne Todo-App mit Kategorien, Faelligkeitsdaten und Dark Mode"
```

### Was passiert

```
Phase 1: Requirements Engineer (Claude 4.6 Opus)
  → Erstellt docs/requirements/ mit Project Brief, Requirements, Glossary

Phase 2: Architect (Claude 4.6 Opus)
  → Liest Requirements, erstellt docs/architecture/ mit System Overview, ADRs, API Spec

Phase 3: UX Designer (Gemini 3.1 Pro)
  → Liest Requirements + Architecture, erstellt docs/design/ mit Flows, Design System, Screen Specs

Phase 4: Engineer (Claude 4.6 Sonnet)
  → Liest alles, implementiert in src/ + tests/, pusht Branch → Vercel Preview

Phase 5: QA Reviewer (Claude 4.6 Sonnet)
  → Liest alles + Code, erstellt Review Report in docs/reviews/
```

Jede Phase wartet, bis die vorherige abgeschlossen ist (Polling alle 15 Sekunden).

## Optionen

```
--project, -p   Projektname (kebab-case, wird Verzeichnis + Branch-Name)
--prompt, -m    Projektbeschreibung / Feature-Wunsch
--status, -s    Status eines laufenden Agents pruefen (Agent-ID)
--help, -h      Hilfe anzeigen
```

## Agent-Status pruefen

```bash
npx tsx scripts/pipeline.ts --status agent_abc123def
```

## Vercel Integration

Wenn Vercel mit dem Repository verbunden ist, generiert der Push auf `feat/<project>` automatisch ein Preview Deployment. Der QA Reviewer kann die Preview-URL pruefen.

Vercel einrichten:
1. Verbinde das Repo unter [vercel.com/new](https://vercel.com/new)
2. Setze das Root Directory auf `<project-name>/` (je nach Projektstruktur)
3. Jeder Push auf `feat/*` Branches erzeugt ein Preview

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| `CURSOR_API_KEY not set` | `.env` Datei erstellen, Key eintragen |
| `Could not detect repository URL` | `REPOSITORY_URL` in `.env` setzen oder `git remote add origin ...` |
| Agent stuck / timeout | Status mit `--status` pruefen; ggf. im Cursor Dashboard nachschauen |
| Rate limit (429) | Script wartet automatisch 60s und versucht erneut |
