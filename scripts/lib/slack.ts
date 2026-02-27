import { fetchRetry } from "./fetch-retry.js";
import { sleep } from "./env.js";
import type { Ctx, Phase } from "./types.js";
import { poll, sendFollowup } from "./cursor.js";
import { createInterface } from "readline";

const SLACK_API = "https://slack.com/api";

const SLACK_GET_METHODS = new Set([
  "conversations.replies", "conversations.history", "conversations.list",
  "conversations.info", "reactions.get", "users.list", "auth.test",
]);

export function mention(): string {
  const uid = process.env.SLACK_USER_ID;
  return uid ? `<@${uid}>` : "";
}

async function slackApi(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "no_token" };

  if (SLACK_GET_METHODS.has(method)) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const r = await fetchRetry(`${SLACK_API}/${method}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.json() as Promise<Record<string, unknown>>;
  }

  const r = await fetchRetry(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return r.json() as Promise<Record<string, unknown>>;
}

export async function slackPost(channel: string, text: string, thread?: string | null): Promise<string | null> {
  const body: Record<string, unknown> = { channel, text, unfurl_links: false };
  if (thread) body.thread_ts = thread;
  const res = await slackApi("chat.postMessage", body);
  return res.ok ? (res.ts as string) : null;
}

export async function ensureSlackChannel(project: string): Promise<{ channelId: string | null; isNew: boolean }> {
  if (!process.env.SLACK_BOT_TOKEN) return { channelId: null, isNew: false };
  const name = `proj-${project}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80);

  let channelId: string | null = null;
  let isNew = false;

  const createRes = await slackApi("conversations.create", { name, is_private: false });
  if (createRes.ok) {
    channelId = (createRes.channel as Record<string, string>)?.id;
    isNew = true;
    console.log(`  Slack: #${name} created`);
  } else if (createRes.error === "name_taken") {
    const list = await slackApi("conversations.list", { types: "public_channel", limit: 200 });
    const channels = (list.channels || []) as Array<Record<string, string>>;
    const match = channels.find((c) => c.name === name);
    if (match) { channelId = match.id; console.log(`  Slack: #${name} (existing)`); }
  }

  if (!channelId) {
    console.log(`  Slack: channel setup failed (${createRes.error ?? "not found"})`);
    return { channelId: null, isNew: false };
  }

  await slackApi("conversations.join", { channel: channelId });

  const userId = process.env.SLACK_USER_ID;
  if (userId) {
    const inviteRes = await slackApi("conversations.invite", { channel: channelId, users: userId });
    if (inviteRes.ok) {
      console.log(`  Slack: invited user to #${name}`);
    } else if (inviteRes.error !== "already_in_channel") {
      console.log(`  Slack: invite failed (${inviteRes.error}) — join #${name} manually`);
    }
  }

  return { channelId, isNew };
}

export async function setSlackChannelContext(channelId: string, project: string, prompt: string): Promise<void> {
  const owner = process.env.GITHUB_REPO_OWNER ?? "";
  await slackApi("conversations.setTopic", { channel: channelId, topic: `Agent pipeline | github.com/${owner}/${project}` });
  await slackApi("conversations.setPurpose", { channel: channelId, purpose: prompt.slice(0, 250) + (prompt.length > 250 ? "…" : "") });
}

async function slackPostButtons(
  channel: string, headerText: string, contextLines: string[], thread?: string | null,
): Promise<string | null> {
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: headerText } },
    ...(contextLines.length ? [{ type: "context", elements: contextLines.map((t) => ({ type: "mrkdwn", text: t })) }] : []),
    {
      type: "actions", block_id: "hitl_actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "✅ Approve" }, style: "primary", action_id: "hitl_approve", value: "approve" },
        { type: "button", text: { type: "plain_text", text: "💬 Followup" }, action_id: "hitl_followup", value: "followup" },
        { type: "button", text: { type: "plain_text", text: "🛑 Stop" }, style: "danger", action_id: "hitl_stop", value: "stop" },
      ],
    },
  ];
  const body: Record<string, unknown> = { channel, blocks, text: headerText, unfurl_links: false };
  if (thread) body.thread_ts = thread;
  const res = await slackApi("chat.postMessage", body);
  return res.ok ? (res.ts as string) : null;
}

