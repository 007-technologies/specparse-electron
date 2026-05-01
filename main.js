const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const store = new Store();
const { autoUpdater } = require('electron-updater');
const { track, trackQuit, trackError } = require('./src/telemetry');

// ── Process-level error tracking ──────────────────────────────────────────────
// Catches anything that bubbles up uncaught — IPC handler errors are caught by
// Electron and sent back to the renderer, but anything in the main process
// outside an IPC context will be captured here.
process.on('uncaughtException', (err) => {
  trackError('uncaughtException', err).catch(() => {});
});
process.on('unhandledRejection', (reason) => {
  trackError('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason))).catch(() => {});
});

// ── App quit telemetry ────────────────────────────────────────────────────────
// Race trackQuit with a 1.5s timeout so the app never hangs at quit. Worst
// case we lose the quit event when the network is slow; better than blocking.
let isQuittingTracked = false;
app.on('before-quit', async (e) => {
  if (isQuittingTracked) return;
  isQuittingTracked = true;
  e.preventDefault();
  try {
    await Promise.race([
      trackQuit(),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch (_) { /* swallow */ }
  app.quit();
});
let mainWindow;

// Legacy embedded-config support (pre-v1.0.1 builds). Kept as fallback only.
// The current build flow injects the API key via electron-builder's extraMetadata —
// see the `anthropicKey` field on require('./package.json') below. That approach keeps
// the key out of the source tree entirely: it flows env var → electron-builder CLI →
// asar-embedded package.json, never touching any committed or checked-in file.
let embeddedConfig = { embeddedApiKey: '', buildDate: '', version: '' };
try { embeddedConfig = require('./src/embeddedConfig'); } catch (_) { /* no stub present */ }

// extraMetadata-injected key, if this binary was built with it. In dev (npm start),
// the source package.json has no such field and this stays empty.
let packageInjectedKey = '';
try {
  const pkg = require('./package.json');
  if (pkg && typeof pkg.anthropicKey === 'string' && pkg.anthropicKey) {
    packageInjectedKey = pkg.anthropicKey;
  }
} catch (_) { /* non-fatal */ }

function getApiKey() {
  // Priority:
  //   1. .api-key file (dev: the freshest user-managed source; matches test harness)
  //   2. packageInjectedKey (current approach: electron-builder extraMetadata → asar)
  //   3. embeddedConfig.embeddedApiKey (legacy: pre-v1.0.1 builds)
  //   4. electron-store (legacy: Settings UI, superseded by the embedded/injected paths)
  try {
    const keyFile = path.join(__dirname, '.api-key');
    if (fs.existsSync(keyFile)) {
      const k = fs.readFileSync(keyFile, 'utf8').trim();
      if (k) return k;
    }
  } catch (_) { /* non-fatal */ }
  if (packageInjectedKey) return packageInjectedKey;
  if (embeddedConfig.embeddedApiKey) return embeddedConfig.embeddedApiKey;
  return store.get('apiKey', '');
}

function createWindow() {
  // hiddenInset is a macOS-only style (inset traffic lights, draggable top area).
  // On Windows/Linux it's silently ignored but we're explicit for clarity.
  const titleBarStyle = process.platform === 'darwin' ? 'hiddenInset' : 'default';
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 700, minHeight: 580,
    titleBarStyle, backgroundColor: '#0F172A',
    icon: process.platform === 'win32'
      ? path.join(__dirname, 'assets', 'icon.ico')
      : undefined, // macOS gets icon from .app bundle; Linux would use a .png
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.maximize();
}


ipcMain.handle("set-title", (event, title) => {
  if (mainWindow) mainWindow.setTitle(title);
});

ipcMain.handle("get-recent", () => {
  return store.get("recentProjects", []);
});

ipcMain.handle("save-recent", (event, project) => {
  const recent = store.get("recentProjects", []);
  const updated = [project, ...recent.filter(p => p.name !== project.name)].slice(0, 5);
  store.set("recentProjects", updated);
  return true;
});

app.whenReady().then(() => {
  createWindow();
  // Telemetry: app launched
  track('app_launched');

  // Auto-update wiring (only in packaged builds — no-op during npm start).
  // Mirrors Skyfall's pattern: subscribe to electron-updater events, forward
  // each to the renderer as 'update-status' IPC events. Renderer renders a
  // banner. Click "Install" → quitAndInstall() (handled below by IPC).
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => sendUpdate('checking'));
    autoUpdater.on('update-available',     (info) => sendUpdate('available', info.version));
    autoUpdater.on('update-not-available', () => sendUpdate('not-available'));
    autoUpdater.on('download-progress',    (p) => sendUpdate('downloading', Math.round(p.percent)));
    autoUpdater.on('update-downloaded',    (info) => sendUpdate('downloaded', info.version));
    autoUpdater.on('error',                (err) => {
      sendUpdate('error', err && err.message);
      trackError('autoUpdater', err).catch(() => {});
    });

    // Check on launch, then every hour while the app is open.
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// IPC: forward auto-update status messages to the renderer.
function sendUpdate(status, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, data });
  }
}

// IPC: install the downloaded update now (renderer banner triggers this
// when the user clicks "Install" after status === 'downloaded').
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());

ipcMain.handle('query-spec', async (event, { query, sections, history, submittals }) => {
  const apiKey = getApiKey();
  if (!apiKey) return { error: 'No API key configured. Open Settings to add your key.' };
  if (!sections || sections.length === 0) return { error: 'No spec data loaded. Process a spec first.' };

  // Build submittal index so AI can answer questions about specific submittal numbers
  let submittalIndex = '';
  if (submittals && submittals.length > 0) {
    const lines = submittals.map(s => s.submittalNumber + ': ' + s.title + ' (' + s.type + ') - ' + s.specSection);
    submittalIndex = 'GENERATED SUBMITTAL LOG FOR THIS PROJECT:\n' + lines.join('\n') + '\n\n';
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client    = new Anthropic({ apiKey });

  const q     = query.toLowerCase();
  const nums  = (query.match(/\d{3,}/g) || []);
  const words = q.split(/\s+/).filter(w => w.length > 2);
  const isBroad = /\b(all|every|list|which|any|what sections|how many|summary|overview)\b/.test(q);

  // Score every section
  const scored = sections.map(s => {
    const sNum  = (s.num || s.number || '').replace(/[\s\-.]/g, '');
    const hay   = (sNum + ' ' + (s.title || '') + ' ' + (s.content || '')).toLowerCase();
    let score   = 0;
    // Word hits — longer words weighted more
    words.forEach(w => { if (hay.includes(w)) score += w.length > 5 ? 3 : 1; });
    // Number match bonus
    if (nums.some(n => sNum.includes(n) || n.includes(sNum) || sNum.slice(0,4) === n.slice(0,4))) score += 20;
    // Title match bonus
    words.forEach(w => { if ((s.title||'').toLowerCase().includes(w)) score += 4; });
    return { s, score, isDiv01: sNum.startsWith('01') };
  }).sort((a, b) => b.score - a.score);

  // Division 01 always included (general requirements)
  const div01   = scored.filter(x => x.isDiv01).slice(0, 2).map(x => x.s);
  // Top relevant sections — grab more for broad queries
  const topN    = isBroad ? sections.length : 4;
  const top     = scored.filter(x => !x.isDiv01 && x.score > 0).slice(0, topN).map(x => x.s);
  const relevant = [...div01, ...top];

  const index   = sections.map(s => `[${s.num||s.number}] ${s.title}`).join('\n');
  const detail  = relevant.length > 0
    ? relevant.map(s => {
        // For broad queries use less content per section, specific queries use more
        const chars = isBroad ? 250 : 1000;
        return `[${s.num||s.number}] ${s.title}\n${(s.content||'').slice(0, chars)}`;
      }).join('\n\n---\n\n')
    : '';

  const context = detail
    ? `SECTION INDEX (all sections):\n${index}\n\nSECTION CONTENT:\n${detail}`
    : `SECTION INDEX:\n${index}`;

  const systemPrompt = 'You are a senior construction administrator advising a General Contractor. ' +
    'You have deep expertise in CSI MasterFormat specs and submittal management. ' +
    'Rules: ' +
    '1. Lead with the direct answer — no preamble like "Based on the spec..." or "I found..." ' +
    '2. Use plain English — avoid unnecessary jargon. ' +
    '3. For submittal questions always state: submittal type, what exactly must be submitted. ' +
    '4. Flag anything critical the GC must watch out for (timing, approvals, delegated design). ' +
    '5. Keep answers tight — if it can be said in 2 sentences, use 2 sentences. ' +
    '6. Submittal numbers = SECTION-INDEX format (04211-1 means section 04211, submittal #1). ' +
    '7. If a section is not in this spec, say so directly and name the closest one that is.';

  const messages = [];
  if (history && history.length > 0) history.slice(-6).forEach(h => messages.push(h));
  messages.push({ role: 'user', content: submittalIndex + context + '\n\nQuestion: ' + query });
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages
    });
    if (!msg || !msg.content || !msg.content[0] || !msg.content[0].text) {
      return { error: 'The AI returned an empty response. Please try asking again.' };
    }
    return { answer: msg.content[0].text };
  } catch (err) {
    const m = (err && err.message) || String(err);
    const status = err && (err.status || (err.response && err.response.status));
    if (status === 401 || /invalid|unauthorized/i.test(m)) {
      return { error: 'Your API key is invalid or expired. Open Settings to update it.' };
    }
    if (status === 429 || /rate.?limit/i.test(m)) {
      return { error: 'You\u2019ve hit the API rate limit. Wait a minute and try again.' };
    }
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|fetch failed/i.test(m)) {
      return { error: 'Could not reach Anthropic. Check your internet connection and try again.' };
    }
    return { error: m };
  }
});

