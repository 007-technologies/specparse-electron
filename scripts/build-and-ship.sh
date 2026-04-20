#!/bin/bash
# build-and-ship.sh — one-shot build + GitHub push for SpecParse
#
# Run this from the project root AFTER verifying the test runs pass:
#   cd ~/Desktop/specparse-electron
#   ./scripts/build-and-ship.sh
#
# What it does:
#   1. Verifies ANTHROPIC_API_KEY is set
#   2. Generates assets/icon.ico from icon_base.png (one-time, if missing)
#   3. Runs electron-builder for macOS (.dmg) and Windows (.exe)
#   4. Pushes the repo to GitHub as reedhengleman/specparse-electron (private)
#
# Safe to re-run — it detects existing artifacts and GitHub repo.

set -e

# ── Colors for readability ────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }

echo "╔═══════════════════════════════════════════════════════════════"
echo "║ SpecParse — build & ship"
echo "╚═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Sanity checks ──────────────────────────────────────────────────
echo "Step 1/5 — Sanity checks"

if [ -z "$ANTHROPIC_API_KEY" ]; then
  fail "ANTHROPIC_API_KEY is not set. Run: source ~/.zshrc"
fi
ok "ANTHROPIC_API_KEY is set"

if ! command -v gh &> /dev/null; then
  fail "GitHub CLI (gh) not found. Run: brew install gh"
fi
ok "gh found: $(gh --version | head -1)"

if ! command -v wine &> /dev/null; then
  warn "wine not found — Windows build will be skipped"
  HAS_WINE=0
else
  ok "wine found: $(wine --version)"
  HAS_WINE=1
fi

# ── Step 2: Generate Windows .ico if missing ───────────────────────────────
echo ""
echo "Step 2/5 — Icon prep"
if [ ! -f assets/icon.ico ]; then
  echo "  Generating assets/icon.ico from icon_base.png..."
  if [ ! -f assets/icon_base.png ]; then
    fail "assets/icon_base.png not found — can't generate .ico"
  fi
  npx --yes png-to-ico assets/icon_base.png > assets/icon.ico
  ok "Generated assets/icon.ico"
else
  ok "assets/icon.ico already exists"
fi

# ── Step 3: Run electron-builder ───────────────────────────────────────────
echo ""
echo "Step 3/5 — Building distributables"
echo "  (This takes 3-8 min. prebuild script embeds your API key.)"

rm -rf release/

if [ $HAS_WINE -eq 1 ]; then
  npm run build
else
  npm run build:mac
fi

ok "Build complete — artifacts in release/"
ls -lh release/ | grep -E "\.(dmg|exe|zip)$" || true

# ── Step 4: Git init + initial push (idempotent) ──────────────────────────
echo ""
echo "Step 4/5 — GitHub"

# Clear any stale lock left by the overnight sandbox or a crashed git process
rm -f .git/index.lock 2>/dev/null || true

if [ ! -d .git ]; then
  git init -b main
  ok "git init"
else
  # Ensure the existing .git state is sane; if not, reinitialize
  if ! git rev-parse --git-dir &> /dev/null; then
    warn "Existing .git directory was corrupted — reinitializing"
    rm -rf .git
    git init -b main
  fi
  ok "Existing git repo detected"
fi

# Configure user if not already set locally
if [ -z "$(git config user.email)" ]; then
  git config user.email "reedengleman@icloud.com"
  git config user.name  "Reed Engleman"
fi

git add .
if git diff --staged --quiet; then
  warn "No changes to commit"
else
  git commit -m "$(cat <<'EOF'
SpecParse v1.0.0 — pilot build for Spencer Haddock

Initial public commit. Core features:
- CSI MasterFormat spec parser (pdf-parse)
- Two-pass submittal extractor: hardcoded dict (50+ sections) + Haiku AI fallback
- Review table with drag/drop, inline edit, section badges
- Excel export (32-column Procore-compatible submittal log)
- Query bar (Haiku-powered Q&A against the spec + submittal log)
- Save & Resume (recent projects with full state restoration)
- Error handling for bad PDFs, scanned PDFs, auth failures, network errors
- API key bake-in for pilot distribution

🤖 Generated with Claude (Cowork mode)
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
  ok "Committed"
fi

# Create the GitHub repo if it doesn't exist yet
if ! gh repo view reedhengleman/specparse-electron &> /dev/null; then
  gh repo create reedhengleman/specparse-electron --private --source=. --remote=origin --push
  ok "Created private repo and pushed"
else
  # Repo exists — just push
  if ! git remote | grep -q origin; then
    git remote add origin https://github.com/reedhengleman/specparse-electron.git
  fi
  git push -u origin main
  ok "Pushed to existing repo"
fi

REPO_URL="https://github.com/reedhengleman/specparse-electron"

# ── Step 5: Done ───────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════════════"
echo "║ DONE"
echo "║"
echo "║ Artifacts:"
ls release/*.dmg release/*.exe 2>/dev/null | sed 's/^/║   /'
echo "║"
echo "║ Repo: $REPO_URL"
echo "║"
echo "║ Next: open release/SpecParse-*.dmg on this Mac for a quick"
echo "║ smoke test, then AirDrop release/SpecParse*Setup*.exe to Spencer."
echo "╚═══════════════════════════════════════════════════════════════"
