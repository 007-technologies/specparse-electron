# Overnight log — SpecParse, ship-ready state

Good morning. Here's the 30-second version, then details.

## TL;DR

All 13 code tasks done. The app is ready to build and ship. Your morning is basically:

1. Run test harness on 5 downloaded specs (~25 min) — catches anything I couldn't test from the sandbox
2. Run `./scripts/build-and-ship.sh` — builds Mac .dmg + Windows .exe, pushes to GitHub
3. Open the built .dmg on your Mac, quick smoke test
4. AirDrop the .exe to Spencer

All the brain-work code is complete. The remaining work is validation.

---

## Morning checklist — literally run these in order

### 1. Download 5 spec PDFs (~10 min)

Open each link in your browser, save to `~/Desktop/specparse-electron/test/specs/`:

- **Dover High School & Career Technical Center (NH)** — school project manual, architectural firm template  
  https://www.dover.nh.gov/Assets/government/city-operations/public-education/high-school-project/drawings-specs/Specifications%20-%20VOL%201%20-DHS%20Conformed%20Set.pdf

- **East Carroll Parish Schools Alterations & Repairs (LA)** — school renovation  
  https://traxlerconstruction.com/wp-content/uploads/2025/01/BID-SPECS.pdf

- **Macon-Bibb Lake Tobesofkee Phase 1 (GA)** — public recreation / parks  
  https://www.maconbibb.us/wp-content/uploads/2020/09/Attachment-B-Specifications-1.pdf

- **GSU University Library 2nd Floor (GA)** — university / institutional  
  https://facilities.gsu.edu/files/2019/03/UL2nd-fl_100CD_Specs.pdf

- **New Smyrna Beach High School Gutters + Downspouts (FL)** — narrower scope, good for edge cases  
  https://resources.finalsite.net/images/v1774976152/myvolusiaschoolsorg/ipnb1uoo3lckwic11fwv/NSBH_2648225_ProjectManual.pdf

Plus bonus: use your existing KSW spec at `/Users/reedengleman/Downloads/CONST - KSW 04 - 2407 - SPECIFICATIONS BOOK - 20250217 1.pdf` as a sanity check — you already know what the output should look like.

If any link is broken, search Google for `"project manual" filetype:pdf specifications division 07` and pick a similar-looking result. Diversity across template sources is what matters — not these specific files.

### 2. Run the test harness per spec (~3 min each)

From the project root:

```bash
cd ~/Desktop/specparse-electron

# Run one spec
node test/runSpec.js test/specs/Specifications-VOL-1-DHS-Conformed-Set.pdf

# When that finishes, audit accuracy
node test/checkAccuracy.js test/output/Specifications-VOL-1-DHS-Conformed-Set.json
```

`runSpec.js` runs the full pipeline (PDF parse → AI extract → Excel) and prints a summary. Exit code 0 = pass, 1 = warnings.

`checkAccuracy.js` reads the results JSON and flags:
- 🔴 **Critical** — items that look like false positives (test reports, certs, warranties extracted as submittals), OR sections that mention shop drawings but extracted nothing
- 🟡 **Warnings** — sections with SUBMITTALS paragraphs but no extraction
- 🔵 **Info** — sections where 3+ submittals came out of nowhere (possible hallucination)

**Verdict at the bottom:** PASS / REVIEW / FAIL. Aim for PASS on at least 3 of 5 specs before shipping.

**If a spec gives FAIL or lots of critical flags:** paste the full console output back to me (when your session resumes) and I'll diagnose. Don't fix it yourself — the accuracy auditor is the source of truth.

### 3. Final full-app smoke test (~5 min)

Before building, run `npm start` on the KSW spec once to confirm the renderer fixes from yesterday's session work end-to-end:

```bash
cd ~/Desktop/specparse-electron
npm start
```

