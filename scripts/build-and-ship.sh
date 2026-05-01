#!/bin/bash
# build-and-ship.sh — one-shot build + GitHub push for SpecParse
#
# Run this from the project root:
#   cd ~/Documents/007\ Technologies/Spectre
#   ./scripts/build-and-ship.sh           # production: ships to GitHub
#   ./scripts/build-and-ship.sh --qa      # QA only: forces dev-reed customer_id, no publish
#
# What it does (production):
#   1. Verifies ANTHROPIC_API_KEY is set
#   2. Generates assets/icon.ico from icon_base.png (one-time, if missing)
#   3. Runs electron-builder for macOS (.dmg) and Windows (.exe)
#   4. Pushes the repo to GitHub as 007-technologies/specparse-electron (public — for auto-update)
#
# QA mode (--qa flag) — added 2026-05-01 to prevent telemetry pollution:
#   - Forces CUSTOMER_ID=dev-reed regardless of what's exported in your shell.
#     Why: previously, building with CUSTOMER_ID=scott-reid-spencer (or any
#     real customer ID) and then running the resulting binary on your own
#     machine for QA caused telemetry events to be tagged as that customer's
#     usage, polluting their adoption signal in the admin dashboard. Real
#     example: April 30, "Spencer's first run" turned out to be Reed's QA.
#   - Skips the GitHub publish step entirely (--publish flag stripped). QA
#     binaries don't enter the auto-update stream.
#   - Skips the git commit + push step. QA builds don't create commits.
#   - Result: a local-only QA binary in release/ that's safe to install and
#     test on your own machine without contaminating customer metrics.
#
# Safe to re-run — it detects existing artifacts and GitHub repo.

set -e

# ── Parse flags ──────────────────────────────────────────────────────────
QA_MODE=0
for arg in "$@"; do
  case $arg in
    --qa)
      QA_MODE=1
      ;;
    --help|-h)
      echo "Usage: ./scripts/build-and-ship.sh [--qa]"
      echo ""
      echo "  (no flag)  Production build + ship to GitHub Releases."
      echo "  --qa       QA-only build with dev-reed customer_id; no publish."
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg (use --help for options)"
      exit 1
      ;;
  esac
done

# ── Colors for readability ────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }

echo "╔═══════════════════════════════════════════════════════════════"
if [ $QA_MODE -eq 1 ]; then
  echo "║ SpecParse — QA build (no publish, customer_id forced to dev-reed)"
else
  echo "║ SpecParse — build & ship"
fi
echo "╚═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Sanity checks ──────────────────────────────────────────────────
echo "Step 1/5 — Sanity checks"

if [ -z "$ANTHROPIC_API_KEY" ]; then
  fail "ANTHROPIC_API_KEY is not set. Run: source ~/.zshrc"
fi
ok "ANTHROPIC_API_KEY is set"

# QA mode override: force customer_id to dev-reed regardless of shell env.
# This prevents the telemetry-pollution bug where building a customer
# binary and then running it locally for QA tagged events as that customer.
if [ $QA_MODE -eq 1 ]; then
  if [ -n "$CUSTOMER_ID" ] && [ "$CUSTOMER_ID" != "dev-reed" ]; then
    warn "QA mode: ignoring exported CUSTOMER_ID=$CUSTOMER_ID, forcing dev-reed"
  fi
  CUSTOMER_ID="dev-reed"
  ok "CUSTOMER_ID forced to dev-reed (QA mode)"
elif [ -z "$CUSTOMER_ID" ]; then
  warn "CUSTOMER_ID not set — telemetry will be unattributed. Set: export CUSTOMER_ID=scott-reid-spencer"
  CUSTOMER_ID=""
else
  ok "CUSTOMER_ID set: $CUSTOMER_ID"
fi

if [ -z "$TELEMETRY_KEY" ]; then
  warn "TELEMETRY_KEY not set — telemetry will silently no-op. Pull from your saved Cloudflare secret."
  TELEMETRY_KEY=""
