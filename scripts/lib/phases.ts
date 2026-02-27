import type { Phase, Ctx } from "./types.js";

const OPUS = "claude-4.6-opus-high-thinking";
const CODEX = "gpt-5.3-codex-high";
const GPT = "gpt-5.2-high";
const COMPOSER = "composer-1.5";

export { OPUS, CODEX, GPT, COMPOSER };

const ENV_CHECK = `
ENVIRONMENT: Check architecture docs for required API keys/env vars.
If a key is missing, implement a mock/fallback and write BLOCKER in the handoff.
`.trim();

export const PHASES: Phase[] = [
  {
    name: "Requirements Engineer",
    model: GPT,
    emoji: "📋",
    prompt: (c: Ctx) => {
      const s = c.scope;
      const docs = s === "nano"
        ? `docs/requirements/01-requirements.md — 3-5 Must reqs, Given/When/Then criteria only`
        : s === "micro"
        ? `docs/requirements/00-project-brief.md — vision + constraints (half page)\ndocs/requirements/01-requirements.md — 5-8 Must/Should reqs`
        : s === "large"
        ? `docs/requirements/00-project-brief.md — vision, personas, constraints, success metrics\ndocs/requirements/01-requirements.md — 15-20 Must/Should reqs, Given/When/Then\ndocs/requirements/glossary.md — domain terms`
        : `docs/requirements/00-project-brief.md — vision, personas, constraints\ndocs/requirements/01-requirements.md — 8-12 Must/Should reqs, Given/When/Then\ndocs/requirements/glossary.md — key terms`;
      return `Req Engineer. PROJECT: ${c.project} | SCOPE: ${s.toUpperCase()}
IDEA: ${c.userPrompt}

Create (no planning, no preamble):
${docs}

## Handoff — artifacts, open questions, env vars needed, blockers
${ENV_CHECK}`;
    },
  },
  {
    name: "Architect",
    model: OPUS,
    emoji: "🏗️",
    prompt: (c: Ctx) => {
      const s = c.scope;
      const docs = s === "nano"
        ? `docs/architecture/00-system-overview.md — Mermaid diagram + tech stack decisions (1 page max)`
        : s === "micro"
        ? `docs/architecture/00-system-overview.md — Mermaid diagram + components\ndocs/architecture/api-spec.md — endpoints`
        : s === "large"
        ? `docs/architecture/00-system-overview.md — Mermaid, components, deployment\ndocs/architecture/adr/ — 3-5 ADRs (significant decisions only)\ndocs/architecture/api-spec.md — all endpoints + schemas\ndocs/architecture/data-model.md — Mermaid ER`
        : `docs/architecture/00-system-overview.md — Mermaid, components, deployment\ndocs/architecture/adr/ — 1-2 ADRs max\ndocs/architecture/api-spec.md — endpoints\ndocs/architecture/data-model.md — Mermaid ER`;
      return `Architect. Read docs/requirements/ first.
PROJECT: ${c.project} | SCOPE: ${s.toUpperCase()}

Create (no planning):
${docs}

## Handoff — artifacts, env vars needed, blockers
${ENV_CHECK}`;
    },
  },
  {
    name: "Design Explorer",
    model: GPT,
    emoji: "🎨",
    prompt: (c: Ctx) => {
      const s = c.scope;
      const count = s === "nano" || s === "micro" ? 2 : s === "large" ? 4 : 3;
      const dirs = Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        const isLast = n === count;
        return `## direction-${n}\nname: "${isLast && count > 2 ? "<experimental — breaks conventions>" : "<evocative name>"}"\nphilosophy: "<1 sentence>"\nprompt: "high-fidelity UI screenshot of [app type] app, [exact layout], [hex colors e.g. #0a0a0f bg #7c3aed accent], [typography: font style + weights], [surface: glass/metal/matte], [1-2 unique elements]. Photorealistic, actual content, no lorem ipsum, 16:9."\nsize: "16:9"\noutput: "docs/design/mockups/direction-${n}.png"`;
      }).join("\n\n");
      return `Design Explorer. Read docs/requirements/ + docs/architecture/ first.
PROJECT: ${c.project} | SCOPE: ${s.toUpperCase()} → ${count} directions

Create docs/design/design-exploration.md with EXACTLY this structure (no markdown bold, no ** around keys):

## CONTEXT
App: <one-line>
Anti-patterns: <what to avoid>

${dirs}

FORMAT RULES:
- Write keys as plain text: \`name: "..."\` NOT \`**name:** "..."\` — the pipeline parses this file programmatically.
- Each direction = different studio, zero overlap in color/layout/typography. Exact hex values in every prompt.${count > 2 ? "\n- Last direction is experimental (radial nav / brutalist / vertical text etc)." : ""}

DO NOT attempt to generate images. DO NOT report missing image-generation API keys as blockers.
The pipeline orchestrator calls NanoBanana Pro automatically after you finish — your only job is writing this markdown file.

## Handoff — open questions, env vars for the app itself, blockers unrelated to image generation
${ENV_CHECK}`;
    },
  },
  {
    name: "Design Translator",
    model: OPUS,
    emoji: "🖌️",
    prompt: (c: Ctx) => {
      const s = c.scope;
      const dc = c.designContext;
      const components = s === "nano" ? "Button, Card" : s === "micro" ? "Button, Card, Input, Badge" : "all components visible in mockup";
      const screens = s === "nano" ? "1 primary screen" : s === "micro" ? "2-3 screens" : "all major screens";
      const assets = s !== "nano"
        ? `\n6. docs/design/visual-prompts.md — ALL visual assets the app needs (see format below)`
        : "";
      return `Design Translator. PROJECT: ${c.project} | SCOPE: ${s.toUpperCase()}
${dc
  ? `APPROVED: ${dc.approvedMockupUrl} (${dc.variantName})`
  : "Read docs/design/approved-direction.md for mockup URL."}${dc?.feedback ? `\nFEEDBACK: ${dc.feedback}` : ""}${dc?.v0ScaffoldPath ? `\nV0 SCAFFOLD: ${dc.v0ScaffoldPath} — refine to match mockup` : ""}

Analyze mockup via vision → output:
1. docs/design/design-spec.md — exact hex palette, type scale, spacing, component list
2. design-system/tailwind.config.ts — full custom theme from spec values only
3. design-system/globals.css — CSS vars, @import fonts, base + utility styles
4. design-system/components/ui/ — ${components} (all states: hover/focus/active/disabled)
5. screens/ — ${screens} (pixel-intent mockup match)${assets}

Mockup = source of truth. No invention. Every value extracted from Step 1.
DO NOT generate images. DO NOT report missing image-generation API keys as blockers. The pipeline calls NanoBanana Pro automatically after you finish.
${s !== "nano" ? `
visual-prompts.md FORMAT — one ## section per asset, the pipeline parses this:
## Logo
name: "logo"
prompt: "<detailed image prompt with exact hex colors, style, subject>"
size: "1:1"
output: "public/assets/logo.png"

Include ALL visual assets the app needs: logo, favicon, og-image, hero/banner image, background textures, illustrations, feature images, etc.
Use exact hex values from design-spec.md. Each prompt must describe a photorealistic or stylized image — NOT an SVG or vector.
Minimum assets: logo (1:1), favicon (1:1), og-image (16:9). Add hero/banner (16:9) and any other images visible in the mockup.` : ""}
## Handoff — artifacts, blockers unrelated to image generation
${ENV_CHECK}`;
    },
  },
  {
    name: "Engineer",
    model: CODEX,
    emoji: "⚙️",
    prompt: (c: Ctx) => {
      const s = c.scope;
      const tests = s === "nano" ? "No tests required." : s === "micro" ? "Tests for critical paths only." : "Tests for all critical paths.";
      return `Engineer. Read docs/requirements/, docs/architecture/, docs/design/design-spec.md.
PROJECT: ${c.project} | SCOPE: ${s.toUpperCase()}

1. Import from design-system/components/ui/ — theme tokens only, never hardcode
2. Use screens/ as UI base — add logic, don't redesign
3. Implement: routing, state, data fetching, error handling, all component states
4. Use public/assets/ images (logo.png, favicon.png, og-image.png, hero.png etc.) — they are pre-generated PNGs
5. ${tests}
6. vercel.json for deployment + README.md
Conventional commits: feat/fix/refactor/test/docs

CRITICAL — VISUAL ASSETS:
- NEVER generate SVG files for logos, icons, illustrations, or any visual assets
- NEVER write inline SVG markup for decorative/brand imagery
- All visual assets are pre-generated PNGs in public/assets/ — use <img> tags or CSS background-image to reference them
- For icons, use a library (lucide-react, heroicons, etc.) — do NOT hand-write SVG paths
- If a needed image is missing from public/assets/, use a CSS gradient/solid-color placeholder and add a NOTE in the handoff
${ENV_CHECK}`;
    },
  },
  {
    name: "QA Reviewer",
    model: COMPOSER,
    emoji: "🔍",
    prompt: (c: Ctx) => {
      const s = c.scope;
      const maxFindings = s === "micro" ? 3 : 5;
      const checks = s === "micro"
        ? "correctness, basic security, code quality"
        : "correctness, OWASP security, performance, code quality, a11y, design compliance";
      return `QA Reviewer. Read docs/ + src/ + tests/.
PROJECT: ${c.project} | SCOPE: ${s.toUpperCase()}

Create docs/reviews/review-${new Date().toISOString().split("T")[0]}.md:
- Max ${maxFindings} findings (CRITICAL/WARNING only)
- Check: ${checks}
- Requirements traceability matrix
- Verdict: PASS / PASS WITH ISSUES / FAIL

Read only. No code changes.
${ENV_CHECK}`;
    },
  },
];
