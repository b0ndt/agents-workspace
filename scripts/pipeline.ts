import "dotenv/config";

import type { Ctx, Result, RunMode, ScopeLevel } from "./lib/types.js";
import { required, sleep, bar } from "./lib/env.js";
import { inferScope, inferMode, inferStartPhase, slugify } from "./lib/scope.js";
import { PHASES, OPUS, CODEX, GPT, COMPOSER } from "./lib/phases.js";
import { ensureRepo, branchExists, createBranch, mergeBranch, createPR, commitFileToRepo } from "./lib/github.js";
import { cursorApi, verifyRepoAccess, launchAgent, poll } from "./lib/cursor.js";
import { ensureSlackChannel, setSlackChannelContext, slackPost, hitl, mention, askUser, slackWaitForReply } from "./lib/slack.js";
import { deployVercel } from "./lib/vercel.js";
import { generateDesignVariants, generateNanoBananaAssets } from "./lib/nanobanana.js";
import { callV0AndCommitScaffold } from "./lib/v0.js";

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

function preflight(): string[] {
  const errors: string[] = [];
  if (!process.env.CURSOR_API_KEY) errors.push("CURSOR_API_KEY is required");
  if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) errors.push("GITHUB_PERSONAL_ACCESS_TOKEN is required");
  if (!process.env.GITHUB_REPO_OWNER) errors.push("GITHUB_REPO_OWNER is required");
  if (!process.env.VERCEL_TOKEN) errors.push("VERCEL_TOKEN missing — final deploy will be skipped");
  if (!process.env.NANOBANANA_API_KEY) errors.push("NANOBANANA_API_KEY missing — design mockups will be skipped");
  return errors;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Design Explorer helpers (variant selection + approval)
// ---------------------------------------------------------------------------

function parseVariantReply(reply: string, count: number): { selectedIndex: number; feedback: string } {
  const numMatch = reply.match(new RegExp(`\\b([1-${count}])\\b`));
  if (numMatch) {
    const idx = Math.min(parseInt(numMatch[1]) - 1, count - 1);
    return { selectedIndex: idx, feedback: reply.replace(numMatch[0], "").trim() };
  }
  return { selectedIndex: 0, feedback: reply };
}

