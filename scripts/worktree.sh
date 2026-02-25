#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WT_PREFIX="AGENTS-wt"

usage() {
  cat <<EOF
Git Worktree Manager for Multi-Agent Workspace

Usage:
  $(basename "$0") create <project> [branch]    Create a worktree for a project
  $(basename "$0") list                          List all active worktrees
  $(basename "$0") remove <project>              Remove a project worktree
  $(basename "$0") prune                         Clean up stale worktree metadata

Examples:
  $(basename "$0") create todo-app feat/todo-app
  $(basename "$0") create dashboard
  $(basename "$0") remove todo-app
  $(basename "$0") list

Worktrees are created at: ../${WT_PREFIX}-<project>/
EOF
}

cmd_create() {
  local project="${1:?Project name required}"
  local branch="${2:-feat/${project}}"
  local wt_path="${WORKSPACE_ROOT}/../${WT_PREFIX}-${project}"

  if [ -d "$wt_path" ]; then
    echo "Worktree already exists at ${wt_path}"
    exit 1
  fi

  local default_branch="${DEFAULT_BRANCH:-main}"

  if git rev-parse --verify "$branch" >/dev/null 2>&1; then
    echo "Creating worktree for existing branch: ${branch}"
    git worktree add "$wt_path" "$branch"
  else
    echo "Creating worktree with new branch: ${branch} (from ${default_branch})"
    git worktree add -b "$branch" "$wt_path" "$default_branch"
  fi

  echo ""
  echo "Worktree created:"
  echo "  Path:   ${wt_path}"
  echo "  Branch: ${branch}"
  echo ""
  echo "Open in Cursor:  cursor ${wt_path}"
  echo "Or run pipeline: cd ${wt_path} && npx tsx scripts/pipeline.ts -p ${project} -m \"...\""
}

cmd_list() {
  echo "Active worktrees:"
  echo ""
  git worktree list
}

cmd_remove() {
  local project="${1:?Project name required}"
  local wt_path="${WORKSPACE_ROOT}/../${WT_PREFIX}-${project}"

  if [ ! -d "$wt_path" ]; then
    echo "No worktree found at ${wt_path}"
    exit 1
  fi

  echo "Removing worktree: ${wt_path}"
  git worktree remove "$wt_path"
  echo "Done."
}

cmd_prune() {
  echo "Pruning stale worktree metadata..."
  git worktree prune -v
  echo "Done."
}

cd "$WORKSPACE_ROOT"

case "${1:-}" in
  create) shift; cmd_create "$@" ;;
  list)   cmd_list ;;
  remove) shift; cmd_remove "$@" ;;
  prune)  cmd_prune ;;
  *)      usage ;;
esac
