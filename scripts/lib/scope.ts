import type { ScopeLevel } from "./types.js";

export function inferScope(prompt: string): ScopeLevel {
  const lower = prompt.toLowerCase();
  const words = prompt.split(/\s+/).length;

  const nanoKw = /\b(single page|one page|landing page|simple|quick|just a|todo|calculator|counter|minimal|demo|prototype|toy)\b/;
  if (words <= 30 || (words <= 50 && nanoKw.test(lower))) return "nano";

  const complexSignals = [
    /\b(api|rest|graphql|grpc)\b/,
    /\b(auth|oauth|jwt|login|signup)\b/,
    /\b(database|sql|postgres|mysql|mongo|redis|supabase)\b/,
    /\b(real.?time|websocket|stream|live)\b/,
    /\b(payment|stripe|billing|subscription)\b/,
    /\b(search|filter|sort|paginate)\b/,
    /\b(analytics|dashboard|chart|metric)\b/,
    /\b(upload|media|file|cdn)\b/,
    /\b(notification|email|sms|push)\b/,
    /\b(ai|ml|llm|embedding|vector)\b/,
    /\b(multi.?tenant|enterprise|saas|platform)\b/,
    /\b(cache|queue|job|worker|webhook)\b/,
  ].filter((p) => p.test(lower)).length;

  if (complexSignals >= 4 || words > 120) return "large";
  if (complexSignals >= 2 || words > 50) return "standard";
  return "micro";
}

export function inferMode(prompt: string): "feat" | "fix" {
  const lower = prompt.toLowerCase();
  if (/\b(fix|bug|typo|broken|error|crash|wrong|patch|hotfix)\b/.test(lower)) return "fix";
  return "feat";
}

export function inferStartPhase(prompt: string): number {
  const lower = prompt.toLowerCase();
  const codeOnly = /\b(fix|bug|typo|hotfix|patch|broken|error|crash|rename|refactor|update dep|upgrade)\b/;
  if (codeOnly.test(lower)) return 5;

  const designOnly = /\b(redesign|rebrand|new look|theme|logo|color|font|ui refresh|visual|design system)\b/;
  if (designOnly.test(lower)) return 3;

  const translateOnly = /\b(translate design|implement design|code the design|build from mockup|mockup to code)\b/;
  if (translateOnly.test(lower)) return 4;

  const archLevel = /\b(api|database|schema|migrate|infrastructure|deploy|auth|endpoint|backend|microservice)\b/;
  if (archLevel.test(lower)) return 2;

  return 1;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