async function slackWaitForReply(channel: string, thread: string, buttonMsgTs: string | null = null, timeoutMs = 900_000): Promise<string> {
  console.log(`  Waiting for Slack reply (thread or channel)...`);
  const start = Date.now();

  const initThreadRes = await slackApi("conversations.replies", { channel, ts: thread, limit: 100 });
  const initThreadMsgs = (initThreadRes.messages || []) as Array<Record<string, string>>;
  let knownThreadCount = initThreadMsgs.length;

  const initHistRes = await slackApi("conversations.history", { channel, limit: 10 });
  const initHistMsgs = (initHistRes.messages || []) as Array<Record<string, string>>;
  const knownLatestChannelTs = initHistMsgs[0]?.ts || "0";

  while (Date.now() - start < timeoutMs) {
    await sleep(5000);

    const threadRes = await slackApi("conversations.replies", { channel, ts: thread, limit: 100 });
    const threadMsgs = (threadRes.messages || []) as Array<Record<string, string>>;

    if (threadMsgs.length > knownThreadCount) {
      for (let i = knownThreadCount; i < threadMsgs.length; i++) {
        const msg = threadMsgs[i];
        if (!msg.bot_id && !msg.app_id) {
          console.log(`  Slack thread reply: "${msg.text || ""}"`);
          return msg.text || "";
        }
      }
      knownThreadCount = threadMsgs.length;
    }

    if (buttonMsgTs) {
      const reactRes = await slackApi("reactions.get", { channel, timestamp: buttonMsgTs, full: true });
      if (reactRes.ok) {
        const reactions = ((reactRes.message as Record<string, unknown>)?.reactions || []) as Array<{ name: string; users: string[] }>;
        for (const r of reactions) {
          if (["+1", "thumbsup", "white_check_mark", "heavy_check_mark", "approved"].includes(r.name)) {
            console.log(`  Slack reaction: :${r.name}: → approve`); return "approve";
          }
          if (["octagonal_sign", "x", "no_entry", "stop_sign", "hand"].includes(r.name)) {
            console.log(`  Slack reaction: :${r.name}: → stop`); return "stop";
          }
        }
      }
    }

    const histRes = await slackApi("conversations.history", { channel, limit: 5 });
    const histMsgs = (histRes.messages || []) as Array<Record<string, string>>;
    for (const msg of histMsgs) {
      if (msg.ts > knownLatestChannelTs && !msg.bot_id && !msg.app_id && !msg.thread_ts) {
        const cleaned = (msg.text || "").replace(/<@[A-Z0-9]+>/g, "").trim();
        if (cleaned) { console.log(`  Slack channel reply: "${cleaned}"`); return cleaned; }
      }
    }
  }

  console.log("  Slack reply timeout (15min) — auto-approving.");
  return "approve";
}

function askUser(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => { rl.question(q, (a) => { rl.close(); r(a.trim()); }); });
}

export interface HitLResult { decision: "approve" | "stop"; }

export async function hitl(ctx: Ctx, agentId: string, phase: Phase, agentBranch: string, previewUrl?: string | null): Promise<HitLResult> {
  if (ctx.slackChannel) {
    const branchUrl = `https://github.com/${ctx.owner}/${ctx.project}/tree/${agentBranch}`;
    const header = `${phase.emoji} *Phase complete: ${phase.name}* — ${mention()} your review is needed`;
    const context = [
      `Branch: <${branchUrl}|${agentBranch}>`,
      previewUrl ? `Preview: ${previewUrl}` : null,
      `_React with 👍 to approve, 🛑 to stop, or reply \`followup: <msg>\`_`,
    ].filter(Boolean) as string[];

    const ts = await slackPostButtons(ctx.slackChannel, header, context, ctx.slackThread);
    if (!ts) { console.log("  Slack post failed, falling back to terminal."); }
    else {
      while (true) {
        const reply = await slackWaitForReply(ctx.slackChannel, ctx.slackThread || ts, ts);
        const lower = reply.toLowerCase().trim();

        if (["approve", "a", "yes", "hitl_approve"].includes(lower)) return { decision: "approve" };
        if (["stop", "s", "hitl_stop"].includes(lower)) return { decision: "stop" };
        if (lower.startsWith("followup:") || lower.startsWith("followup ") || lower === "hitl_followup") {
          let msg = lower.replace(/^(hitl_followup|followup[:])?\s*/i, "").replace(/^followup\s+/i, "").trim();
          if (!msg) {
            await slackPost(ctx.slackChannel, `${mention()} _Please reply with your followup instructions_`, ctx.slackThread);
            msg = (await slackWaitForReply(ctx.slackChannel, ctx.slackThread || ts, ts)).trim();
          }
          await sendFollowup(agentId, msg);
          await slackPost(ctx.slackChannel, `💬 _Followup sent. Agent is working..._`, ctx.slackThread);
          await poll(agentId);

          await slackPostButtons(ctx.slackChannel, `${phase.emoji} *${phase.name}* — updated. ${mention()} Ready for review.`, [`_Agent has finished. Review and respond._`], ctx.slackThread);
        }
      }
    }
  }

  console.log(`\n  ${phase.emoji} Phase complete: ${phase.name}`);
  if (previewUrl) console.log(`  Preview: ${previewUrl}`);
  while (true) {
    const a = await askUser(`  [a]pprove | [f]ollowup <msg> | [s]top > `);
    if (a === "a" || a === "approve") return { decision: "approve" };
    if (a === "s" || a === "stop") return { decision: "stop" };
    if (a.startsWith("f ") || a.startsWith("followup ")) {
      await sendFollowup(agentId, a.replace(/^(f|followup)\s+/, ""));
      await poll(agentId);
    } else { console.log("  Commands: a (approve) | f <message> (followup) | s (stop)"); }
  }
}

export { askUser, slackWaitForReply };