ipcMain.handle('save-project-sections', (event, { projectName, sections }) => {
  const key = 'sections_' + projectName.replace(/[^a-zA-Z0-9]/g, '_');
  store.set(key, sections);
  return true;
});

ipcMain.handle('get-project-sections', (event, projectName) => {
  const key = 'sections_' + projectName.replace(/[^a-zA-Z0-9]/g, '_');
  return store.get(key, []);
});

// ── Submittal persistence (for Save & Resume). Renderer saves the reviewed submittal list
// after each export so clicking a recent project restores the exact table the user approved.
ipcMain.handle('save-project-submittals', (event, { projectName, submittals }) => {
  const key = 'submittals_' + projectName.replace(/[^a-zA-Z0-9]/g, '_');
  store.set(key, submittals);
  return true;
});

ipcMain.handle('get-project-submittals', (event, projectName) => {
  const key = 'submittals_' + projectName.replace(/[^a-zA-Z0-9]/g, '_');
  return store.get(key, []);
});

// Remove a single project from the recents list (also clears its saved sections + submittals).
ipcMain.handle('remove-recent', (event, projectName) => {
  const recent = store.get('recentProjects', []);
  store.set('recentProjects', recent.filter(p => p.name !== projectName));
  const safe = projectName.replace(/[^a-zA-Z0-9]/g, '_');
  store.delete('sections_' + safe);
  store.delete('submittals_' + safe);
  return true;
});



  // Cmd+Option+I opens DevTools
  const { globalShortcut } = require('electron');
  app.whenReady().then(() => {
    globalShortcut.register('CommandOrControl+Alt+I', () => {
      if (mainWindow) mainWindow.webContents.openDevTools();
    });
  });

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// When an embedded key is present we return a sentinel so the renderer knows a key is
// configured, without exposing the actual key value.
ipcMain.handle('get-api-key', () => {
  if (embeddedConfig.embeddedApiKey) return '__embedded__';
  return store.get('apiKey', '');
});
ipcMain.handle('save-api-key', (_, key) => { store.set('apiKey', key); return true; });

