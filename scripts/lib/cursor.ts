import { fetchRetry } from "./fetch-retry.js";
import { required, sleep } from "./env.js";
import type { AgentRes, Ctx, Phase } from "./types.js";

const CURSOR_API = "https://api.cursor.com";
const POLL_MS = 15_000;
const MAX_POLLS = 480;

export async function cursorApi(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const auth = Buffer.from(`${required("CURSOR_API_KEY")}:`).toString("base64");
  const r = await fetchRetry(`${CURSOR_API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`Cursor ${method} ${path} (${r.status}): ${t}`); }
  return r.json();
}

export async function verifyRepoAccess(owner: string, project: string): Promise<void> {
  const repos = (await cursorApi("/v0/repositories")) as { repositories?: Array<{ owner: string; name: string }> };
  const visible = repos.repositories?.some((r) => r.owner === owner && r.name === project);
  if (!visible) {
    console.log("\n  !! Cursor cannot see this repo.");
    console.log("  !! Fix: github.com/settings/installations → Cursor App → select 'All repositories'\n");
    throw new Error(`Cursor GitHub App has no access to ${owner}/${project}.`);
  }
  console.log("  Cursor access: ✓");
}

export async function launchAgent(phase: Phase, ctx: Ctx, sourceRef: string): Promise<string> {
  console.log(`  Launching: ${phase.name}`);
  console.log(`  Model: ${phase.model} | Source: ${sourceRef}`);

  const body: Record<string, unknown> = {
    prompt: { text: phase.prompt(ctx) },
    source: { repository: ctx.repoUrl, ref: sourceRef },
    target: { autoCreatePr: false },
    model: phase.model,
  };

  const r = (await cursorApi("/v0/agents", "POST", body)) as AgentRes;
  console.log(`  Agent: ${r.id}`);
  console.log(`  URL: https://cursor.com/agents?id=${r.id}`);
  return r.id;
}

export async function poll(agentId: string): Promise<AgentRes> {
  const terminal = new Set(["FINISHED", "STOPPED", "FAILED", "ERROR"]);
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_MS);
    const r = (await cursorApi(`/v0/agents/${agentId}`)) as AgentRes;
    process.stdout.write(`\r  Status: ${r.status} (${Math.floor((i + 1) * POLL_MS / 1000)}s elapsed)`);
    if (r.status === "FINISHED") { console.log("\n  Done."); return r; }
    if (terminal.has(r.status)) { console.log(`\n  Agent ${r.status}.`); throw new Error(`Agent ${agentId} ${r.status}`); }
  }
  throw new Error(`Agent ${agentId} timed out after ${MAX_POLLS * POLL_MS / 1000}s`);
}

export async function sendFollowup(agentId: string, msg: string): Promise<void> {
  await cursorApi(`/v0/agents/${agentId}/followup`, "POST", { prompt: { text: msg } });
  console.log("  Followup sent.");
}
