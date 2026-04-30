# Spectre (SpecParse) — Technical Debt Audit

**2026-04-22**

Technical debt items in SpecParse, ranked by priority.

---

## High priority

### 1. No test coverage from real-world runs

**Issue:** Per the OVERNIGHT-LOG from 2026-04-20, the code was
tested with `node --check` (syntax only), but not run against real
spec PDFs from the sandbox environment. The overnight prep planned
5 accuracy runs on real specs before shipping; need to confirm
whether those were completed before v1.0 shipped to Spencer.

**Fix:** If not already done, run the 5-spec accuracy battery via
`test/runSpec.js` + `test/checkAccuracy.js`. Document PASS/FAIL
rates. Capture findings.

**Effort:** 30 min per spec × 5 = ~3 hours.

### 2. Single embedded API key

**Issue:** Same as Skyfall — one Anthropic API key baked into every
build. No per-customer isolation.

**Fix:** Implement multi-tenant build-time key injection per
`Shared/multi-tenant-architecture.md`.

**Effort:** 2 days (slightly faster than Skyfall since pattern
already exists via `prepare-build.js`).

### 3. No error telemetry / usage analytics

**Issue:** Same gap as Skyfall. When Spencer's install throws, we
don't know.

**Fix:** Integrate Sentry + PostHog per
`Shared/telemetry-integration-plan.md`.

**Effort:** 2–3 hours.

### 4. No auto-update wired to the new GitHub org

**Issue:** Skyfall has electron-updater pointing at
`007-technologies/substitution_request_tool`. Spectre does not have
equivalent auto-updater configuration in the v1.0 shipped build.

**Fix:** Mirror Skyfall's pattern: add electron-updater,
`publish.provider: github` in package.json, test the update flow.

**Effort:** 2 hours to add; 4 hours to validate end-to-end update
cycle.

---

## Medium priority

### 5. Hardcoded section dictionary is file-local

**Issue:** The ~55 hardcoded CSI MasterFormat sections live in
`src/aiExtractor.js`. Adding a new section requires editing source
+ rebuilding.

**Fix:** Extract to a separate JSON or YAML file loaded at runtime.
Makes additions contributor-friendly (non-engineer can add
sections). Even better: data file shipped separately, updatable
without a new build.

**Effort:** 4 hours.

### 6. Accuracy auditor flags not actionable

**Issue:** `test/checkAccuracy.js` surfaces critical flags but the
flagged items don't auto-feed back into the dictionary or
extraction prompts. Human has to read reports, decide, and update
code.

**Fix:** Add a "suggested dictionary additions" output mode —
auditor emits a JSON patch that can be applied to the dictionary
with one command after human review.

**Effort:** 1 day.

### 7. Excel output is fixed at 32 columns for Procore

**Issue:** Hard-coded Procore schema. Customers who use a different
project management tool (PlanGrid, Autodesk Build, etc.) need a
different export format.

**Fix:** Add a pluggable exporter pattern. v1 keeps Procore as
default; v2 adds CSV and a second PM format.

**Effort:** 1–2 days for the abstraction, 2 hours per additional
format.

### 8. No support for partial re-processing

**Issue:** If the user makes edits and re-uploads a revised spec,
processing starts from scratch. No diff mode.

**Fix:** Cache section-level extraction results. On re-upload,
re-process only changed sections. (Complex — probably not worth it
until a customer asks.)

**Effort:** 3 days.

### 9. Query bar hits Anthropic API on every question

**Issue:** Each query is a full API call. No caching for repeated
questions on the same spec.

**Fix:** Cache query responses keyed by spec+question hash. Respond
from cache for repeat questions. Clear cache on new spec or
explicit user action.

**Effort:** 3 hours.

### 10. Unsigned builds

**Issue:** Same as Skyfall. Gatekeeper / SmartScreen warnings
on first install.

**Fix:** Purchase Apple Developer ID + Windows code-signing cert;
integrate into build.

**Effort:** 1 day including cert setup.

---

## Low priority

### 11. No tests

Same as Skyfall — no test framework. Lower priority than Skyfall
because Spectre's critical paths are more deterministic
(dictionary-based); easier to manually verify.

**Effort:** 2–3 days when you're ready.

### 12. aiExtractor.js is getting long

**Issue:** `src/aiExtractor.js` concentrates a lot of logic —
dictionary, fuzzy matching, API calling, classification, fallback,
error handling. Hard to test in isolation.

**Fix:** Split into: `dictionary.js` (data + lookup),
`aiFallback.js` (Claude calls), `classifier.js` (categorize
sections), `extractor.js` (orchestration). Each <100 LOC.

**Effort:** 1 day.

### 13. No changelog

**Issue:** No CHANGELOG.md for Spectre. Version bumps don't have
documented release notes.

**Fix:** Create CHANGELOG.md following keepachangelog.com
convention. Update on each release.

**Effort:** 30 minutes to establish, ongoing maintenance.

### 14. Renderer uses vanilla JS (CSP-safe, but hard to scale)

**Issue:** No framework in the renderer. Works fine for current
scope but adding complex interactions (undo/redo, drag-and-drop
reorder, collaborative editing) would be painful.

**Fix:** Don't fix proactively. If the UI starts growing past what
vanilla JS handles well, evaluate Preact, Solid, or minimal React.
Don't port unless there's a concrete trigger.

**Effort:** Defer.

### 15. Renderer and main process share too much through IPC

**Issue:** Every feature that needs backend logic adds an IPC
handler. IPC surface area grows with every feature.

**Fix:** Document current IPC surface in a `docs/IPC-API.md`.
Consolidate where appropriate (e.g., one "project management"
channel instead of five).

**Effort:** 2 hours for doc, 4 hours for consolidation.

---

## Nice to have

- PDF preview pane in the review UI
- Export to JSON (for customers who want to import into other tools)
- Keyboard navigation through the review table
- Undo/redo for review edits
- Multi-window support (multiple specs open simultaneously)
- Diff view: compare two submittal logs
- Archive old projects
- Search within a loaded spec (Cmd/Ctrl+F)

---

## Summary

Top three:

1. **Verify v1.0 accuracy runs happened** (or do them now) — critical
   for confidence in the shipped build
2. **Auto-update wired to the new org** — so Spencer actually gets
   v1.1, v1.2 when they ship
3. **Sentry + PostHog telemetry** — production visibility

After those, everything else is optimization.