// Renderer uses this to hide the "Manage API Key" button in the shipped build.
ipcMain.handle('has-embedded-key', () => Boolean(embeddedConfig.embeddedApiKey));

// Renderer uses this for the version label in the UI.
ipcMain.handle('get-app-info', () => {
  const cfg = global.appConfig || {};
  return {
    version: embeddedConfig.version || app.getVersion(),
    buildDate: embeddedConfig.buildDate || '',
    hasEmbeddedKey: Boolean(embeddedConfig.embeddedApiKey),
    // Customer ID surfaced in the About modal so Spencer (and any prospect
    // demos) can see at a glance which build they're on. This is what shows
    // up in admin telemetry too — same string Reed sees on his side.
    customerId: cfg.CUSTOMER_ID || null,
  };
});

// ── IPC: manual update check ──────────────────────────────────────────────────
// Mirrors Cipher. Fires autoUpdater immediately rather than waiting for the
// hourly background poll. Settings panel surfaces this as a button.
ipcMain.handle('check-for-updates', async () => {
  try {
    const { autoUpdater } = require('electron-updater');
    if (!app.isPackaged) {
      return { success: true, message: 'Auto-update is disabled in dev builds. (You\'re running an unpackaged build.)' };
    }
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      const remoteV = result.updateInfo.version;
      const localV = app.getVersion();
      if (remoteV && remoteV !== localV) {
        return { success: true, message: `Update available — v${remoteV} downloading in the background. We'll notify you when it's ready.` };
      }
      return { success: true, message: `You're on the latest version (v${localV}).` };
    }
    return { success: true, message: 'Update check complete.' };
  } catch (err) {
    return { success: false, error: 'Update check failed: ' + ((err && err.message) || String(err)) };
  }
});