async function presentVariantsForSelection(
  variants: Array<{ name: string; philosophy: string; imageUrl: string }>,
  ctx: Ctx,
): Promise<{ selectedIndex: number; feedback: string }> {
  if (variants.length === 0) {
    console.log("  No variants generated — proceeding without visual selection.");
    return { selectedIndex: 0, feedback: "" };
  }

  const variantLines = variants.map((v, i) =>
    `*${i + 1}. ${v.name}*\n_${v.philosophy}_\n${v.imageUrl}`,
  ).join("\n\n");

  if (ctx.slackChannel) {
    await slackPost(
      ctx.slackChannel,
      `🎨 *Design Explorer complete.* ${mention()} — Choose a direction:\n\n${variantLines}\n\n_Reply with the number (1–${variants.length}), or describe modifications (e.g. "2 but with the color palette of 3")._`,
      ctx.slackThread,
    );
    console.log(`  Waiting for variant selection via Slack...`);
    const reply = await slackWaitForReply(ctx.slackChannel, ctx.slackThread!, null, 1_800_000);
    return parseVariantReply(reply, variants.length);
  }

  console.log(`\n  🎨 Design Explorer complete. Choose a direction:\n`);
  variants.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name}`);
    console.log(`     ${v.philosophy}`);
    console.log(`     ${v.imageUrl}\n`);
  });
  const reply = await askUser(`  Enter 1–${variants.length} (or describe modifications): `);
  return parseVariantReply(reply, variants.length);
}

async function writeApprovedDirectionToRepo(
  owner: string, project: string, branch: string,
  variants: Array<{ key: string; name: string; philosophy: string; imageUrl: string }>,
  selectedIndex: number, feedback: string,
): Promise<void> {
  const selected = variants[selectedIndex] ?? variants[0];
  if (!selected) return;
  const content = [
    `# Approved Design Direction`,
    ``,
    `Selected: \`${selected.key}\` — **${selected.name}**`,
    ``,
    `## Image Reference`,
    selected.imageUrl,
    ``,
    `## Design Philosophy`,
    selected.philosophy,
    ``,
    ...(feedback ? [`## User Feedback`, feedback, ``] : []),
    `## All Variants`,
    ...variants.map((v, i) => `${i + 1}. **${v.name}** — ${v.imageUrl}`),
  ].join("\n");
  await commitFileToRepo(owner, project, branch, "docs/design/approved-direction.md", content, "chore: add approved design direction [pipeline]");
  console.log(`  Approved: ${selected.name} → docs/design/approved-direction.md`);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function run(
  project: string,
  userPrompt: string,
  mode: RunMode,
  startPhase: number,
  resumeRef: string | null,
  interactive: boolean,
  scopeOverride: ScopeLevel | null,
  dryRun: boolean,
) {
  // Pre-flight
  const pfErrors = preflight();
  const criticalErrors = pfErrors.filter((e) => !e.includes("missing —"));
  if (criticalErrors.length > 0) {
    console.error("\n  PRE-FLIGHT FAILED:");
    criticalErrors.forEach((e) => console.error(`  ✗ ${e}`));
    process.exit(1);
  }
  const warnings = pfErrors.filter((e) => e.includes("missing —"));
  if (warnings.length > 0) {
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }

  const owner = required("GITHUB_REPO_OWNER");
  const startTime = Date.now();

  console.log(bar("="));
  console.log(`  AGENT PIPELINE — ${mode.toUpperCase()} mode${interactive ? " (interactive)" : ""}${dryRun ? " (DRY RUN)" : ""}`);
  console.log(bar("="));

  const { repoUrl, isNew } = await ensureRepo(owner, project);
  await verifyRepoAccess(owner, project);

  if (mode === "auto" as RunMode) {
    mode = isNew ? "init" : inferMode(userPrompt);
  }
  console.log(`  Project: ${project} (${isNew ? "new repo" : "existing"}) — ${mode} mode`);

  if (startPhase === 0) {
    startPhase = isNew ? 1 : inferStartPhase(userPrompt);
    if (startPhase > 1) console.log(`  Auto-skipping to phase ${startPhase} (${PHASES[startPhase - 1].name}) based on prompt`);
  }

  let targetBranch = "main";
  if (mode === "feat" || mode === "fix") {
    const slug = slugify(userPrompt);
    targetBranch = `${mode}/${slug}`;
    if (!dryRun) {
      if (!(await branchExists(owner, project, targetBranch))) {
        await createBranch(owner, project, targetBranch, "main");
      } else {
        console.log(`  Branch exists: ${targetBranch}`);
      }
    }
  }
  console.log(`  Target: ${targetBranch} | Phases: ${startPhase}–${PHASES.length}`);

  const me = (await cursorApi("/v0/me")) as Record<string, unknown>;
  console.log(`  Cursor: ${me.apiKeyName} (${me.userEmail})`);

  const vars = ["CURSOR_API_KEY", "GITHUB_PERSONAL_ACCESS_TOKEN", "VERCEL_TOKEN", "SLACK_BOT_TOKEN", "NANOBANANA_API_KEY", "V0_API_KEY"] as const;
  for (const v of vars) console.log(`  ${process.env[v] ? "✓" : "–"}  ${v}`);
  console.log(bar("="));

  // Scope
  const scope = scopeOverride ?? inferScope(userPrompt);
  console.log(`\n  Scope: ${scope.toUpperCase()}${scopeOverride ? " (manual override)" : ""} — ${
    scope === "nano" ? "minimal deliverables, QA skipped"
    : scope === "micro" ? "lean deliverables, 2 design variants"
    : scope === "large" ? "full deliverables, 4 design variants"
    : "standard deliverables, 3 design variants"
  }`);

  // --- Dry run: show plan and exit ---
  if (dryRun) {
    console.log(`\n${bar()}`);
    console.log("  DRY RUN — planned execution:");
    console.log(bar());
    for (let i = 0; i < PHASES.length; i++) {
      const p = PHASES[i];
      const skipped = i < startPhase - 1 ? " (skipped — before --from)"
        : scope === "nano" && p.name === "QA Reviewer" ? " (skipped — nano scope)"
        : "";
      console.log(`  ${i + 1}. ${p.emoji} ${p.name} [${p.model}]${skipped}`);
    }
    console.log(`\n  Owner: ${owner}`);
    console.log(`  Repo: https://github.com/${owner}/${project}`);
    console.log(`  Mode: ${mode} | Branch: ${targetBranch}`);
    console.log(`  Scope: ${scope.toUpperCase()} | Interactive: ${interactive}`);
    console.log(`  NanoBanana: ${process.env.NANOBANANA_API_KEY ? "ready" : "skipped (no key)"}`);
    console.log(`  v0: ${process.env.V0_API_KEY ? "ready" : "skipped (no key)"}`);
    console.log(`\n  No agents launched. Remove --dry-run to execute.`);
    console.log(bar("="));
    return;
  }

  const { channelId: slackChannel, isNew: slackChannelNew } = await ensureSlackChannel(project);
  if (slackChannel && slackChannelNew) await setSlackChannelContext(slackChannel, project, userPrompt);

  // Slack kick-off
  let slackThread: string | null = null;
  if (slackChannel) {
    const modeLabel = mode === "init" ? "🚀 Initial build" : mode === "feat" ? "✨ Feature" : "🔧 Fix";
    const phasesDesc = startPhase > 1
      ? `Phases ${startPhase}–${PHASES.length}: ${PHASES.slice(startPhase - 1).map((p) => p.name).join(" → ")}`
      : `All ${PHASES.length} phases`;
    slackThread = await slackPost(slackChannel, [
      `${modeLabel}: *${project}*`,
      `Branch: \`${targetBranch}\` · Scope: *${scope.toUpperCase()}*`,
      phasesDesc,
      `Prompt: _${userPrompt.slice(0, 300)}${userPrompt.length > 300 ? "…" : ""}_`,
      `Repo: https://github.com/${owner}/${project}`,
    ].join("\n"));
  }

  const ctx: Ctx = { project, userPrompt, repoUrl, owner, targetBranch, mode, slackChannel, slackThread, scope };
  const results: Result[] = [];
  let latestAgentBranch: string | null = resumeRef;

  for (let i = 0; i < PHASES.length; i++) {
    const phase = PHASES[i];

    if (i < startPhase - 1) {
      results.push({ phase: phase.name, agentId: "–", status: "skipped" });
      continue;
    }

    if (scope === "nano" && phase.name === "QA Reviewer") {
      console.log(`\n  PHASE ${i + 1}/${PHASES.length}: ${phase.emoji} ${phase.name} — SKIPPED (nano scope)`);
      results.push({ phase: phase.name, agentId: "–", status: "skipped (nano)" });
      continue;
    }

    console.log(`\n${bar()}`);
    console.log(`  PHASE ${i + 1}/${PHASES.length}: ${phase.emoji} ${phase.name}`);
    console.log(bar());

    const agentSource = latestAgentBranch ?? targetBranch;

    try {
      const agentId = await launchAgent(phase, { ...ctx }, agentSource);
      const agentUrl = `https://cursor.com/agents?id=${agentId}`;
      const phaseStart = Date.now();

      if (slackChannel && slackThread) {
        await slackPost(slackChannel, `${phase.emoji} *${phase.name}* · <${agentUrl}|agent> · running…`, slackThread);
      }

      await poll(agentId);

      const final = (await cursorApi(`/v0/agents/${agentId}`)) as { target?: { branchName?: string } };
      const agentBranch = final.target?.branchName;
      if (!agentBranch) throw new Error("Agent finished but created no branch");

      console.log(`  Agent branch: ${agentBranch}`);
      latestAgentBranch = agentBranch;
      const branchUrl = `https://github.com/${owner}/${project}/tree/${agentBranch}`;
      let previewUrl: string | null = null;

      // --- Design Explorer post-processing ---
      if (phase.name === "Design Explorer") {
        const variants = await generateDesignVariants(owner, project, agentBranch);

        if (variants.length > 0) {
          let selectedIndex = 0;
          let feedback = "";

          if (interactive) {
            const sel = await presentVariantsForSelection(variants, { ...ctx });
            selectedIndex = sel.selectedIndex;
            feedback = sel.feedback;
          } else {
            console.log(`  Auto-selecting direction-1 ("${variants[0].name}") — use --interactive to choose`);
            if (ctx.slackChannel && ctx.slackThread) {
              await slackPost(
                ctx.slackChannel,
                `🎨 *Design Explorer complete.* Auto-selected direction-1: *${variants[0].name}* — add \`--interactive\` to choose.\n${variants.map((v, j) => `${j + 1}. ${v.name} — ${v.imageUrl}`).join("\n")}`,
                ctx.slackThread,
              );
            }
          }

          await writeApprovedDirectionToRepo(owner, project, agentBranch, variants, selectedIndex, feedback);

          let v0ScaffoldPath: string | undefined;
          if (process.env.V0_API_KEY && variants[selectedIndex]) {
            const ok = await callV0AndCommitScaffold(owner, project, agentBranch, variants[selectedIndex], feedback);
            if (ok) v0ScaffoldPath = "docs/design/v0-scaffold.md";
          }

          ctx.designContext = {
            approvedMockupUrl: variants[selectedIndex]?.imageUrl ?? variants[0].imageUrl,
            variantName: variants[selectedIndex]?.name ?? variants[0].name,
            feedback,
            ...(v0ScaffoldPath ? { v0ScaffoldPath } : {}),
          };
        }
      }

      // --- Design Translator post-processing ---
      if (phase.name === "Design Translator") {
        const count = await generateNanoBananaAssets(owner, project, agentBranch);
        if (count > 0) console.log(`  NanoBanana: ${count} brand asset(s) added to branch`);
      }

      // --- HitL ---
      if (interactive) {
        const { decision } = await hitl(ctx, agentId, phase, agentBranch, previewUrl);
        if (decision === "stop") {
          results.push({ phase: phase.name, agentId, status: "stopped", detail: agentBranch });
          if (slackChannel && slackThread) {
            await slackPost(slackChannel, `🛑 *Pipeline stopped* after ${phase.name}. Branch: \`${agentBranch}\``, slackThread);
          }
          break;
        }
      }

      // --- Merge ---
      const merged = await mergeBranch(owner, project, agentBranch, targetBranch);
      if (!merged) throw new Error(`Merge of ${agentBranch} → ${targetBranch} failed`);
      latestAgentBranch = null;

      const phaseDuration = Date.now() - phaseStart;
      results.push({ phase: phase.name, agentId, status: "completed", detail: agentBranch, durationMs: phaseDuration });

      if (slackChannel && slackThread) {
        const totalMins = Math.round((Date.now() - startTime) / 60_000);
        const progressBar = PHASES.map((_, idx) => idx <= i ? "✅" : idx < startPhase - 1 ? "⊘" : "⬜").join("");
        await slackPost(slackChannel, [
          `${phase.emoji} *${phase.name}* ✅ — ${formatDuration(phaseDuration)} · merged to \`${targetBranch}\``,
          `<${branchUrl}|branch> · <${agentUrl}|agent>${previewUrl ? ` · <${previewUrl}|preview>` : ""}`,
          `${progressBar}  _${totalMins}m total_`,
        ].join("\n"), slackThread);
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n  Phase failed: ${msg}`);
      results.push({ phase: phase.name, agentId: "–", status: "failed", detail: msg });

      if (slackChannel && slackThread) {
        await slackPost(slackChannel, `❌ *${phase.name}* failed · ${mention()}\n\`\`\`${msg.slice(0, 300)}\`\`\`\n${interactive ? "_Reply \`retry\` or \`stop\`_" : ""}`, slackThread);
      }

      if (interactive) {
        const a = slackChannel ? await slackWaitForReply(slackChannel, slackThread!) : await askUser("  [r]etry / [s]top > ");
        if (a.toLowerCase().startsWith("r")) { i--; results.pop(); continue; }
      }
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // End of pipeline
  // ---------------------------------------------------------------------------

  const allOk = results.every((r) => r.status === "completed" || r.status.startsWith("skipped"));

  if (allOk) {
    console.log(`\n${bar()}`);
    console.log("  FINAL STEPS");
    console.log(bar());

    const url = await deployVercel(owner, project, targetBranch);
    if (url) {
      results.push({ phase: "Vercel Deploy", agentId: url, status: "completed" });
      if (slackChannel && slackThread) {
        await slackPost(slackChannel, `🚀 *Final preview live*: ${url}`, slackThread);
      }
    }

    if (mode === "feat" || mode === "fix") {
      const prTitle = `${mode === "feat" ? "feat" : "fix"}: ${userPrompt.slice(0, 72)}`;
      const prBody = [
        `## Summary`, userPrompt, ``,
        `## Pipeline`, results.filter((r) => r.status === "completed").map((r) => `- ✅ ${r.phase}`).join("\n"),
        url ? `\n## Preview\n${url}` : "",
      ].join("\n");

      const prUrl = await createPR(owner, project, targetBranch, "main", prTitle, prBody);
      if (prUrl) {
        results.push({ phase: "Pull Request", agentId: prUrl, status: "completed" });
        console.log(`  PR created: ${prUrl}`);
        if (slackChannel && slackThread) {
          await slackPost(slackChannel, `🔀 *Pull Request ready for review:*\n${prUrl}`, slackThread);
        }
      }
    } else {
      results.push({ phase: "Deployed to main", agentId: targetBranch, status: "completed" });
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  const totalMs = Date.now() - startTime;
  console.log(`\n${bar("=")}`);
  console.log("  PIPELINE SUMMARY");
  console.log(bar("="));
  for (const r of results) {
    const icon = r.status === "completed" ? "✓" : r.status.startsWith("skipped") ? "⊘" : "✗";
    const timing = r.durationMs ? ` (${formatDuration(r.durationMs)})` : "";
    console.log(`  [${icon}] ${r.phase}${timing}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(`\n  Total: ${formatDuration(totalMs)}`);
  console.log(bar("="));

  if (slackChannel && slackThread) {
    const lines = results.map((r) => {
      const icon = r.status === "completed" ? "✅" : r.status.startsWith("skipped") ? "⊘" : "❌";
      const timing = r.durationMs ? ` (${formatDuration(r.durationMs)})` : "";
      return `${icon} ${r.phase}${timing}`;
    });
    await slackPost(slackChannel,
      `*Pipeline complete* — ${allOk ? "✅ All phases succeeded" : "⚠️ Some phases failed"}\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n_Total: ${formatDuration(totalMs)}_`,
      slackThread,
    );
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  console.log(`
Agent Pipeline — Multi-agent project builder

Usage:
  npx tsx scripts/pipeline.ts -p <name> -m "<prompt>"
  npx tsx scripts/pipeline.ts -p <name> -m "<prompt>" --interactive
  npx tsx scripts/pipeline.ts -p <name> -m "<prompt>" --init|--feat|--fix
  npx tsx scripts/pipeline.ts -p <name> -m "<prompt>" --from 3 --ref <branch>

  npx tsx scripts/pipeline.ts --status <agent-id>
  npx tsx scripts/pipeline.ts --models
  npx tsx scripts/pipeline.ts --verify

  # Preview what would happen without launching agents
  npx tsx scripts/pipeline.ts -p <name> -m "<prompt>" --dry-run

  # Override auto-detected scope
  npx tsx scripts/pipeline.ts -p <name> -m "<prompt>" --scope nano

Auto-detection:
  Mode:    New repo → init. Existing → "fix/bug/typo" → fix | else → feat
  Phases:  "fix typo" → Engineer (5) | "change logo" → Design Explorer (3)
           "implement design" → Design Translator (4) | "add API" → Architect (2)
  Scope:   nano (≤30w) | micro (≤50w) | standard (50-120w) | large (>120w / 4+ signals)

Options:
  -p, --project      Project name (kebab-case)
  -m, --prompt       Project/feature description
  --init|--feat|--fix Force mode
  -f, --from         Start from phase N (1-6)
  -r, --ref          Source branch for --from
  -i, --interactive  Pause after each phase for review
  --scope <level>    Override scope: nano | micro | standard | large
  --dry-run          Show plan without launching agents

Phases:
  1 📋 Requirements Engineer  (${GPT})
  2 🏗️  Architect              (${OPUS})
  3 🎨 Design Explorer        (${GPT})      → NanoBanana variants + HitL
  4 🖌️  Design Translator      (${OPUS})     → design-system + screens + v0
  5 ⚙️  Engineer               (${CODEX})    → app logic
  6 🔍 QA Reviewer            (${COMPOSER})
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || !args.length) { usage(); return; }
  if (args.includes("--models")) {
    const r = (await cursorApi("/v0/models")) as { models: string[] };
    console.log("Available models:"); r.models.forEach((m) => console.log(`  ${m}`)); return;
  }
  if (args.includes("--verify")) {
    const m = (await cursorApi("/v0/me")) as Record<string, unknown>;
    console.log(`API key: ${m.apiKeyName} (${m.userEmail})`); return;
  }
  if (args.includes("--status") || args.includes("-s")) {
    const idx = Math.max(args.indexOf("--status"), args.indexOf("-s"));
    if (!args[idx + 1]) { console.error("--status requires an agent ID"); process.exit(1); }
    console.log(JSON.stringify(await cursorApi(`/v0/agents/${args[idx + 1]}`), null, 2)); return;
  }

  let project = "", prompt = "", ref: string | null = null;
  const interactive = args.includes("--interactive") || args.includes("-i");
  const dryRun = args.includes("--dry-run");

  let modeArg: RunMode = "auto";
  if (args.includes("--init")) modeArg = "init";
  else if (args.includes("--feat")) modeArg = "feat";
  else if (args.includes("--fix")) modeArg = "fix";

  let startPhase = 0;
  let scopeOverride: ScopeLevel | null = null;
  const validScopes: ScopeLevel[] = ["nano", "micro", "standard", "large"];

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "-p" || args[i] === "--project") && args[i + 1]) project = args[++i];
    else if ((args[i] === "-m" || args[i] === "--prompt") && args[i + 1]) prompt = args[++i];
    else if ((args[i] === "-f" || args[i] === "--from") && args[i + 1]) {
      startPhase = parseInt(args[++i], 10);
      if (isNaN(startPhase) || startPhase < 1 || startPhase > PHASES.length) {
        console.error(`--from must be 1–${PHASES.length}`); process.exit(1);
      }
    }
    else if ((args[i] === "-r" || args[i] === "--ref") && args[i + 1]) ref = args[++i];
    else if (args[i] === "--scope" && args[i + 1]) {
      const s = args[++i] as ScopeLevel;
      if (!validScopes.includes(s)) {
        console.error(`--scope must be one of: ${validScopes.join(", ")}`); process.exit(1);
      }
      scopeOverride = s;
    }
  }

  if (!project || !prompt) { console.error("--project and --prompt are required"); usage(); process.exit(1); }
  if (startPhase > 1 && !ref && !dryRun) { console.error("--from requires --ref (the branch to resume from)"); process.exit(1); }

  await run(project, prompt, modeArg, startPhase, ref, interactive, scopeOverride, dryRun);
}

main().catch((e) => { console.error("Pipeline error:", e); process.exit(1); });
