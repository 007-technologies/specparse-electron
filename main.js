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
ipcMain.handle('get-app-info', () => ({
  version: embeddedConfig.version || app.getVersion(),
  buildDate: embeddedConfig.buildDate || '',
  hasEmbeddedKey: Boolean(embeddedConfig.embeddedApiKey),
}));

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
    submittals = await extractAllSubmittals(apiKey, sections, (current, total, title) => {
      sendProgress({ message: title, current, total });
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
    throw new Error('Could not write the Excel file: ' + (err.message || err));
  }
});

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
      throw new Error('Could not save the file: ' + (err.message || err));
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
