/**
 * SpecParse telemetry client.
 *
 * Fires fire-and-forget POST events to the 007 Technologies telemetry endpoint
 * (Cloudflare Pages Function backed by D1). Same backend Cipher uses; events
 * are tagged product='spectre' so they're separable in the admin dashboard.
 *
 * Config flows: env vars → electron-builder --extraMetadata → asar-embedded
 * package.json → this file at runtime. Same mechanism as anthropicKey.
 *
 * Required package.json fields (set at build time via build-and-ship.sh):
 *   customerId         — e.g., "scott-reid-spencer"
 *   telemetryEndpoint  — "https://007-technologies-website.pages.dev/api/telemetry"
 *   telemetryKey       — shared secret, matches Cloudflare's TELEMETRY_KEY env var
 *
 * If any field is missing, telemetry silently no-ops. Lets dev builds (npm
 * start) run without firing events, and lets old builds without telemetry
 * config keep working unchanged.
 *
 * Hard rules (same as Cipher):
 *   1. Never throw. Telemetry failures must NEVER break the app.
 *   2. Never block. Fire-and-forget with a 5s timeout.
 *   3. Never log PII. Server hashes IPs; client sends no user content.
 */

const { app } = require('electron');
const os = require('os');

const TIMEOUT_MS = 5000;

// Captured at the first track('app_launched') call so we can compute
// session duration on app_quit. Set lazily; defensive against re-launch.
let sessionStartMs = null;

// System info that's stable for the life of the process. Computed once at
// require time so we don't hit the OS module on every track() call.
const SYSTEM_INFO = Object.freeze({
  arch: process.arch,                                              // 'x64' | 'arm64' | 'arm' | 'ia32'
  total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),        // total system RAM in MB
  cpu_count: os.cpus().length,
  os_release: os.release(),
  electron: process.versions.electron,
  node: process.versions.node,
});

// Read config injected at build time via electron-builder extraMetadata.
// The same package.json that holds anthropicKey holds these too.
let cfg = { customerId: '', telemetryEndpoint: '', telemetryKey: '', version: '' };
try {
  const pkg = require('../package.json');
  cfg = {
    customerId:        typeof pkg.customerId === 'string' ? pkg.customerId : '',
    telemetryEndpoint: typeof pkg.telemetryEndpoint === 'string' ? pkg.telemetryEndpoint : '',
    telemetryKey:      typeof pkg.telemetryKey === 'string' ? pkg.telemetryKey : '',
    version:           typeof pkg.version === 'string' ? pkg.version : '',
  };
} catch (_) { /* non-fatal — telemetry just no-ops */ }

async function track(event, metadata = {}) {
  try {
    // Capture session start on first app_launched of this process.
    if (event === 'app_launched' && sessionStartMs == null) {
      sessionStartMs = Date.now();
    }

    if (!cfg.customerId || !cfg.telemetryEndpoint || !cfg.telemetryKey) {
      // Missing config = silent no-op. Dev builds + old builds keep working.
      return;
    }

    // Merge system info + per-event metadata. System info first so per-event
    // metadata can override (it shouldn't, but defensive).
    const mergedMetadata = {
      ...SYSTEM_INFO,
      // Free memory at moment of event — dynamic, not stable like the rest
      free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    };

    const payload = {
      event,
      customer_id: cfg.customerId,
      product: 'spectre',
      version: cfg.version || app.getVersion(),
      platform: process.platform,
      metadata: mergedMetadata,
      client_ts: new Date().toISOString(),
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      await fetch(cfg.telemetryEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telemetry-Key': cfg.telemetryKey,
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Swallow everything. Dev console will see this in unpackaged builds.
    if (!app.isPackaged) {
      console.warn('[telemetry] suppressed:', err && err.message);
    }
  }
}

/**
 * Fires app_quit with elapsed session duration in seconds. Call from
 * main.js's before-quit handler with a short timeout race so the app
 * doesn't hang on slow networks.
 */
async function trackQuit(extraMetadata = {}) {
  const durationSeconds = sessionStartMs
    ? Math.round((Date.now() - sessionStartMs) / 1000)
    : null;
  await track('app_quit', {
    duration_seconds: durationSeconds,
    ...(extraMetadata && typeof extraMetadata === 'object' ? extraMetadata : {}),
  });
}

/**
 * Records an error event. context = which handler/operation the error
 * came from. err = the Error object (or any thrown value).
 */
async function trackError(context, err) {
  const message = err && err.message ? String(err.message) : String(err);
  const stack = err && err.stack ? String(err.stack).slice(0, 1024) : null;
  const name = err && err.name ? String(err.name) : 'Error';
  await track('error', {
    context: String(context || 'unknown'),
    message: message.slice(0, 500),
    stack,
    name,
  });
}

module.exports = { track, trackQuit, trackError };