ipcMain.handle('process-spec', async (event, { filePath, projectName }) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key configured. Open Settings to add your key.');
  const sendProgress = (msg) => event.sender.send('progress', msg);
  const { extractSections } = require('./src/pdfParser');
  const { extractAllSubmittals } = require('./src/aiExtractor');
  const { buildExcel } = require('./src/excelBuilder');

  // Telemetry: spec uploaded
  track('spec_uploaded', { fileName: path.basename(filePath || '') });

  let sections;
  try {
    sendProgress({ message: 'Extracting text from PDF...', current: 0, total: 0 });
    sections = await extractSections(filePath);
  } catch (err) {
    // pdfParser throws descriptive messages — re-throw so renderer shows them.
    trackError('process-spec/pdfExtract', err).catch(() => {});
    throw new Error(err.message || 'Failed to read the PDF.');
  }

  sendProgress({ message: `Found ${sections.length} sections. Starting AI analysis...`, current: 0, total: sections.length });

  let submittals;
  try {
    submittals = await extractAllSubmittals(apiKey, sections, (current, total, title, found) => {
      // `found` is the running count of submittals identified so far — passed
      // through to the renderer so it can show "47 submittals found · scanning
      // Division 09" instead of just "section X / Y".
      sendProgress({ message: title, current, total, found });
    });
  } catch (err) {
    // aiExtractor throws descriptive messages for API/network/rate-limit failures.
    trackError('process-spec/aiExtract', err).catch(() => {});
    throw new Error(err.message || 'Failed during AI analysis.');
  }

  if (!submittals || submittals.length === 0) {
    throw new Error('No submittals were generated. This spec may not follow CSI MasterFormat conventions, or every section was in the skip list.');
  }

  try {
    sendProgress({ message: 'Building Excel file...', current: 0, total: 0 });
    const outputPath = path.join(os.tmpdir(), `${projectName.replace(/[^a-z0-9]/gi,'_')}_Submittal_Log.xlsx`);
    await buildExcel(submittals, outputPath, projectName);

    // Telemetry: submittals successfully generated
    track('submittals_generated', {
      submittalCount: submittals.length,
      sectionCount: sections.length,
    });

    return { success: true, outputPath, submittals, count: submittals.length, sections: sections.length, sectionData: sections };
  } catch (err) {
    trackError('process-spec/buildExcel', err).catch(() => {});
    throw new Error(friendlyError(err, 'Could not write the Excel file.'));
  }
});

