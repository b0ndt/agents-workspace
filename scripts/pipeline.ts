import "dotenv/config";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE = "https://api.cursor.com";
const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 480; // 2 hours at 15s intervals

interface AgentPhase {
  name: string;
  model: string;
  buildPrompt: (ctx: PipelineContext) => string;
}

interface PipelineContext {
  project: string;
  prompt: string;
  branch: string;
  repoUrl: string;
}

interface AgentResponse {
  id: string;
  status: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Agent Phase Definitions
// ---------------------------------------------------------------------------

// Cloud Agent models (from /v0/models). When empty, API auto-selects.
// Custom Modes in Cursor UI still use the full model catalog (Gemini, Sonnet, etc.)
const MODEL_OPUS = "claude-4.6-opus-high-thinking";
const MODEL_AUTO = ""; // let API pick the best model

const PHASES: AgentPhase[] = [
  {
    name: "Requirements Engineer",
    model: MODEL_OPUS,
    buildPrompt: (ctx) => `
You are the Requirements Engineer. Your task is to analyze the following project idea and create structured requirements documentation.

PROJECT: ${ctx.project}
DESCRIPTION: ${ctx.prompt}

Instructions:
1. Create the directory ${ctx.project}/docs/requirements/ if it doesn't exist
2. Create ${ctx.project}/docs/requirements/00-project-brief.md with vision, goals, personas, constraints, and success metrics
3. Create ${ctx.project}/docs/requirements/01-requirements.md with structured requirements (REQ-001, REQ-002, etc.) each having:
   - Priority (Must/Should/Could/Won't)
   - Type (Functional/Non-Functional/Constraint)
   - User Story in "As a... I want... so that..." format
   - Testable acceptance criteria in Given/When/Then format
   - Dependencies
4. Create ${ctx.project}/docs/requirements/glossary.md with domain-specific terms
5. Follow the templates in docs/templates/

IMPORTANT: Be thorough. Every requirement must be testable. Quantify non-functional requirements.
    `.trim(),
  },
  {
    name: "Architect",
    model: MODEL_OPUS,
    buildPrompt: (ctx) => `
You are the Architect. Read the requirements in ${ctx.project}/docs/requirements/ and create the technical architecture.

PROJECT: ${ctx.project}

Instructions:
1. Read ALL files in ${ctx.project}/docs/requirements/ first
2. Create ${ctx.project}/docs/architecture/00-system-overview.md with:
   - Architecture diagram in Mermaid syntax
   - Component inventory with responsibilities
   - Communication patterns
   - Deployment topology
3. Create ADRs in ${ctx.project}/docs/architecture/adr/ for every significant technology decision
4. Create ${ctx.project}/docs/architecture/api-spec.md with endpoint definitions, request/response schemas
5. Create ${ctx.project}/docs/architecture/data-model.md with entity definitions and Mermaid ER diagram
6. Follow the templates in docs/templates/

IMPORTANT: Reference requirements by ID (e.g., "Implements REQ-003"). Every decision needs an ADR with rationale.
    `.trim(),
  },
  {
    name: "UX Designer",
    model: MODEL_AUTO,
    buildPrompt: (ctx) => `
You are the UX/UI Designer. Read requirements and architecture, then create the visual design using the Neo-Skeuomorphic Cinematic design language.

PROJECT: ${ctx.project}

Instructions:
1. Read ALL files in ${ctx.project}/docs/requirements/ and ${ctx.project}/docs/architecture/
2. Create ${ctx.project}/docs/design/00-user-flows.md with Mermaid flow diagrams and screen inventory
3. Create ${ctx.project}/docs/design/01-design-system.md with:
   - Material palette (brushed-metal, matte-dark, glass, deep-black surfaces)
   - Neon glow accent colors with box-shadow definitions
   - Typography with embossed/debossed text styles
   - Spacing scale (4px base)
   - Cinematic shadow system (145deg light direction)
   - Animation tokens (timing, easing, keyframes)
4. Create screen specs in ${ctx.project}/docs/design/screens/ for each screen
5. Create component specs in ${ctx.project}/docs/design/components/ for each UI component
6. Follow the design language from .cursor/rules/03-ux-designer.mdc

DESIGN LANGUAGE: Neo-Skeuomorphic Cinematic — brushed metal panels, neon glow accents, embossed labels, cinematic directional lighting, physics-based animations. Dark mode primary. Every surface should feel tactile. Every glow should signal interactivity.
    `.trim(),
  },
  {
    name: "Engineer",
    model: MODEL_AUTO,
    buildPrompt: (ctx) => `
You are the Engineer. Implement the project based on all upstream specifications.

PROJECT: ${ctx.project}

Instructions:
1. Read ALL files in ${ctx.project}/docs/requirements/, ${ctx.project}/docs/architecture/, and ${ctx.project}/docs/design/
2. Set up the project structure in ${ctx.project}/src/ following the architecture spec
3. Implement all features described in the requirements, following the architecture design
4. Apply the design system from docs/design/01-design-system.md precisely for all UI components
5. Write tests in ${ctx.project}/tests/
6. Create a ${ctx.project}/README.md with setup and run instructions
7. Reference requirement IDs in commit messages (e.g., "feat: login flow (REQ-003)")

IMPORTANT:
- Use design tokens from the design system, never hardcode colors or sizes
- Implement ALL component states (hover, focus, active, disabled, error, loading)
- Include a vercel.json in the project root for deployment
- Use conventional commits: feat:, fix:, refactor:, test:, docs:
- After implementation, push the branch so Vercel can build a preview
    `.trim(),
  },
  {
    name: "QA Reviewer",
    model: MODEL_AUTO,
    buildPrompt: (ctx) => `
You are the QA Reviewer. Systematically review the implementation against all specifications.

PROJECT: ${ctx.project}

Instructions:
1. Read ALL upstream artifacts in ${ctx.project}/docs/ (requirements, architecture, design)
2. Read ALL implementation code in ${ctx.project}/src/ and ${ctx.project}/tests/
3. Create a review report at ${ctx.project}/docs/reviews/review-${new Date().toISOString().split("T")[0]}-full.md
4. Check against these dimensions:
   - Functional correctness: Are all acceptance criteria from requirements met?
   - Security: Input validation, no hardcoded secrets, auth enforcement, OWASP Top 10
   - Performance: No N+1 queries, proper pagination, asset optimization, no memory leaks
   - Code quality: DRY, single responsibility, clear naming, type safety
   - Test quality: Critical paths covered, deterministic tests, edge cases
   - Accessibility: Semantic HTML, ARIA labels, color contrast, keyboard navigation
   - Design compliance: Matches design specs, uses design tokens, all states implemented
5. Categorize findings as CRITICAL, WARNING, or OBSERVATION
6. Provide a clear verdict: Approved / Approved with comments / Changes requested

IMPORTANT: Do NOT modify any code. Only read and produce the review report.
    `.trim(),
  },
];

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.CURSOR_API_KEY;
  if (!key) {
    console.error(
      "Error: CURSOR_API_KEY not set. Create one at https://cursor.com/dashboard?tab=integrations"
    );
    process.exit(1);
  }
  return key;
}

