const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('specparse', {
  getApiKey:      ()      => ipcRenderer.invoke('get-api-key'),
  saveApiKey:     (key)   => ipcRenderer.invoke('save-api-key', key),
  processSpec:    (opts)  => ipcRenderer.invoke('process-spec', opts),
  exportReviewed: (opts)  => ipcRenderer.invoke('export-reviewed', opts),
  saveFile:       (src)   => ipcRenderer.invoke('save-file', src),
  openFileDialog: ()      => ipcRenderer.invoke('open-file-dialog'),
  onProgress:     (cb)    => ipcRenderer.on('progress', (_, data) => cb(data)),
  removeProgress: ()      => ipcRenderer.removeAllListeners('progress'),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  getRecent: () => ipcRenderer.invoke('get-recent'),
  saveRecent: (project) => ipcRenderer.invoke('save-recent', project),
    saveProjectSubmittals: (projectName, submittals) => ipcRenderer.invoke('save-project-submittals', { projectName, submittals }),
    getProjectSubmittals: (projectName) => ipcRenderer.invoke('get-project-submittals', projectName),
    querySpec: (query, sections, history, submittals) => ipcRenderer.invoke('query-spec', { query, sections, history: history || [], submittals: submittals || [] }),
    saveProjectSections: (projectName, sections) => ipcRenderer.invoke('save-project-sections', { projectName, sections }),
    getProjectSections: (projectName) => ipcRenderer.invoke('get-project-sections', projectName),
    removeRecent: (projectName) => ipcRenderer.invoke('remove-recent', projectName),
    hasEmbeddedKey: () => ipcRenderer.invoke('has-embedded-key'),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    // Auto-update — banner subscribes to status; button calls install
    onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_, data) => cb(data)),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    // Sample-spec lookup — returns { available, path?, name? }. Renderer uses
    // this to surface a "Try with a sample spec" button if a sample is bundled.
    getSampleSpec: () => ipcRenderer.invoke('get-sample-spec'),
    // Renderer-initiated telemetry — for events main can't see (UI clicks).
    trackEvent: (event, metadata) => ipcRenderer.invoke('track-event', { event, metadata }),
    // In-app feedback — POSTs to /api/feedback (auth via TELEMETRY_KEY).
    // Body: { category, body, user_email? } → { ok } or { ok:false, error }.
    sendFeedback: (payload) => ipcRenderer.invoke('send-feedback', payload),
    // Manual "Check for updates" button — fires autoUpdater immediately
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
});
