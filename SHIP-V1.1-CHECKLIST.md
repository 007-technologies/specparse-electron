# SpecParse v1.1 — Ship Checklist

**Drafted overnight 2026-04-29/30 for the Apr 30 grind.**
Goal: Spencer opens v1.1.0 tomorrow (May 1), sees a polished tool, and you watch his telemetry land in the admin dashboard.

---

## Pre-flight (5 min)

```bash
cd "/Users/reedengleman/Documents/007 Technologies/Spectre"
```

**1. Verify env vars in your shell:**

```bash
echo "ANTHROPIC_API_KEY length: ${#ANTHROPIC_API_KEY}"
echo "TELEMETRY_KEY length: ${#TELEMETRY_KEY}"
```

If `TELEMETRY_KEY` is empty, pull it from your saved value (the one you set in Cloudflare for `007-technologies-website`'s `TELEMETRY_KEY` secret) and:

```bash
export TELEMETRY_KEY="<paste here>"
```

If `ANTHROPIC_API_KEY` is empty, get it from `Skyfall/config.json` (same key works — pre-rotation).

**2. Set the customer ID for Spencer's build:**

```bash
export CUSTOMER_ID="scott-reid-spencer"
```

(Telemetry endpoint defaults to `https://007-technologies-website.pages.dev/api/telemetry` — no need to set it unless you've changed it.)

---

## Block 1 — Local test of telemetry (15 min)

Verify the new telemetry code fires correctly before building.

```bash
npm start
```

Open the app. The `app_launched` event should fire immediately.

In another terminal tab, query D1:

```bash
cd "/Users/reedengleman/Documents/007 Technologies/Shared/website"
npx wrangler d1 execute telemetry-prod --remote --command="SELECT id, event, customer_id, product, version FROM telemetry_events WHERE product='spectre' ORDER BY id DESC LIMIT 5"
```

⚠️ **Local dev runs WON'T have telemetry config baked in** (no extraMetadata injection during `npm start`). The `track()` calls will silently no-op. To verify telemetry locally, add the config fields to `package.json` temporarily:

```json
"customerId": "dev-reed",
"telemetryEndpoint": "https://007-technologies-website.pages.dev/api/telemetry",
"telemetryKey": "<your TELEMETRY_KEY value>"
```

Save, restart `npm start`. Now telemetry fires and you'll see `dev-reed` rows in D1.

**Run a real spec through the app** to fire all 4 events:
1. Click **New Project**, pick a PDF from `test/specs/`
2. Wait for processing → fires `submittals_generated`
3. Click **Save Excel** → fires `log_exported`

Confirm in D1 you see all 4 events with the new metadata fields (arch, cpu_count, total_memory_mb, etc.).

**REMOVE THE TEMPORARY FIELDS FROM package.json BEFORE BUILDING.** Build-time injection re-adds them with the correct customer_id (scott-reid-spencer, not dev-reed).

---

## Block 2 — Accuracy validation (2–3 hr)

This is the gating item from `TECH-DEBT-AUDIT.md`. Per the audit, v1.0 was tested with `node --check` (syntax only), not against real specs.

```bash
ls test/specs/
```

If empty, you'll need to populate with 5 real CSI MasterFormat specs. Reach for ones you've already used in development.

Run the accuracy battery:

```bash
node test/runSpec.js test/specs/<filename>.pdf
node test/checkAccuracy.js test/output/<filename>.json
```

Capture PASS/FAIL per spec. Document any extraction failures.

**Common failure modes to watch for:**
- Sections not in the hardcoded dictionary → AI fallback should catch them; verify
- Sections with unusual formatting (tables, multi-column) → may break the PDF parser
- Bad title extraction (cuts off mid-word) → fix in `src/pdfParser.js`
- Submittals duplicated or missed → check `src/aiExtractor.js`

If <80% pass, **don't ship yet**. Fix the failures first.

---

## Block 3 — Bug fix sweep (1–2 hr)

Based on accuracy findings + TECH-DEBT-AUDIT.md priorities. Highest-priority items to address if not already done:

- Per-section error messages when extraction fails (so user sees which section had a problem, not a generic fail)
- Better handling of scanned PDFs (currently throws — could it offer a clearer error or even prompt to OCR first?)
- Save & Resume edge cases: what if a project name is exactly the same as an old one?

Skip everything else from the audit unless it bites during the accuracy battery.

---

## Block 4 — Build (10–20 min)

```bash
cd "/Users/reedengleman/Documents/007 Technologies/Spectre"

# Confirm env vars are set (you set them in pre-flight)
echo "Building with:"
echo "  CUSTOMER_ID=$CUSTOMER_ID"
echo "  TELEMETRY_KEY length: ${#TELEMETRY_KEY}"
echo "  ANTHROPIC_API_KEY length: ${#ANTHROPIC_API_KEY}"

./scripts/build-and-ship.sh
```

The script will:
- Inject the API key + telemetry config via `--extraMetadata`
- Run electron-builder for Mac (.dmg) and Windows (.exe — if wine is installed)
- Push the source to GitHub at `reedhengleman/specparse-electron`
- Print artifact paths

Artifacts land in `release/`.

⚠️ **Note: The repo is at `reedhengleman/specparse-electron`, not under the `007-technologies/` org.** Worth migrating someday for consistency with Skyfall's repo location, but not blocking tonight. Add to ops-readiness as a follow-up.

---

## Block 5 — Smoke test the built app (15 min)

```bash
open release/SpecParse-1.1.0.dmg
```

Drag SpecParse to /Applications. Open it.

**Smoke checklist:**
- [ ] Splash screen renders (helix animation, "DOSSIER PROJECT" codename)
- [ ] Main window opens, version "1.1.0" visible somewhere (Settings or About)
- [ ] Click **New Project**, select a real spec PDF
- [ ] Processing completes, review table appears
- [ ] Click **Save Excel**, file exports cleanly
- [ ] Open the .xlsx — column structure looks right
- [ ] Telemetry events appear in admin dashboard:
  - `customer_id=scott-reid-spencer`
  - `product=spectre`
  - `version=1.1.0`
  - All 4 events: `app_launched`, `spec_uploaded`, `submittals_generated`, `log_exported`

Quick query to confirm telemetry:

```bash
cd "/Users/reedengleman/Documents/007 Technologies/Shared/website"
npx wrangler d1 execute telemetry-prod --remote --command="SELECT event, version, platform, server_ts FROM telemetry_events WHERE customer_id='scott-reid-spencer' ORDER BY id DESC LIMIT 10"
```

If all 4 events show with metadata, you're golden. If not, debug before sending to Spencer.

---

## Block 6 — Ship to Spencer (15 min)

The `.exe` is what Spencer needs (he's on Windows). The `.dmg` is for your own Mac smoke test.

**Option A: Direct link via email/text.**

Easiest for Spencer. Upload `release/SpecParse-Setup-1.1.0.exe` to:
- A Dropbox folder, get a share link, OR
- Upload as a release asset to the GitHub repo (`gh release create v1.1.0 release/SpecParse*.exe`)

Then text Spencer something like:

> Hey Spencer — got the new build ready. Updated since last time with telemetry so I can see how it's working for you, plus a few extraction improvements. Here's the download: [link]
>
> When you're ready, just install and run it on a real spec. I'll see your usage in the dashboard but if anything weird happens, just text me.
>
> No rush — whenever you have time tomorrow.

**Option B: AirDrop (if he's nearby).** N/A — assume he's remote.

---

## Post-ship

- [ ] Watch admin dashboard for first `app_launched` from `scott-reid-spencer`
- [ ] If no event within 24 hr, follow up with text: "Hey, did the install work?"
- [ ] Once he runs a real spec, review the metadata: did extraction succeed? Submittal count reasonable?
- [ ] Update `TECH-DEBT-AUDIT.md` to mark items addressed
- [ ] Move the repo to `007-technologies/` org when you have a free 30 min (separate task)

---

## Total time estimate

| Block | Time |
|---|---|
| Pre-flight | 5 min |
| Local telemetry test | 15 min |
| Accuracy validation | 2–3 hr |
| Bug fix sweep | 1–2 hr |
| Build | 15 min |
| Smoke test | 15 min |
| Ship to Spencer | 15 min |
| **Total** | **~5–6 hr** |

If you start at 8 AM, ship by 1–2 PM. Spencer sees it the next morning.