function getRepoUrl(): string {
  if (process.env.REPOSITORY_URL) return process.env.REPOSITORY_URL;
  try {
    return execSync("git remote get-url origin", { encoding: "utf-8" }).trim();
  } catch {
    const owner = process.env.GITHUB_REPO_OWNER;
    if (owner) {
      return `https://github.com/${owner}/agents-workspace.git`;
    }
    console.error(
      "Error: Could not detect repository URL. Set REPOSITORY_URL or GITHUB_REPO_OWNER in .env"
    );
    process.exit(1);
  }
}

function printEnvStatus() {
  const vars = [
    ["CURSOR_API_KEY", !!process.env.CURSOR_API_KEY],
    ["GITHUB_PERSONAL_ACCESS_TOKEN", !!process.env.GITHUB_PERSONAL_ACCESS_TOKEN],
    ["GITHUB_REPO_OWNER", !!process.env.GITHUB_REPO_OWNER],
    ["VERCEL_TOKEN", !!process.env.VERCEL_TOKEN],
    ["ANTHROPIC_API_KEY", !!process.env.ANTHROPIC_API_KEY],
  ] as const;

  console.log("  Environment:");
  for (const [name, set] of vars) {
    console.log(`    ${set ? "OK" : "--"}  ${name}`);
  }
}

