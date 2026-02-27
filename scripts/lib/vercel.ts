import { fetchRetry } from "./fetch-retry.js";
import { required, sleep } from "./env.js";

const VERCEL_API = "https://api.vercel.com";

async function vercelApi(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const r = await fetchRetry(`${VERCEL_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${required("VERCEL_TOKEN")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`Vercel ${method} ${path} (${r.status}): ${t}`); }
  return r.json();
}

export async function deployVercel(owner: string, project: string, branch: string): Promise<string | null> {
  if (!process.env.VERCEL_TOKEN) { console.log("  Skipping Vercel (no VERCEL_TOKEN)"); return null; }

  console.log(`  Deploying to Vercel (branch: ${branch})...`);
  try {
    const dep = (await vercelApi("/v13/deployments?skipAutoDetectionConfirmation=1", "POST", {
      name: project, project,
      gitSource: { type: "github", org: owner, repo: project, ref: branch },
      projectSettings: { framework: null },
    })) as { id: string; url: string };

    for (let i = 0; i < 40; i++) {
      await sleep(10_000);
      const s = (await vercelApi(`/v13/deployments/${dep.id}`)) as { readyState: string; url: string };
      process.stdout.write(`\r  Build: ${s.readyState} (${(i + 1) * 10}s)`);
      if (s.readyState === "READY") { const url = `https://${s.url}`; console.log(`\n  Preview: ${url}`); return url; }
      if (s.readyState === "ERROR" || s.readyState === "CANCELED") { console.log(`\n  Build ${s.readyState}`); return null; }
    }
    console.log("\n  Build timed out");
    return null;
  } catch (e) { console.log(`  Deploy failed: ${e instanceof Error ? e.message : e}`); return null; }
}
