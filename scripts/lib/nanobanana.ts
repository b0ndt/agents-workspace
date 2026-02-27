import { fetchRetry } from "./fetch-retry.js";
import { required, sleep } from "./env.js";
import { ghApi, commitBlobsToRepo } from "./github.js";
import type { DesignDirection, DesignVariantResult, VisualPrompt } from "./types.js";

const NANOBANANA_API = "https://api.nanobananaapi.ai";

// ---------------------------------------------------------------------------
// Low-level NanoBanana Pro API
// ---------------------------------------------------------------------------

async function nanobananaGenerate(prompt: string, size: string): Promise<string> {
  const key = process.env.NANOBANANA_API_KEY;
  if (!key) throw new Error("NANOBANANA_API_KEY not set");

  const r = await fetchRetry(`${NANOBANANA_API}/api/v1/nanobanana/generate-pro`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, aspectRatio: size, resolution: "2K", callBackUrl: "https://example.com/nanobanana-callback" }),
  });
  const res = (await r.json()) as { code?: number; msg?: string; message?: string; data?: { taskId?: string } };
  if (res.code !== 200 || !res.data?.taskId) {
    throw new Error(`NanoBanana Pro: ${res.msg ?? res.message ?? "unknown error"} (${res.code ?? r.status})`);
  }
  return res.data.taskId;
}