async function apiRequest(
  path: string,
  method: string,
  body?: unknown
): Promise<unknown> {
  const key = getApiKey();
  const auth = Buffer.from(`${key}:`).toString("base64");

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 429) {
    console.log("  Rate limited. Waiting 60s...");
    await sleep(60_000);
    return apiRequest(path, method, body);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Agent Lifecycle
// ---------------------------------------------------------------------------

async function launchAgent(
  phase: AgentPhase,
  ctx: PipelineContext
): Promise<string> {
  const promptText = phase.buildPrompt(ctx);

  console.log(`\n  Launching Cloud Agent: ${phase.name}`);
  console.log(`  Model: ${phase.model}`);
  console.log(`  Branch: ${ctx.branch}`);

  const body: Record<string, unknown> = {
    prompt: { text: promptText },
    source: {
      repository: ctx.repoUrl,
      ref: process.env.DEFAULT_BRANCH || "main",
    },
    target: {
      branchName: ctx.branch,
      autoCreatePr: false,
    },
  };
  if (phase.model) {
    body.model = phase.model;
  }

  const result = (await apiRequest("/v0/agents", "POST", body)) as AgentResponse;

  const agentId = result.id;
  console.log(`  Agent ID: ${agentId}`);
  console.log(`  URL: https://cursor.com/agents?id=${agentId}`);
  return agentId;
}

const TERMINAL_STATUSES = new Set(["FINISHED", "STOPPED", "FAILED", "ERROR"]);
const SUCCESS_STATUSES = new Set(["FINISHED"]);

async function pollUntilComplete(agentId: string): Promise<AgentResponse> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const result = (await apiRequest(
      `/v0/agents/${agentId}`,
      "GET"
    )) as AgentResponse;
    const status = result.status;

    const elapsed = ((attempt + 1) * POLL_INTERVAL_MS) / 1000;
    process.stdout.write(
      `\r  Status: ${status} (${Math.floor(elapsed)}s elapsed)`
    );

    if (SUCCESS_STATUSES.has(status)) {
      console.log(`\n  Completed.`);
      return result;
    }

    if (TERMINAL_STATUSES.has(status) && !SUCCESS_STATUSES.has(status)) {
      console.log(`\n  Agent ${status}.`);
      throw new Error(`Agent ${agentId} ${status}`);
    }
  }

  throw new Error(`Agent ${agentId} timed out after ${MAX_POLL_ATTEMPTS} polls`);
}

// ---------------------------------------------------------------------------
// Pipeline Orchestration
// ---------------------------------------------------------------------------

