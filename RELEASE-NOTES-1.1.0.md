# SpecParse — v1.1.0

**Release date:** 2026-04-30
**Theme:** Telemetry + accuracy validation. Production-ready for Scott + Reid pilot.

## What's new

This is the first build going to Spencer's hands for real use. v1.0 was code-complete but not yet smoke-tested against real spec PDFs and had no production telemetry. v1.1 closes both gaps.

### Telemetry pipeline

The app now phones home a small set of usage events to the 007 Technologies telemetry endpoint, so the team can see what's actually working and prioritize the next round of improvements based on real usage instead of guesses.

**Four events tracked:**

1. `app_launched` — every time SpecParse opens
2. `spec_uploaded` — every time a spec PDF is selected and processing begins
3. `submittals_generated` — every time the AI completes submittal extraction (with submittal count + section count)
4. `log_exported` — every time the Excel output is saved to disk

**What gets sent:** event name, customer ID (`scott-reid-spencer` for this build), app version, OS platform + architecture, total/free system memory, CPU count, OS release version, Electron + Node versions, timestamp.

**What is NOT sent:** spec content, project names, file contents, generated submittals, query bar text, keystrokes, screen captures. The server hashes IPs at write time — no raw IP is stored.

If the telemetry endpoint is unreachable for any reason, the app continues working normally. Telemetry calls are fire-and-forget with a 5-second timeout and never block the UI.

### Accuracy validation

The 5-spec accuracy battery (per `TECH-DEBT-AUDIT.md`) is now part of the pre-build process. Real CSI MasterFormat specs are run through `test/runSpec.js` + `test/checkAccuracy.js` to confirm extraction quality before shipping.

### Internal

- New `src/telemetry.js` — fire-and-forget POST client with 5-second timeout, never throws, silently no-ops if telemetry config is absent
- Three new fields injected into `package.json` at build time via `electron-builder --extraMetadata`: `customerId`, `telemetryEndpoint`, `telemetryKey` (same mechanism as `anthropicKey`)
- Four `track()` call sites in `main.js` at the IPC handler boundaries
- Updated `scripts/build-and-ship.sh` to validate + pass telemetry env vars
- Backed by Cloudflare Pages Functions + D1 at the edge (shared backend with Cipher)

## Upgrade path

Spencer will install v1.1.0 fresh — there is no v1.0 in the wild yet. First launch fires `app_launched` with `customer_id=scott-reid-spencer` and `version=1.1.0`.

## Known limitations

- Telemetry endpoint URL is hardcoded in package.json at build time. Multi-tenant (per-customer endpoints) is future work.
- No client-side opt-out toggle yet. Reasonable to add as a setting before broader distribution.
- Auto-update is NOT yet wired (per TECH-DEBT-AUDIT #4). Future versions will need to be delivered manually until electron-updater is integrated.

## Next up

- Wire up auto-update via electron-updater + GitHub Releases
- Move source repo from `reedhengleman/specparse-electron` to the 007-technologies org for parity with Cipher
- Add per-customer Anthropic key support (decouple from build-time bake-in)
- Extract hardcoded section dictionary to a separate JSON file (so additions don't require source edits)