// ── Friendly error messages ──────────────────────────────────────────────────
// Mirrors Cipher's friendlyError pattern. Maps low-level errors to actionable
// customer-facing strings. Each call site provides a fallback message that's
// used when no curated case matches — keeps catch-all language contextual.
//
// Already-classified errors from pdfParser / aiExtractor / classifyApiError
// pass through unchanged (their messages are already user-friendly).
function friendlyError(err, fallback) {
  const msg = (err && err.message) || String(err);
  const status = err && (err.status || (err.response && err.response.status));

  // ── Anthropic / API errors ───────────────────────────────────────────────
  if (status === 429 || /rate.?limit|quota.exceeded/i.test(msg))
    return 'Too many AI requests — wait a minute, then try again. (If this persists, your Anthropic plan may be at its limit.)';
  if (status === 401 || /invalid.api.key|authentication|unauthorized/i.test(msg))
    return 'Your Anthropic API key was rejected. Open Settings → Manage API Key to update it.';
  if (status === 402 || /credit.balance|insufficient.credit/i.test(msg))
    return 'Your Anthropic credit balance is too low to process this spec. Top up at console.anthropic.com.';
  if (status >= 500 && status < 600)
    return 'Anthropic is having a hiccup on their end (' + status + '). Try again in a couple of minutes.';

  // ── PDF read errors ──────────────────────────────────────────────────────
  if (/InvalidPDF|not a PDF|PDFInvalidError/i.test(msg))
    return 'This file doesn’t look like a valid PDF. Re-export from your spec source and try again.';
  if (/scanned|image.based|No readable text|very little text/i.test(msg))
    return 'This PDF appears to be scanned (image-based). Run OCR on it first — most PDF tools have a "Make searchable" option.';
  if (/encrypted|password|protected/i.test(msg))
    return 'This PDF is password-protected. Remove the password and try again.';
  if (/file too large|MAX_BUFFER_LENGTH|Cannot create a string longer/i.test(msg))
    return 'This PDF is too big for SpecParse. If it’s a full project manual, try uploading just the spec sections (Divisions 02-49).';

  // ── Network errors ───────────────────────────────────────────────────────
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch.failed|network.error/i.test(msg))
    return 'Couldn’t reach Anthropic. Check your internet connection and try again.';
  if (/abort|timeout/i.test(msg) && /fetch|request/i.test(msg))
    return 'The AI request timed out. Check your internet, then retry.';

  // ── Excel / file write errors ────────────────────────────────────────────
  if (/EACCES|EPERM|permission denied/i.test(msg))
    return 'SpecParse couldn’t write the Excel file — pick a different folder, or close the file if it’s open in Excel.';
  if (/ENOSPC|no space left/i.test(msg))
    return 'Your disk is full. Free up some space and try again.';
  if (/EBUSY|locked|in use/i.test(msg))
    return 'That Excel file is open in another app. Close it and try again.';

  // ── Already-friendly messages from pdfParser / aiExtractor ───────────────
  // These start with capital letters and are full sentences — pass through.
  if (msg && msg.length > 0 && msg.length < 240 && !/^(Error:|TypeError|ReferenceError)/.test(msg)) {
    return msg;
  }

  return fallback || 'Something went wrong. Try again — if it keeps happening, send feedback.';
}

// MMDDYYYY date tag for default filenames — matches Spencer's preferred format.
function specparseDateTag() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return mm + dd + d.getFullYear();
}

ipcMain.handle('export-reviewed', async (_, { submittals, projectName }) => {
  const { buildExcel } = require('./src/excelBuilder');
  const safeName = projectName.replace(/[^a-z0-9]/gi, '_');
  const fileName = safeName + '_SubmittalLog_' + specparseDateTag() + '.xlsx';
  const outputPath = path.join(os.tmpdir(), fileName);
  await buildExcel(submittals, outputPath, projectName);
  return { outputPath };
});

