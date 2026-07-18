#!/usr/bin/env bash
#
# Deploy the static site in docs-site/ to the gh-pages branch (the live site
# at https://dzianisv.github.io/opencode-mobile/).
#
# WHY THIS EXISTS: there is no auto-deploy. GitHub Pages serves the gh-pages
# branch as-is, and gh-pages holds content that is NOT in docs-site/ and must
# survive every deploy:
#   - fdroid/    the LIVE F-Droid repo (built by publish-fdroid.yml). Wiping
#                it breaks every user's F-Droid client. NEVER touch it.
#   - privacy/   the privacy policy, maintained directly on gh-pages.
#   - .nojekyll  required so Pages serves files literally.
# So this deploy is ADDITIVE: it copies docs-site/ over the gh-pages root
# (overwriting docs pages, adding new assets) but never deletes, and it aborts
# if any protected path would go missing.
#
# Usage:
#   bash scripts/deploy-docs.sh            # deploy
#   bash scripts/deploy-docs.sh --dry-run  # stage + show diff, do not push
#
set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

SRC="$REPO_ROOT/docs-site"
[ -d "$SRC" ] || { echo "error: $SRC not found" >&2; exit 1; }

# Protected paths that live on gh-pages but not in docs-site/.
PROTECTED=(fdroid privacy .nojekyll)

WORKTREE="$(mktemp -d)"
cleanup() { git worktree remove --force "$WORKTREE" 2>/dev/null || true; rm -rf "$WORKTREE"; }
trap cleanup EXIT

echo "==> Fetching origin/gh-pages"
git fetch --quiet origin gh-pages
git worktree add --quiet "$WORKTREE" origin/gh-pages

# Sanity: the protected paths must exist in the current gh-pages before we start.
for p in "${PROTECTED[@]}"; do
  [ -e "$WORKTREE/$p" ] || { echo "error: expected '$p' on gh-pages but it's missing — aborting before any change" >&2; exit 1; }
done

echo "==> Copying docs-site/ into gh-pages worktree (additive, no deletes)"
# Trailing '/.' copies contents (including dotfiles) without removing anything
# already present in the destination — so fdroid/, privacy/, .nojekyll stay.
cp -a "$SRC/." "$WORKTREE/"

# Post-copy guard: the protected paths must STILL be present and non-empty.
for p in "${PROTECTED[@]}"; do
  if [ ! -e "$WORKTREE/$p" ]; then
    echo "error: '$p' disappeared after copy — refusing to deploy" >&2; exit 1
  fi
done
# fdroid/ must still contain its repo index, or we'd be shipping a broken repo.
if [ ! -s "$WORKTREE/fdroid/repo/index-v1.json" ] && [ ! -s "$WORKTREE/fdroid/repo/index-v2.json" ]; then
  echo "error: fdroid/repo index missing/empty after copy — refusing to deploy" >&2; exit 1
fi

cd "$WORKTREE"
git add -A
if git diff --cached --quiet; then
  echo "==> No changes to deploy — gh-pages already matches docs-site/."
  exit 0
fi

echo "==> Changes to deploy:"
git diff --cached --stat

if [ "$DRY_RUN" = "1" ]; then
  echo "==> --dry-run: not committing or pushing."
  exit 0
fi

SRC_SHA="$(cd "$REPO_ROOT" && git rev-parse --short HEAD)"
git commit --quiet -m "deploy: docs-site from ${SRC_SHA}"
echo "==> Pushing to origin gh-pages"
git push --quiet origin HEAD:gh-pages
echo "==> Deployed. Live at https://dzianisv.github.io/opencode-mobile/"
