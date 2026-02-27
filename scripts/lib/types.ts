export type RunMode = "init" | "feat" | "fix" | "auto";
export type ScopeLevel = "nano" | "micro" | "standard" | "large";

export interface Phase {
  name: string;
  model: string;
  emoji: string;
  prompt: (ctx: Ctx) => string;
}

export interface Ctx {
  project: string;
  userPrompt: string;
  repoUrl: string;
  owner: string;
  targetBranch: string;
  mode: RunMode;
  slackChannel: string | null;
  slackThread: string | null;
  scope: ScopeLevel;
  designContext?: {
    approvedMockupUrl: string;
    variantName: string;
    feedback: string;
    v0ScaffoldPath?: string;
  };
}

export interface AgentRes {
  id: string;
  status: string;
  target?: { branchName?: string; url?: string; prUrl?: string };
  summary?: string;
  [k: string]: unknown;
}

export interface Result {
  phase: string;
  agentId: string;
  status: string;
  detail?: string;
  durationMs?: number;
}

export interface DesignDirection {
  key: string;
  name: string;
  philosophy: string;
  prompt: string;
  size: string;
  output: string;
}

export interface DesignVariantResult {
  key: string;
  name: string;
  philosophy: string;
  imageUrl: string;
  output: string;
}

export interface VisualPrompt {
  name: string;
  prompt: string;
  size: string;
  output: string;
}
