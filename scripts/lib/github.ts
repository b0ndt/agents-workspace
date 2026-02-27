import { fetchRetry } from "./fetch-retry.js";
import { required } from "./env.js";

const GITHUB_API = "https://api.github.com";

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `token ${required("GITHUB_PERSONAL_ACCESS_TOKEN")}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
  };
}

export async function ghApi(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const r = await fetchRetry(`${GITHUB_API}${path}`, {
    method,
    headers: ghHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 422) return r.json();
  if (r.status === 404) return null;
  if (!r.ok) { const t = await r.text(); throw new Error(`GH ${method} ${path} (${r.status}): ${t}`); }
  return r.json();
}

export async function commitFileToRepo(
  owner: string,
  project: string,
  branch: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  let sha: string | undefined;
  const existing = await ghApi(`/repos/${owner}/${project}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);
  if (existing && typeof existing === "object" && "sha" in (existing as Record<string, unknown>)) {
    sha = (existing as Record<string, string>).sha;
  }
  await ghApi(`/repos/${owner}/${project}/contents/${encodeURIComponent(path)}`, "PUT", {
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
    ...(sha ? { sha } : {}),
  });
}

export async function commitBlobsToRepo(
  owner: string,
  project: string,
  branch: string,
  files: Array<{ path: string; base64: string }>,
  message: string,
): Promise<void> {
  const h = ghHeaders();
  const refRes = await fetchRetry(`${GITHUB_API}/repos/${owner}/${project}/git/refs/heads/${branch}`, { headers: h });
  if (!refRes.ok) throw new Error(`Branch ref failed: ${refRes.status}`);
  const baseSha = ((await refRes.json()) as { object: { sha: string } }).object.sha;

  const commitRes = await fetchRetry(`${GITHUB_API}/repos/${owner}/${project}/git/commits/${baseSha}`, { headers: h });
  const baseTreeSha = ((await commitRes.json()) as { tree: { sha: string } }).tree.sha;

  const blobs: Array<{ path: string; sha: string }> = [];
  for (const f of files) {
    const bRes = await fetchRetry(`${GITHUB_API}/repos/${owner}/${project}/git/blobs`, {
      method: "POST", headers: h, body: JSON.stringify({ content: f.base64, encoding: "base64" }),
    });
    if (!bRes.ok) throw new Error(`Blob create failed: ${bRes.status}`);
    blobs.push({ path: f.path, sha: ((await bRes.json()) as { sha: string }).sha });
  }

  const treeRes = await fetchRetry(`${GITHUB_API}/repos/${owner}/${project}/git/trees`, {
    method: "POST", headers: h,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })) }),
  });
  if (!treeRes.ok) throw new Error(`Tree create failed: ${treeRes.status}`);
  const treeSha = ((await treeRes.json()) as { sha: string }).sha;

  const newCommitRes = await fetchRetry(`${GITHUB_API}/repos/${owner}/${project}/git/commits`, {
    method: "POST", headers: h,
    body: JSON.stringify({ message, tree: treeSha, parents: [baseSha] }),
  });
  if (!newCommitRes.ok) throw new Error(`Commit failed: ${newCommitRes.status}`);
  const newSha = ((await newCommitRes.json()) as { sha: string }).sha;

  await fetchRetry(`${GITHUB_API}/repos/${owner}/${project}/git/refs/heads/${branch}`, {
    method: "PATCH", headers: h, body: JSON.stringify({ sha: newSha }),
  });
}

export async function ensureRepo(owner: string, project: string): Promise<{ repoUrl: string; isNew: boolean }> {
  const existing = await ghApi(`/repos/${owner}/${project}`);
  if (existing && typeof existing === "object" && "html_url" in (existing as Record<string, unknown>)) {
    console.log(`  Repo: github.com/${owner}/${project} (existing)`);
    return { repoUrl: `https://github.com/${owner}/${project}.git`, isNew: false };
  }

  console.log(`  Creating repo: github.com/${owner}/${project}`);
  const created = (await ghApi("/user/repos", "POST", {
    name: project,
    description: "Auto-created by agent pipeline",
    private: false,
    auto_init: true,
  })) as Record<string, unknown>;
  if (!created?.html_url) throw new Error(`Failed to create repo: ${JSON.stringify(created)}`);
  console.log(`  Created: ${created.html_url}`);

  const { sleep } = await import("./env.js");
  console.log("  Waiting for initial commit to propagate...");
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const b = await ghApi(`/repos/${owner}/${project}/branches/main`);
    if (b) { console.log("  Branch 'main' is ready."); break; }
    if (i === 14) console.log("  Warning: timed out waiting for main branch, proceeding.");
  }

  return { repoUrl: `https://github.com/${owner}/${project}.git`, isNew: true };
}

export async function branchExists(owner: string, project: string, branch: string): Promise<boolean> {
  const r = await ghApi(`/repos/${owner}/${project}/branches/${branch}`);
  return !!r;
}

export async function createBranch(owner: string, project: string, branch: string, from = "main"): Promise<void> {
  const ref = (await ghApi(`/repos/${owner}/${project}/git/refs/heads/${from}`)) as Record<string, unknown>;
  const sha = ((ref?.object) as Record<string, string>)?.sha;
  if (!sha) throw new Error(`Could not get SHA for branch ${from}`);
  await ghApi(`/repos/${owner}/${project}/git/refs`, "POST", { ref: `refs/heads/${branch}`, sha });
  console.log(`  Created branch: ${branch} (from ${from})`);
}

export async function mergeBranch(owner: string, project: string, head: string, base: string): Promise<boolean> {
  console.log(`  Merging ${head} → ${base}`);
  try {
    const r = await ghApi(`/repos/${owner}/${project}/merges`, "POST", {
      base, head, commit_message: `chore: merge ${head} into ${base} [agent pipeline]`,
    });
    if (r) { console.log(`  Merged ✓`); return true; }
    console.log("  Nothing to merge (already up to date).");
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("204") || msg.includes("already")) { console.log("  Already up to date."); return true; }
    if (msg.includes("409") || msg.includes("Merge conflict")) {
      console.error(`  ⚠ MERGE CONFLICT: ${head} → ${base}`);
      console.error(`  To resolve manually:`);
      console.error(`    git fetch origin`);
      console.error(`    git checkout ${base}`);
      console.error(`    git merge origin/${head}`);
      console.error(`    # fix conflicts, then: git push origin ${base}`);
      console.error(`  Or resume pipeline: --from <next-phase> --ref ${base}`);
      return false;
    }
    console.error(`  Merge failed: ${msg}`);
    console.error(`  Recovery: inspect branches on GitHub and retry with --from <phase> --ref ${head}`);
    return false;
  }
}

export async function createPR(owner: string, project: string, head: string, base: string, title: string, body: string): Promise<string | null> {
  try {
    const pr = (await ghApi(`/repos/${owner}/${project}/pulls`, "POST", { title, body, head, base, draft: false })) as Record<string, unknown>;
    return (pr?.html_url as string) ?? null;
  } catch (e) {
    console.log(`  PR creation failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
