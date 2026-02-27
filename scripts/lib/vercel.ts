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
    })) as { id: string; url: string; projectId?: string };

    for (let i = 0; i < 40; i++) {
      await sleep(10_000);
      const s = (await vercelApi(`/v13/deployments/${dep.id}`)) as { readyState: string; url: string; projectId?: string };
      process.stdout.write(`\r  Build: ${s.readyState} (${(i + 1) * 10}s)`);
      if (s.readyState === "READY") {
        const stableUrl = await getStableProjectUrl(s.projectId ?? dep.projectId, project);
        console.log(`\n  Live: ${stableUrl}`);
        return stableUrl;
      }
      if (s.readyState === "ERROR" || s.readyState === "CANCELED") { console.log(`\n  Build ${s.readyState}`); return null; }
    }
    console.log("\n  Build timed out");
    return null;
  } catch (e) { console.log(`  Deploy failed: ${e instanceof Error ? e.message : e}`); return null; }
}

async function getStableProjectUrl(projectId: string | undefined, projectName: string): Promise<string> {
  if (projectId) {
    try {
      const p = (await vercelApi(`/v9/projects/${projectId}`)) as { alias?: Array<{ domain: string }>; domains?: Array<{ name: string }> };
      const production = p.alias?.find((a) => a.domain.includes(".vercel.app"));
      if (production) return `https://${production.domain}`;
      const domain = p.domains?.find((d) => d.name.includes(".vercel.app"));
      if (domain) return `https://${domain.name}`;
    } catch { /* fall through to default */ }
  }
  return `https://${projectName}.vercel.app`;
}