async function verifyApiKey() {
  try {
    const me = (await apiRequest("/v0/me", "GET")) as Record<string, unknown>;
    console.log(`  API Key:    ${me.apiKeyName ?? "OK"} (${me.userEmail ?? "verified"})`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  API Key verification failed: ${msg}`);
    console.error("  Check your CURSOR_API_KEY in .env");
    process.exit(1);
  }
}

async function listModels() {
  const result = (await apiRequest("/v0/models", "GET")) as { models: string[] };
  console.log("\n  Available models for Cloud Agents:");
  for (const m of result.models) {
    console.log(`    - ${m}`);
  }
  console.log("");
}

async function runPipeline(project: string, prompt: string) {
  const repoUrl = getRepoUrl();
  const defaultBranch = process.env.DEFAULT_BRANCH || "main";
  const branch = `feat/${project}`;

  console.log("=".repeat(60));
  console.log("  AGENT PIPELINE");
  console.log("=".repeat(60));
  console.log(`  Project:    ${project}`);
  console.log(`  Branch:     ${branch}`);
  console.log(`  Repository: ${repoUrl}`);
  console.log(`  Phases:     ${PHASES.length}`);
  printEnvStatus();

  await verifyApiKey();

  console.log("=".repeat(60));

  try {
    execSync(`git rev-parse --is-inside-work-tree`, { encoding: "utf-8", stdio: "pipe" });
    try {
      execSync(`git checkout -b ${branch} ${defaultBranch} 2>/dev/null || git checkout ${branch}`, {
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch {
      console.log(`  Note: Local branch management skipped`);
    }
  } catch {
    console.log(`  Note: Not a git repo — branch management handled by Cloud Agents`);
  }

  const ctx: PipelineContext = { project, prompt, branch, repoUrl };
  const results: { phase: string; agentId: string; status: string }[] = [];

  for (let i = 0; i < PHASES.length; i++) {
    const phase = PHASES[i];
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  PHASE ${i + 1}/${PHASES.length}: ${phase.name}`);
    console.log(`${"─".repeat(60)}`);

    try {
      const agentId = await launchAgent(phase, ctx);
      const result = await pollUntilComplete(agentId);
      results.push({ phase: phase.name, agentId, status: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n  Phase failed: ${message}`);
      results.push({ phase: phase.name, agentId: "n/a", status: "failed" });
      console.log("  Stopping pipeline due to failure.");
      break;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  PIPELINE SUMMARY");
  console.log(`${"=".repeat(60)}`);
  for (const r of results) {
    const icon = r.status === "completed" ? "OK" : "FAIL";
    console.log(`  [${icon}] ${r.phase} (${r.agentId})`);
  }
  console.log(`${"=".repeat(60)}`);

  const allCompleted = results.every((r) => r.status === "completed");
  if (allCompleted) {
    console.log(
      `\n  All phases complete. Check Vercel for preview deployment on branch: ${branch}`
    );
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage() {
  console.log(`
Usage:
  npx tsx scripts/pipeline.ts --project <name> --prompt "<description>"
  npx tsx scripts/pipeline.ts --status <agent-id>
  npx tsx scripts/pipeline.ts --models
  npx tsx scripts/pipeline.ts --verify

Options:
  --project, -p   Project name (kebab-case, becomes directory + branch name)
  --prompt, -m    Project description / feature request
  --status, -s    Check status of a running agent by ID
  --models        List available models for Cloud Agents
  --verify        Verify API key and show account info
  --help, -h      Show this help

Examples:
  npx tsx scripts/pipeline.ts -p todo-app -m "Build a modern todo app with categories, due dates, and dark mode"
  npx tsx scripts/pipeline.ts --status bc_abc123
  npx tsx scripts/pipeline.ts --models
  `);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--models")) {
    await listModels();
    process.exit(0);
  }

  if (args.includes("--verify")) {
    await verifyApiKey();
    process.exit(0);
  }

  if (args.includes("--status") || args.includes("-s")) {
    const idx = args.indexOf("--status") !== -1 ? args.indexOf("--status") : args.indexOf("-s");
    const agentId = args[idx + 1];
    if (!agentId) {
      console.error("Error: --status requires an agent ID");
      process.exit(1);
    }
    const result = await apiRequest(`/v0/agents/${agentId}`, "GET");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  let project = "";
  let prompt = "";

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--project" || args[i] === "-p") && args[i + 1]) {
      project = args[++i];
    } else if ((args[i] === "--prompt" || args[i] === "-m") && args[i + 1]) {
      prompt = args[++i];
    }
  }

  if (!project || !prompt) {
    console.error("Error: --project and --prompt are required");
    printUsage();
    process.exit(1);
  }

  await runPipeline(project, prompt);
}

main().catch((err) => {
  console.error("Pipeline error:", err);
  process.exit(1);
});
