import { fetchRetry } from "./fetch-retry.js";
import { commitFileToRepo } from "./github.js";
import type { DesignVariantResult } from "./types.js";

const V0_API = "https://api.v0.dev";

async function v0Api(imageUrl: string, promptText: string): Promise<string | null> {
  const key = process.env.V0_API_KEY;
  if (!key) return null;
  console.log("  Calling v0 API for code scaffold...");
  try {
    const r = await fetchRetry(`${V0_API}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "v0-1.0-md",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: promptText },
          ],
        }],
      }),
    });
    if (!r.ok) { console.log(`  v0 API error: ${r.status} ${await r.text()}`); return null; }
    const res = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return res.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.log(`  v0 API failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export async function callV0AndCommitScaffold(
  owner: string, project: string, branch: string,
  variant: DesignVariantResult, feedback: string,
): Promise<boolean> {
  const promptText = [
    `Generate a production-ready React + Tailwind CSS + shadcn/ui implementation based on the UI mockup image.`,
    ``,
    `Requirements:`,
    `- Match the mockup's layout, colors, typography, and visual style as closely as possible`,
    `- Use Tailwind CSS with a full custom theme (tailwind.config.ts)`,
    `- Use shadcn/ui components where appropriate`,
    `- Label each file clearly with a comment: // FILE: path/to/file.tsx`,
    `- Include: tailwind.config.ts, globals.css, and one component per major UI section`,
    `- Mobile-first responsive design`,
    ...(feedback ? [``, `User feedback to incorporate: ${feedback}`] : []),
  ].join("\n");

  const scaffold = await v0Api(variant.imageUrl, promptText);
  if (!scaffold) return false;

  await commitFileToRepo(
    owner, project, branch,
    "docs/design/v0-scaffold.md",
    `# v0 Code Scaffold\n\nGenerated from: \`${variant.name}\`\nImage: ${variant.imageUrl}\n\n---\n\n${scaffold}`,
    "chore: add v0 code scaffold [pipeline]",
  );
  console.log("  v0 scaffold committed → docs/design/v0-scaffold.md");
  return true;
}