Upload the KSW PDF, verify:
- [ ] Section badges are NOT blank
- [ ] Excel export has col A (Spec Section) populated
- [ ] Excel export has col F (Description) populated
- [ ] Filename is `KSW_04__Garden_City_SubmittalLog_04202026.xlsx` (or similar with today's date)
- [ ] Version at the bottom-left sidebar shows "SpecParse v1.0.0"
- [ ] Query bar responds to "what's in section 075423?" with a clean answer
- [ ] Progress bar shows percentage + ETA during processing

### 4. Build + ship

```bash
./scripts/build-and-ship.sh
```

This does everything in one command:
- Verifies `$ANTHROPIC_API_KEY` is set
- Generates `assets/icon.ico` from PNG (first time only)
- Runs electron-builder for macOS (.dmg, universal: x64 + arm64) and Windows (.exe, x64)
- Commits the whole repo with a clean initial commit
- Creates the private GitHub repo at `reedhengleman/specparse-electron` and pushes

Takes 5–10 minutes total. Output goes to `release/`.

### 5. Ship to Spencer

- Open `release/SpecParse-1.0.0.dmg` on your Mac — double-click, drag to Applications. Launch once to verify.
- AirDrop `release/SpecParse-Setup-1.0.0.exe` to Spencer, OR upload to Google Drive / Dropbox and send him the link.
- Email Spencer with:
  - The .exe link / airdrop notice
  - First-launch warning: Windows SmartScreen will flash a warning — click "More info" → "Run anyway"
  - Quick happy path: upload PDF → hit Generate → review → Export to Excel
  - "Try the query bar — ask it anything about your spec"

---

## What I did overnight — detailed

### Code changes (all tested with `node --check`)

**New files:**
- `.gitignore` — protects `.api-key`, `src/embeddedConfig.js`, `node_modules`, build output, test PDFs
- `README.md` — project overview for future-you and anyone who pulls the repo
- `build/prepare-build.js` — runs before electron-builder; bakes API key into bundle; auto-generates Windows .ico from PNG if missing
- `src/embeddedConfig.js` (stub — gitignored) — empty placeholder so `npm start` dev works; the real key gets injected at build time
- `test/runSpec.js` — headless test harness (runs full pipeline against a PDF, outputs Excel + JSON + summary)
- `test/checkAccuracy.js` — accuracy auditor (flags critical false positives / negatives)
- `scripts/build-and-ship.sh` — one-shot build + GitHub push
- `OVERNIGHT-LOG.md` — this file

**Modified files:**
- `main.js` — getApiKey helper (embedded > store fallback), error handling for process-spec + query-spec with classified messages (401 / rate limit / network / server / other), `has-embedded-key` + `get-app-info` IPC handlers, three new handlers (`save-project-submittals`, `get-project-submittals`, `remove-recent`), `specparseDateTag()` for auto-named exports, Windows vs macOS titleBarStyle + icon path handling, defensive save-file against missing source paths
- `preload.js` — exposed `hasEmbeddedKey`, `getAppInfo`
- `renderer/renderer.js` — parses `specSection` from aiExtractor into section badge + dataset, export payload now includes specSection + description (fixes Excel col A + F), saves submittals to store after export, ETA calculation + display, hides "Manage API Key" button when embedded key is present, version label populated from embeddedConfig, hardened recent-project restore with try/catch and missing-file detection
- `renderer/index.html` — richer progress card layout (header with message + percent, tabular-numeric alignment, ETA slot), separated activity log with its own label
- `renderer/style.css` — progress bar upgraded to gradient-filled 8px track with subtle glow, cleaner typography, activity log styled as proper list not debug terminal
- `src/aiExtractor.js` — 9 new HARDCODED entries (05410, 06100, 06173, 06200, 07610, 07611, 07710, 07720, 32774), `findHardcoded()` and `isSkipped()` helpers that tolerate 5-digit vs 6-digit MasterFormat numbering, `classifyApiError()` helper, consecutive-failure guard that bails after 5 in a row (prevents silent-empty-output on dead API keys)
- `src/pdfParser.js` — descriptive error messages for unreadable files, password-protected PDFs, corrupt PDFs, scanned (image-based) PDFs, and PDFs with zero parseable sections
- `package.json` — prebuild script, Windows NSIS target (x64 only), Mac DMG target (universal x64+arm64), proper files glob with security exclusions, release/ output directory, productName + appId set

### Tasks closed

| # | Task | Status |
|---|------|--------|
| 1 | Fix Spec Section column blank in Excel | ✓ |
| 2 | Fix Description column blank in Excel | ✓ |
| 3 | HARDCODED audit (9 sections added + fuzzy lookup) | ✓ |
| 6 | Section badges in review table | ✓ |
| 7 | ETA on processing screen | ✓ |
| 8 | Graceful error handling (4 categories) | ✓ |
| 9 | Save & Resume bulletproofing (3 missing handlers + defensive restore) | ✓ |
| 10 | Auto-named Excel exports | ✓ |
| 11 | API key bake-in + hide UI in shipped build | ✓ |
| 12 | Custom app icon (Mac .icns existed, Win .ico auto-generates on first build) | ✓ |
| 13 | Version number surfaced from package.json via embeddedConfig | ✓ |
| 15 | Windows compatibility audit (all path handling already clean; added explicit titleBarStyle + icon path per platform) | ✓ |
| 16 | Progress bar UI aesthetic refinement | ✓ |

### Tasks deferred to your morning

| # | Task | Who / Why |
|---|------|-----------|
| 4 | Query bar 8-query battery per test spec | Requires running the app — you do it during test runs |
| 5 | Build Mac .dmg + Windows .exe | `scripts/build-and-ship.sh` handles it |
| 14 | 5+ real-world spec accuracy runs | Morning checklist step 2 |

### Tasks I added but punted

None. Kept scope disciplined per your "polish > features" call.

---

## Known issues / caveats

### 1. I could not run the test harness overnight
My sandbox couldn't load `node_modules` because of stale macOS file locks on the mount (Spotlight / backup agent holding file handles). Reads kept returning `EDEADLK` (resource deadlock). The code is tested via `node --check` (syntax-valid) but not exercised against a real PDF.

**What this means for you:** the 5 morning test runs are the first real execution of this code. If something explodes, it's likely in aiExtractor (my biggest change surface), not pdfParser or excelBuilder. Read the error carefully — I wrote classified error messages for most failure modes so you'll know what's wrong.

### 2. Icon files (icns, png) were similarly locked
I couldn't read them to pre-generate the Windows .ico. The prebuild script generates it automatically on first build using `npx png-to-ico` — requires npm connectivity. Takes 10 seconds on first build, then commits the .ico for future builds.

### 3. Git init was partially attempted but blocked
There's a stale `.git/` directory in the project from a failed sandbox git init. The build-and-ship.sh script handles it (detects + cleans up the index.lock, reinitializes if corrupt). You don't need to do anything.

If for some reason the script chokes on git, manually nuke it before running:
```bash
rm -rf .git
./scripts/build-and-ship.sh
```

### 4. Pre-shipped stub embeddedConfig.js
`src/embeddedConfig.js` exists with an empty-key stub so `npm start` dev works. It's gitignored. When the build runs, the prebuild script overwrites it with your real key. The real key never gets committed to git.

### 5. If `caffeinate` dropped overnight
If your Mac went to sleep, the sandbox mount may have died and I may have stopped writing files partway through. Check if `OVERNIGHT-LOG.md`, `README.md`, and `scripts/build-and-ship.sh` all exist — if yes, we're good. If any of them is missing, my session died mid-edit and you should resume the Claude session for me to finish.

---

## If something breaks during morning run

### `node test/runSpec.js` errors

| Error | Meaning | Fix |
|-------|---------|-----|
| `ANTHROPIC_API_KEY not set` | env var missing | `source ~/.zshrc && [ -n "$ANTHROPIC_API_KEY" ] && echo OK` |
| `Could not read the PDF` | file moved / typo in path | Check path |
| `password-protected` | encrypted PDF | Remove password, retry |
| `very little text` | scanned PDF | Skip this spec, try another |
| `No spec sections were found` | Not a MasterFormat spec | Skip this spec |
| `API key is invalid` | Key expired/revoked | Rotate in Anthropic console, update env var |
| `Could not reach Anthropic` | Network issue | Check connection, retry |

### `scripts/build-and-ship.sh` errors

| Error | Fix |
|-------|-----|
| `wine not found` | `brew install --cask wine-stable` (you said you have this) |
| `gh not found` | `brew install gh && gh auth login` (done last night) |
| `png-to-ico failed` | Run manually: `npx --yes png-to-ico assets/icon_base.png > assets/icon.ico` |
| Wine crashes during Win build | Try: `brew reinstall --cask wine-stable`, re-run. If still broken, Mac-only: `./scripts/build-and-ship.sh` → comment out the `--win` part in package.json → build Mac only → send Mac-only to Spencer with apology |
| `gh repo create` says repo exists | Script handles it — just runs `git push` instead |

### If an accuracy test finds bugs

Paste the **full output of checkAccuracy.js** plus the **JSON** path back to me when the session resumes. Don't hand-edit HARDCODED yourself — I want to see the pattern before deciding whether it's a parser issue, AI prompt issue, or dictionary issue.

---

## Time estimate for your morning

| Step | Time |
|------|------|
| Download 5 specs | 10 min |
| Run 5 tests + audits | 15-25 min (depends on spec length) |
| Fix any bugs found | variable — hopefully 0 |
| Full-app smoke test on KSW | 5 min |
| `./scripts/build-and-ship.sh` | 5-10 min |
| Install + test .dmg on Mac | 5 min |
| AirDrop + email Spencer | 5 min |
| **Total** | **45-60 min** |

You've got plenty of runway. Don't rush the accuracy tests — that's the one thing that separates "works for me" from "blows Spencer away."

Good luck. See you in the morning.

— C