ipcMain.handle('save-file', async (_, sourcePath) => {
  // Check the source still exists — os.tmpdir() contents can be swept between runs.
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.basename(sourcePath),
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
  });
  if (!result.canceled && result.filePath) {
    try {
      fs.copyFileSync(sourcePath, result.filePath);
      shell.showItemInFinder(result.filePath);

      // Telemetry: log exported (user actually saved the file)
      track('log_exported', { fileName: path.basename(result.filePath) });

      return result.filePath;
    } catch (err) {
      trackError('save-file', err).catch(() => {});
      throw new Error(friendlyError(err, 'Could not save the file.'));
    }
  }
  return null;
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }], properties: ['openFile']
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── IPC: in-app feedback ─────────────────────────────────────────────────────
// Posts to /api/feedback with the same X-Telemetry-Key shared secret. Reed
// gets an email per submission via Resend; admin dashboard surfaces the row.
//
// Returns { success: true } or { success: false, error: string }. Failure
// modes:
//   - Missing telemetry config → "Feedback isn't configured for this build."
//   - Server returns non-2xx → bubbles error string up
//   - Network timeout (8s) → friendly retry message
ipcMain.handle('send-feedback', async (event, payload) => {
  try {
    const cfg = global.appConfig || {};
    const telemetryEndpoint = cfg.TELEMETRY_ENDPOINT;
    const key = cfg.TELEMETRY_KEY;
    const customerId = cfg.CUSTOMER_ID;
    if (!telemetryEndpoint || !key || !customerId) {
      return { success: false, error: 'Feedback isn’t configured for this build.' };
    }
    const feedbackEndpoint = telemetryEndpoint.replace(/\/telemetry\/?$/, '/feedback');

    const category = String(payload && payload.category || 'other').toLowerCase();
    const body     = String(payload && payload.body || '').trim();
    const userEmail = String(payload && payload.user_email || '').trim().toLowerCase();
    if (!body) return { success: false, error: 'Please type something before sending.' };
    if (body.length > 8192) return { success: false, error: 'Feedback is too long (8 KB max).' };

    const requestBody = {
      customer_id: customerId,
      product: 'spectre',
      version: app.getVersion(),
      platform: process.platform,
      category,
      body,
      user_email: userEmail || undefined,
      client_ts: new Date().toISOString(),
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let res;
    try {
      res = await fetch(feedbackEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telemetry-Key': key,
        },
        body: JSON.stringify(requestBody),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let errMsg = 'Server returned ' + res.status;
      try {
        const errBody = await res.json();
        if (errBody && errBody.error) errMsg = errBody.error;
      } catch (_) { /* ignore */ }
      return { success: false, error: errMsg };
    }
    // Telemetry: count feedback submissions in admin Activity + Stats. Body
    // is intentionally NOT included — telemetry must not log user content.
    track('feedback_sent', {
      category,
      body_length: body.length,
      had_email: !!userEmail,
    }).catch(() => {});
    return { success: true };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (/abort/i.test(msg)) return { success: false, error: 'Network timeout. Try again.' };
    return { success: false, error: msg };
  }
});

// ── IPC: renderer-initiated telemetry ───────────────────────────────────────
// Bridges renderer-side trackEvent() calls to the main-process telemetry
// client. Allow-list enforcement: only known event names get through, and
// metadata is shallow-validated to scrub user-typed content and bound payload size.
const RENDERER_ALLOWED_EVENTS = new Set([
  'sample_spec_loaded',
  'onboarding_completed',
  'feature_used',
]);
ipcMain.handle('track-event', async (event, payload) => {
  try {
    const eventName = String((payload && payload.event) || '').trim();
    if (!RENDERER_ALLOWED_EVENTS.has(eventName)) {
      return { success: false, error: 'event not allowed' };
    }
    const metadata = {};
    const incoming = (payload && payload.metadata && typeof payload.metadata === 'object')
      ? payload.metadata : {};
    for (const k of Object.keys(incoming).slice(0, 10)) {
      const v = incoming[k];
      if (typeof v === 'string') metadata[k] = v.slice(0, 200);
      else if (typeof v === 'number' || typeof v === 'boolean') metadata[k] = v;
    }
    track(eventName, metadata).catch(() => {});
    return { success: true };
  } catch (_) {
    return { success: false };
  }
});

// ── IPC: sample spec discovery ───────────────────────────────────────────────
// Returns the absolute path to a bundled sample-spec PDF if one exists at
// assets/samples/sample-spec.pdf (relative to the app root). Lets the renderer
// surface a "Try with a sample spec" button on the upload screen — useful for
// Spencer demoing to other PMs without needing them to bring their own spec.
//
// Resolution paths mirror Cipher's pattern. If no sample is bundled with this
// build, returns { available: false } and the renderer hides the button.
ipcMain.handle('get-sample-spec', async () => {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'app', 'assets', 'samples', 'sample-spec.pdf'),
        path.join(process.resourcesPath, 'app.asar', 'assets', 'samples', 'sample-spec.pdf'),
        path.join(process.resourcesPath, 'assets', 'samples', 'sample-spec.pdf'),
      ]
    : [
        path.join(__dirname, 'assets', 'samples', 'sample-spec.pdf'),
      ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return { available: true, path: p, name: 'sample-spec.pdf' };
    } catch (_) { /* keep trying */ }
  }
  return { available: false };
});

// Open an external URL in the user's default browser (allow-listed)
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (typeof url !== 'string') throw new Error('Invalid URL');
    if (!/^(https?:|mailto:)/i.test(url)) throw new Error('Unsupported URL scheme');
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