else
  ok "TELEMETRY_KEY set"
fi

# Default endpoint — points at the deployed Pages function. Override only if
# you stand up a separate telemetry stack.
TELEMETRY_ENDPOINT="${TELEMETRY_ENDPOINT:-https://007-technologies-website.pages.dev/api/telemetry}"
ok "TELEMETRY_ENDPOINT: $TELEMETRY_ENDPOINT"

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

# Pass the API key via electron-builder's extraMetadata flag. The key flows:
#   env var → CLI --extraMetadata.anthropicKey → injected into the asar-bundled
#   package.json (inside the .app / .exe). It never touches a source file on disk.
# main.js reads it at runtime via require('./package.json').anthropicKey.
node build/prepare-build.js

EXTRA_META="-c.extraMetadata.anthropicKey=$ANTHROPIC_API_KEY"
EXTRA_META="$EXTRA_META -c.extraMetadata.customerId=$CUSTOMER_ID"
EXTRA_META="$EXTRA_META -c.extraMetadata.telemetryEndpoint=$TELEMETRY_ENDPOINT"
EXTRA_META="$EXTRA_META -c.extraMetadata.telemetryKey=$TELEMETRY_KEY"

# --publish always pushes built artifacts (.dmg, .exe, latest.yml, latest-mac.yml)
# to GitHub Releases so electron-updater on customer machines can find them.
# Requires GH_TOKEN env var. If GH_TOKEN is missing we fall back to a
# build-only run so you can still produce binaries for manual distribution.
#
# QA mode: NEVER publish. QA binaries are local-only — they should never
# enter the auto-update stream where customers might pick them up.
if [ $QA_MODE -eq 1 ]; then
  PUBLISH_FLAG=""
  ok "QA mode — skipping GitHub publish"
elif [ -n "$GH_TOKEN" ]; then
  PUBLISH_FLAG="--publish always"
  ok "GH_TOKEN set — will publish to GitHub Releases"
else
  PUBLISH_FLAG=""
  warn "GH_TOKEN not set — building artifacts but NOT publishing to releases. Auto-update won't pick up this build."
fi

if [ $HAS_WINE -eq 1 ]; then
  npx electron-builder --mac --win $EXTRA_META $PUBLISH_FLAG
else
  npx electron-builder --mac $EXTRA_META $PUBLISH_FLAG
fi

ok "Build complete — artifacts in release/"
ls -lh release/ | grep -E "\.(dmg|exe|zip)$" || true

# QA mode early exit — local-only build, no GitHub commit/push.
# The artifacts are in release/ for you to install and test on your machine.
# Telemetry events from this binary will tag as customer_id=dev-reed in admin.
if [ $QA_MODE -eq 1 ]; then
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════"
  echo "║ QA BUILD COMPLETE"
  echo "║"
  echo "║ Artifacts (local only — NOT pushed to GitHub):"
  ls release/*.dmg release/*.exe 2>/dev/null | sed 's/^/║   /'
  echo "║"
  echo "║ Customer ID baked in: dev-reed"
  echo "║ Install one of these on your machine for QA — telemetry will"
  echo "║ tag events as dev-reed in the admin dashboard, NOT as a real customer."
  echo "╚═══════════════════════════════════════════════════════════════"
  exit 0
fi

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
if ! gh repo view 007-technologies/specparse-electron &> /dev/null; then
  gh repo create 007-technologies/specparse-electron --public --source=. --remote=origin --push
  ok "Created private repo and pushed"
else
  # Repo exists — just push
  if ! git remote | grep -q origin; then
    git remote add origin https://github.com/007-technologies/specparse-electron.git
  fi
  git push -u origin main
  ok "Pushed to existing repo"
fi

REPO_URL="https://github.com/007-technologies/specparse-electron"

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