async function nanobananaPoll(taskId: string): Promise<string> {
  const key = process.env.NANOBANANA_API_KEY!;
  for (let i = 0; i < 120; i++) {
    await sleep(3000);
    const r = await fetchRetry(`${NANOBANANA_API}/api/v1/nanobanana/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    }, 1);
    const res = (await r.json()) as {
      code?: number;
      data?: { successFlag?: number; response?: { resultImageUrl?: string }; errorMessage?: string };
    };
    if (res.code !== 200) continue;
    const flag = res.data?.successFlag;
    if (flag === 1 && res.data?.response?.resultImageUrl) return res.data.response.resultImageUrl;
    if (flag === 2 || flag === 3) throw new Error(`NanoBanana Pro failed: ${res.data?.errorMessage ?? "unknown"}`);
    process.stdout.write(`\r  NanoBanana Pro: generating (${(i + 1) * 3}s)`);
  }
  throw new Error("NanoBanana Pro timed out");
}

async function downloadAsBase64(url: string): Promise<string> {
  const r = await fetchRetry(url);
  if (!r.ok) throw new Error(`Download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString("base64");
}

// ---------------------------------------------------------------------------
// Generate images in parallel, commit to branch
// ---------------------------------------------------------------------------

async function generateImages(
  directions: Array<{ name: string; prompt: string; size: string; output: string }>,
): Promise<Array<{ path: string; base64: string; name: string; philosophy?: string; key?: string }>> {
  console.log(`  Generating ${directions.length} image(s) via NanoBanana Pro (parallel)...`);

  const results = await Promise.allSettled(
    directions.map(async (d, i) => {
      console.log(`  [${i + 1}/${directions.length}] ${d.name} → ${d.output}`);
      const taskId = await nanobananaGenerate(d.prompt, d.size);
      const imageUrl = await nanobananaPoll(taskId);
      const base64 = await downloadAsBase64(imageUrl);
      return { path: d.output, base64, name: d.name, ...(d as Record<string, unknown>) };
    }),
  );

  const images: Array<{ path: string; base64: string; name: string; philosophy?: string; key?: string }> = [];
  for (const r of results) {
    if (r.status === "fulfilled") images.push(r.value);
    else console.log(`  Warning: ${r.reason}`);
  }
  return images;
}

// ---------------------------------------------------------------------------
// Design Explorer: generate mockup variants
// ---------------------------------------------------------------------------

export async function generateDesignVariants(
  owner: string, project: string, branch: string,
): Promise<DesignVariantResult[]> {
  if (!process.env.NANOBANANA_API_KEY) { console.log("  Skipping variant generation (no NANOBANANA_API_KEY)"); return []; }

  const fileRes = await fetchRetry(
    `https://api.github.com/repos/${owner}/${project}/contents/docs/design/design-exploration.md?ref=${encodeURIComponent(branch)}`,
    { headers: { Authorization: `token ${required("GITHUB_PERSONAL_ACCESS_TOKEN")}`, Accept: "application/vnd.github.raw" } },
  );
  if (!fileRes.ok) { console.log("  No docs/design/design-exploration.md — skipping variant generation"); return []; }
  const md = await fileRes.text();
  const directions = parseDesignExploration(md);
  if (directions.length === 0) {
    console.warn("  ⚠ No valid directions parsed from design-exploration.md — check format (expected: ## direction-N / name: / prompt: / output:)");
    console.warn("  First 500 chars of file:", md.slice(0, 500));
    return [];
  }

  const images = await generateImages(directions);
  if (images.length === 0) return [];

  await commitBlobsToRepo(owner, project, branch,
    images.map((i) => ({ path: i.path, base64: i.base64 })),
    "chore: add design exploration variants [pipeline]",
  );
  console.log(`  Committed ${images.length} variant(s) to branch`);

  return images.map((img) => {
    const dir = directions.find((d) => d.output === img.path);
    return {
      key: dir?.key ?? img.path,
      name: img.name,
      philosophy: dir?.philosophy ?? "",
      imageUrl: `https://raw.githubusercontent.com/${owner}/${project}/${branch}/${img.path}`,
      output: img.path,
    };
  });
}

// ---------------------------------------------------------------------------
// Design Translator: generate brand assets from visual-prompts.md
// ---------------------------------------------------------------------------

export async function generateNanoBananaAssets(owner: string, project: string, branch: string): Promise<number> {
  if (!process.env.NANOBANANA_API_KEY) { console.log("  Skipping NanoBanana (no NANOBANANA_API_KEY)"); return 0; }

  const fileRes = await fetchRetry(
    `https://api.github.com/repos/${owner}/${project}/contents/docs/design/visual-prompts.md?ref=${encodeURIComponent(branch)}`,
    { headers: { Authorization: `token ${required("GITHUB_PERSONAL_ACCESS_TOKEN")}`, Accept: "application/vnd.github.raw" } },
  );
  if (!fileRes.ok) { console.log("  No docs/design/visual-prompts.md found — skipping asset generation"); return 0; }
  const md = await fileRes.text();
  const prompts = parseVisualPrompts(md);
  if (prompts.length === 0) { console.log("  No valid prompts in visual-prompts.md"); return 0; }

  const images = await generateImages(prompts);
  if (images.length === 0) return 0;

  await commitBlobsToRepo(owner, project, branch,
    images.map((i) => ({ path: i.path, base64: i.base64 })),
    "chore: add NanoBanana-generated visual assets [pipeline]",
  );
  console.log(`  Committed ${images.length} image(s) to ${branch} (NanoBanana Pro)`);
  return images.length;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

const SIZE_MAP: Record<string, string> = {
  "1:1": "1:1", "16:9": "16:9", "9:16": "9:16", "4:3": "4:3", "3:4": "3:4",
  "3:2": "3:2", "2:3": "2:3", "21:9": "21:9", "5:4": "5:4", "4:5": "4:5",
};

export function parseDesignExploration(md: string): DesignDirection[] {
  const dirs: DesignDirection[] = [];
  const sections = md.split(/^##\s+/m).slice(1);
  for (const s of sections) {
    const key = s.split("\n")[0].trim().toLowerCase().split(/\s/)[0];
    if (!key.startsWith("direction-")) continue;
    const clean = s.replace(/\*\*/g, "");
    const nameMatch = clean.match(/name:\s*["']([^"']+)["']/);
    const philoMatch = clean.match(/philosophy:\s*["']([^"']+)["']/);
    const promptMatch = clean.match(/prompt:\s*["']([\s\S]+?)["']\s*\n/);
    const sizeMatch = clean.match(/size:\s*["']?([^"'\n]+)["']?/);
    const outputMatch = clean.match(/output:\s*["']?([^"'\n]+)["']?/);
    if (!promptMatch || !outputMatch) continue;
    dirs.push({
      key,
      name: nameMatch?.[1]?.trim() || key,
      philosophy: philoMatch?.[1]?.trim() || "",
      prompt: promptMatch[1].trim(),
      size: SIZE_MAP[sizeMatch?.[1]?.trim() || "16:9"] || "16:9",
      output: outputMatch[1].trim(),
    });
  }
  return dirs;
}

function parseVisualPrompts(md: string): VisualPrompt[] {
  const blocks: VisualPrompt[] = [];
  const sections = md.split(/^##\s+/m).slice(1);
  for (const s of sections) {
    const clean = s.replace(/\*\*/g, "");
    const name = clean.split("\n")[0].trim();
    const promptMatch = clean.match(/prompt:\s*["']([\s\S]+?)["']\s*\n/);
    const sizeMatch = clean.match(/size:\s*["']?([^"'\n]+)["']?/);
    const outputMatch = clean.match(/output:\s*["']?([^"'\n]+)["']?/);
    if (!promptMatch || !outputMatch) continue;
    blocks.push({
      name,
      prompt: promptMatch[1].trim(),
      size: SIZE_MAP[sizeMatch?.[1]?.trim() || "1:1"] || "1:1",
      output: outputMatch[1].trim(),
    });
  }
  return blocks;
}
