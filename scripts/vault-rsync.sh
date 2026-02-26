#!/usr/bin/env bash
# vault-rsync.sh — rsync .md files from ghq repos' ψ/ dirs to oracle-vault
#
# Usage:
#   vault-rsync.sh                    # sync all eligible repos
#   vault-rsync.sh /path/to/repo      # sync single repo
#   vault-rsync.sh --dry-run          # preview changes (rsync -n)
#   vault-rsync.sh --commit           # rsync + git commit + push
#   vault-rsync.sh --list             # list eligible repos (real ψ/, not symlinks)
#   vault-rsync.sh --help             # show this help
#
# Worktrees (.wt-*) sync to the parent repo's vault path (merge, no --delete).
# Combines with existing vault:sync (which does frontmatter injection + DB tracking).
# This is the fast catch-up tool for bulk .md syncing.

set -euo pipefail

# --- Config ---
GHQ_ROOT="$(ghq root 2>/dev/null || echo "$HOME/Code")"

# Vault path: env var or auto-detect via ghq (any repo ending in /oracle-vault)
if [[ -n "${ORACLE_VAULT_PATH:-}" ]]; then
  VAULT="$ORACLE_VAULT_PATH"
else
  VAULT="$(ghq list -p | grep '/oracle-vault$' | head -1 || true)"
fi

if [[ -z "$VAULT" || ! -d "$VAULT" ]]; then
  echo "ERROR: Cannot find oracle-vault. Set ORACLE_VAULT_PATH or clone your oracle-vault repo via ghq." >&2
  exit 1
fi

# --- Flags ---
DRY_RUN=false
COMMIT=false
LIST_ONLY=false
SINGLE_REPO=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    --commit)   COMMIT=true ;;
    --list)     LIST_ONLY=true ;;
    --help|-h)
      sed -n '2,/^$/s/^# //p' "$0"
      exit 0
      ;;
    *)
      # Treat as single repo path
      if [[ -d "$arg" ]]; then
        SINGLE_REPO="$arg"
      else
        echo "ERROR: Unknown argument or not a directory: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

# --- Helpers ---

# Check if path is a worktree (.wt-* or .wt/)
is_worktree() {
  [[ "$1" =~ \.wt[-/] ]]
}

# Strip worktree suffix to get parent repo path
# e.g. github.com/laris-co/fireman-oracle.wt-1 → github.com/laris-co/fireman-oracle
parent_path() {
  local rel="$1"
  echo "$rel" | sed -E 's/\.wt[-/][0-9]+$//'
}

# Convert repo relative path to vault destination (lowercase, worktree → parent)
vault_dest() {
  local rel="$1"
  # Worktrees map to parent repo
  if is_worktree "$rel"; then
    rel="$(parent_path "$rel")"
  fi
  # Lowercase for vault consistency
  local lower
  lower="$(echo "$rel" | tr '[:upper:]' '[:lower:]')"
  echo "${VAULT}/${lower}"
}

# Check if a repo is eligible for syncing
is_eligible() {
  local repo="$1"
  local rel="${repo#"$GHQ_ROOT"/}"

  # Must have ψ/ dir
  [[ -d "$repo/ψ" ]] || return 1

  # Skip if ψ is a symlink (already points to vault)
  [[ ! -L "$repo/ψ" ]] || return 1

  # Skip the vault repo itself
  [[ ! "$rel" =~ oracle-vault$ ]] || return 1

  return 0
}

# Get list of eligible repos
eligible_repos() {
  if [[ -n "$SINGLE_REPO" ]]; then
    local resolved
    resolved="$(cd "$SINGLE_REPO" && pwd)"
    if is_eligible "$resolved"; then
      echo "$resolved"
    else
      echo "SKIP: $resolved (symlink or no ψ/)" >&2
    fi
  else
    while IFS= read -r repo; do
      if is_eligible "$repo"; then
        echo "$repo"
      fi
    done < <(ghq list -p)
  fi
}

# --- Main ---

# List mode
if [[ "$LIST_ONLY" == true ]]; then
  echo "Eligible repos (real ψ/, not symlinked):"
  echo ""
  repos=0
  worktrees=0
  while IFS= read -r repo; do
    rel="${repo#"$GHQ_ROOT"/}"
    md_count=$(find "$repo/ψ" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
    if is_worktree "$rel"; then
      dest_rel="$(parent_path "$rel" | tr '[:upper:]' '[:lower:]')"
      echo "  $rel  (${md_count} .md) → vault:${dest_rel}"
      worktrees=$((worktrees + 1))
    else
      echo "  $rel  (${md_count} .md)"
      repos=$((repos + 1))
    fi
  done < <(eligible_repos)
  echo ""
  echo "Repos: $repos  Worktrees: $worktrees  Total: $((repos + worktrees))"
  exit 0
fi

# Sync mode
BASE_FLAGS=(-av --include='*/' --include='*.md' --exclude='*')
if [[ "$DRY_RUN" == true ]]; then
  BASE_FLAGS+=(-n)
  echo "=== DRY RUN — no files will be changed ==="
  echo ""
fi

synced=0
while IFS= read -r repo; do
  rel="${repo#"$GHQ_ROOT"/}"
  dest="$(vault_dest "$rel")"

  # Worktrees merge (no --delete) since multiple sources → one destination
  # Regular repos use --delete to mirror exactly
  flags=("${BASE_FLAGS[@]}")
  if is_worktree "$rel"; then
    parent_rel="$(parent_path "$rel" | tr '[:upper:]' '[:lower:]')"
    echo "--- $rel → vault:${parent_rel} (merge) ---"
  else
    flags+=(--delete)
    echo "--- $rel ---"
  fi

  mkdir -p "${dest}/ψ"
  rsync "${flags[@]}" "${repo}/ψ/" "${dest}/ψ/"
  synced=$((synced + 1))
  echo ""
done < <(eligible_repos)

if [[ "$synced" -eq 0 ]]; then
  echo "No eligible repos found. All ψ/ dirs are already symlinked."
  exit 0
fi

echo "Synced $synced repo(s)."

# Commit mode
if [[ "$COMMIT" == true ]]; then
  echo ""
  echo "=== Committing to vault ==="
  cd "$VAULT"
  if git diff --quiet && git diff --cached --quiet; then
    echo "No changes to commit."
  else
    git add -A
    git commit -m "vault rsync: $(date -u '+%Y-%m-%d %H:%M UTC')"
    git push
    echo "Committed and pushed."
  fi
fi
