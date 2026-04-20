let selectedFilePath = null;
let outputFilePath   = null;
let currentSubmittals = [];
let currentSections = [];
let currentProjectName = '';
let dragSrcRow = null;
let queryHistory = [];
let processingStartMs = 0;

// ── Splash ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const splash = document.getElementById('splashScreen');
  const dots   = document.getElementById('splashDots');
  const cont   = document.getElementById('splashContinue');
  setTimeout(() => { dots.classList.add('d-none'); cont.classList.remove('d-none'); }, 2200);
  cont.addEventListener('click', () => {
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 700);
  });
  const key = await window.specparse.getApiKey();
  if (key) updateKeyStatus(true);
  loadRecentProjects();

  // Populate version labels and hide API-key UI if key is baked into the build.
  try {
    if (window.specparse.getAppInfo) {
      const info = await window.specparse.getAppInfo();
      const v = info.version ? 'v' + info.version : 'v1.0';
      const sidebarV = document.getElementById('aboutTrigger');
      if (sidebarV) sidebarV.textContent = 'SpecParse ' + v;
      const aboutV = document.querySelector('.about-version');
      if (aboutV) aboutV.textContent = 'Version ' + (info.version || '1.0.0');
      if (info.hasEmbeddedKey) {
        // Hide the "Manage API Key" button in the About modal — Spencer never needs it.
        const apiBtn = document.getElementById('openApiKey');
        if (apiBtn) apiBtn.style.display = 'none';
      }
    }
  } catch (_) { /* non-fatal */ }
});

// ── Navigation ────────────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const map = { viewUpload:'upload', viewProcess:'process', viewReview:'review', viewResult:'result' };
  if (map[id]) document.querySelector('[data-view="' + map[id] + '"]')?.classList.add('active');
  window.specparse.setTitle('SpecParse' + (currentProjectName ? ' \u2014 ' + currentProjectName : ''));
}

// ── File handling ─────────────────────────────────────────────────────────────
document.getElementById('browseBtn').addEventListener('click', async e => {
  e.stopPropagation();
  const fp = await window.specparse.openFileDialog();
  if (fp) setFile(fp);
});

const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('click', async () => {
  const fp = await window.specparse.openFileDialog();
  if (fp) setFile(fp);
});
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && f.path && f.name.toLowerCase().endsWith('.pdf')) setFile(f.path, f.name, f.size);
});

function setFile(fp, name, size) {
  selectedFilePath = fp;
  const fn = name || fp.split('/').pop();
  document.getElementById('selectedFileName').textContent = fn;
  document.getElementById('selectedFileSize').textContent = size ? (size/1024/1024).toFixed(1)+' MB' : '';
  dropZone.classList.add('d-none');
  document.getElementById('fileSelected').classList.remove('d-none');
  document.getElementById('generateBtn').disabled = false;
  document.getElementById('navProcess').classList.remove('disabled');
  const pi = document.getElementById('projectName');
  if (!pi.value) pi.value = fn.replace(/\.pdf$/i,'').replace(/[_-]/g,' ').trim();
}

document.getElementById('clearFile').addEventListener('click', () => {
  selectedFilePath = null;
  dropZone.classList.remove('d-none');
  document.getElementById('fileSelected').classList.add('d-none');
  document.getElementById('generateBtn').disabled = true;
});

// ── Generate ──────────────────────────────────────────────────────────────────
document.getElementById('generateBtn').addEventListener('click', async () => {
  currentProjectName = document.getElementById('projectName').value.trim() || 'Submittal Log';
  showView('viewProcess');
  document.getElementById('sectionLog').innerHTML = '';
  processingStartMs = Date.now();
  setProgress(0, 'Preparing…', '', '');
  window.specparse.removeProgress();
  window.specparse.onProgress(({ message, current, total }) => {
    if (total > 0) {
      const pct = Math.min(100, Math.round(current / total * 100));
      setProgress(pct, message, current + ' / ' + total + ' sections', formatEta(current, total));
      addLog(message, current > 0);
    } else {
      setProgress(current === 0 ? 5 : 95, message, '', '');
      addLog(message, false);
    }
  });
  try {
    const result = await window.specparse.processSpec({ filePath: selectedFilePath, projectName: currentProjectName });
    currentSubmittals = result.submittals || [];
  currentSections = result.sectionData || [];
    outputFilePath = result.outputPath;
    buildReviewTable(currentSubmittals);
    // Save sections immediately so query bar works without exporting first
    if (window.specparse.saveProjectSections && currentSections.length) {
      window.specparse.saveProjectSections(currentProjectName, currentSections);
    }
    document.getElementById('reviewSubtitle').textContent =
      result.count + ' submittals found across ' + result.sections + ' sections. Edit below before exporting.';
    document.getElementById('navReview').classList.remove('disabled');
    showView('viewReview');
    updateReviewCount();
  } catch(err) {
    document.getElementById('errorMessage').textContent = err.message || 'An error occurred.';
    showView('viewError');
  }
});

function setProgress(pct, label, count, eta) {
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressSection').textContent = label;
  document.getElementById('progressCount').textContent = count || '';
  const pctEl = document.getElementById('progressPercent');
  if (pctEl) pctEl.textContent = pct + '%';
  const etaEl = document.getElementById('progressEta');
  if (etaEl) etaEl.textContent = eta || '';
}

// Produces an ETA string like "~45s remaining" / "~3 min remaining". Falls back to
// an empty string until we have enough samples to make a meaningful prediction.
function formatEta(current, total) {
  if (!processingStartMs || current < 3 || current >= total) return '';
  const elapsed = (Date.now() - processingStartMs) / 1000;
  if (elapsed < 2) return '';
  const rate = current / elapsed;
  if (rate <= 0) return '';
  const remaining = (total - current) / rate;
  if (remaining < 45) return '~' + Math.round(remaining) + 's remaining';
  if (remaining < 3600) return '~' + Math.round(remaining / 60) + ' min remaining';
  return '~' + (remaining / 3600).toFixed(1) + ' hr remaining';
}

function addLog(text, found) {
  const log = document.getElementById('sectionLog');
  const el = document.createElement('div');
  el.className = 'log-entry' + (found ? ' found' : '');
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// ── Review Table ──────────────────────────────────────────────────────────────
function buildReviewTable(submittals) {
  const tbody = document.getElementById('reviewBody');
  tbody.innerHTML = '';
  submittals.forEach(s => tbody.appendChild(buildReviewRow(s)));
}

function buildReviewRow(s) {
  const tr = document.createElement('tr');
  tr.draggable = true;
  // aiExtractor emits specSection as "NUMBER - TITLE" (e.g. "075423 - Thermoplastic-Polyolefin Roofing").
  // Parse out the number for the badge, and stash the full string + description on the row
  // so the export handler can include them in the Excel payload.
  const specSectionFull = s.specSection || '';
  const secNum = specSectionFull.split(' - ')[0] || s.sectionNumber || '';
  tr.dataset.section = secNum;
  tr.dataset.specsection = specSectionFull;
  tr.dataset.description = s.description || '';
  tr.innerHTML =
    '<td><span class="drag-handle" title="Drag to reorder">&#8942;&#8942;</span></td>' +
    '<td><input type="checkbox" class="row-check" checked /></td>' +
    '<td><span class="sec-badge">'+secNum+'</span></td>' +
    '<td><input class="review-input num-input" value="'+(s.submittalNumber||'')+'" placeholder="e.g. 075423-1" /></td>' +
    '<td><input class="review-input title-input" value="'+(s.title||'')+'" placeholder="Description..." /></td>' +
    '<td><select class="type-select">' +
      ['Product Information','Shop Drawing','Sample','Mix Design','Test Report','Warranty','Other']
        .map(t => '<option'+(s.type===t?' selected':'')+'>'+t+'</option>').join('') +
    '</select></td>' +
    '<td><button class="row-del" title="Remove">&#10005;</button></td>';

  const check = tr.querySelector('.row-check');
  check.addEventListener('change', () => {
    tr.classList.toggle('excluded', !check.checked);
    updateReviewCount();
    syncMasterCheck();
  });
  tr.querySelector('.row-del').addEventListener('click', () => { tr.remove(); updateReviewCount(); });

  // Drag to reorder
  tr.addEventListener('dragstart', e => {
    dragSrcRow = tr; tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  tr.addEventListener('dragend', () => {
    tr.classList.remove('dragging');
    document.querySelectorAll('#reviewBody tr').forEach(r => r.classList.remove('drag-over'));
  });
  tr.addEventListener('dragover', e => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('#reviewBody tr').forEach(r => r.classList.remove('drag-over'));
    tr.classList.add('drag-over');
  });
  tr.addEventListener('drop', e => {
    e.preventDefault();
    if (dragSrcRow && dragSrcRow !== tr) {
      const all = [...document.querySelectorAll('#reviewBody tr')];
      if (all.indexOf(dragSrcRow) < all.indexOf(tr)) tr.after(dragSrcRow);
      else tr.before(dragSrcRow);
    }
    tr.classList.remove('drag-over');
    updateReviewCount();
  });
  return tr;
}

function updateReviewCount() {
  const total   = document.querySelectorAll('#reviewBody tr').length;
  const checked = document.querySelectorAll('#reviewBody tr:not(.excluded)').length;
  document.getElementById('reviewCount').textContent = checked + ' of ' + total + ' submittals selected';
}
function syncMasterCheck() {
  const all  = document.querySelectorAll('#reviewBody .row-check');
  const chk  = document.querySelectorAll('#reviewBody .row-check:checked');
  const mc   = document.getElementById('masterCheck');
  mc.checked = chk.length === all.length;
  mc.indeterminate = chk.length > 0 && chk.length < all.length;
}
function updateKeyStatus(ok) {}

document.getElementById('masterCheck').addEventListener('change', e => {
  document.querySelectorAll('#reviewBody tr').forEach(tr => {
    const cb = tr.querySelector('.row-check');
    cb.checked = e.target.checked;
    tr.classList.toggle('excluded', !e.target.checked);
  });
  updateReviewCount();
});
document.getElementById('selectAllBtn').addEventListener('click', () => {
  document.querySelectorAll('#reviewBody tr').forEach(tr => {
    tr.querySelector('.row-check').checked = true;
    tr.classList.remove('excluded');
  });
  document.getElementById('masterCheck').checked = true;
  updateReviewCount();
});
document.getElementById('selectNoneBtn').addEventListener('click', () => {
  document.querySelectorAll('#reviewBody tr').forEach(tr => {
    tr.querySelector('.row-check').checked = false;
    tr.classList.add('excluded');
  });
  document.getElementById('masterCheck').checked = false;
  updateReviewCount();
});
document.getElementById('addRowBtn').addEventListener('click', () => {
  const tbody = document.getElementById('reviewBody');
  tbody.appendChild(buildReviewRow({ sectionNumber:'', submittalNumber:'', title:'', type:'Product Information' }));
  updateReviewCount();
});

// ── Export ────────────────────────────────────────────────────────────────────
document.getElementById('confirmBtn').addEventListener('click', async () => {
  const rows = [...document.querySelectorAll('#reviewBody tr:not(.excluded)')];
  const submittals = rows.map(r => ({
    sectionNumber:   r.dataset.section,
    specSection:     r.dataset.specsection || r.dataset.section || '',
    submittalNumber: r.querySelector('.num-input').value,
    title:           r.querySelector('.title-input').value,
    type:            r.querySelector('.type-select').value,
    description:     r.dataset.description || '',
  }));
  if (!submittals.length) { alert('Select at least one submittal.'); return; }
  const btn = document.getElementById('confirmBtn');
  btn.textContent = 'Exporting...'; btn.disabled = true;
  try {
    const result = await window.specparse.exportReviewed({ submittals, projectName: currentProjectName });
    outputFilePath = result.outputPath;
    await window.specparse.saveRecent({ name: currentProjectName, date: new Date().toLocaleDateString(), count: submittals.length, outputPath: outputFilePath });
    // Persist reviewed submittals so clicking this project from recents restores the exact table.
    if (window.specparse.saveProjectSubmittals) {
      await window.specparse.saveProjectSubmittals(currentProjectName, submittals);
    }
    document.getElementById('resultStats').innerHTML =
      '<strong style="font-size:32px;color:#265C30;">'+submittals.length+'</strong> submittals exported<br><span style="font-size:13px;color:#64748B;">'+currentProjectName+'</span>';
    document.getElementById('navResult').classList.remove('disabled');
    showView('viewResult');
  } catch(err) {
    document.getElementById('errorMessage').textContent = err.message;
    showView('viewError');
  } finally { btn.textContent = 'Export to Excel'; btn.disabled = false; }
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (outputFilePath) window.specparse.saveFile(outputFilePath);
});

document.getElementById('backToUploadBtn').addEventListener('click', () => showView('viewUpload'));
document.getElementById('startOverBtn').addEventListener('click', () => {
  selectedFilePath = null; outputFilePath = null; currentProjectName = ''; queryHistory = [];
  document.getElementById('dropZone').classList.remove('d-none');
  document.getElementById('fileSelected').classList.add('d-none');
  document.getElementById('generateBtn').disabled = true;
  document.getElementById('projectName').value = '';
  ['navProcess','navReview','navResult'].forEach(id => document.getElementById(id).classList.add('disabled'));
  loadRecentProjects();
  showView('viewUpload');
});
document.getElementById('retryBtn').addEventListener('click', () => showView('viewUpload'));

// ── Recent Projects ───────────────────────────────────────────────────────────
async function loadRecentProjects() {
  const recent = await window.specparse.getRecent();
  const section = document.getElementById('recentSection');
  const list    = document.getElementById('recentList');
  if (!recent || !recent.length) { section.classList.add('d-none'); return; }
  section.classList.remove('d-none');
  list.innerHTML = '';
  recent.forEach(p => {
    const el = document.createElement('div');
    el.className = 'recent-item';
    el.innerHTML = '<div><div class="recent-name">'+p.name+'</div><div class="recent-meta">'+p.count+' submittals &middot; '+p.date+'</div></div><button class="recent-remove" title="Remove">&times;</button>';
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.recent-remove')) {
        e.stopPropagation();
        try {
          if (window.specparse.removeRecent) await window.specparse.removeRecent(p.name);
        } catch (_) { /* non-fatal */ }
        loadRecentProjects();
        return;
      }
      try {
        const subs = window.specparse.getProjectSubmittals
          ? await window.specparse.getProjectSubmittals(p.name)
          : [];
        // Restore sections so query bar works without re-processing
        if (window.specparse.getProjectSections) {
          const savedSections = await window.specparse.getProjectSections(p.name);
          if (savedSections && savedSections.length) currentSections = savedSections;
          else currentSections = [];
        }
        if (subs && subs.length > 0) {
          currentProjectName = p.name;
          currentSubmittals = subs;
          document.getElementById('projectName').value = p.name;
          buildReviewTable(subs);
          const navR = document.getElementById('navReview');
          if (navR) navR.classList.remove('disabled');
          showView('viewReview');
          if (window.specparse.setTitle) window.specparse.setTitle('SpecParse — ' + p.name);
        } else if (p.outputPath && window.specparse.saveFile) {
          // Legacy recent (saved before submittal persistence landed). Offer to re-save the Excel.
          const saved = await window.specparse.saveFile(p.outputPath);
          if (!saved) {
            alert('The Excel file for "' + p.name + '" is no longer available on this machine. Re-process the PDF to regenerate it.');
          }
        } else {
          alert('This project can\u2019t be opened — its saved data is missing. Use the × to remove it from recents and re-process the PDF.');
        }
      } catch (err) {
        alert('Could not open "' + p.name + '": ' + (err.message || err));
      }
    });
    list.appendChild(el);
  });
}

// ── About ─────────────────────────────────────────────────────────────────────
const aboutOverlay = document.getElementById('aboutOverlay');
document.getElementById('aboutTrigger').addEventListener('click', () => aboutOverlay.classList.remove('d-none'));
document.getElementById('closeAbout').addEventListener('click', () => aboutOverlay.classList.add('d-none'));
document.getElementById('openApiKey').addEventListener('click', () => {
  aboutOverlay.classList.add('d-none');
  document.getElementById('settingsOverlay').classList.remove('d-none');
});

// ── Settings ──────────────────────────────────────────────────────────────────
const settingsOverlay = document.getElementById('settingsOverlay');
document.getElementById('closeSettings').addEventListener('click', () => settingsOverlay.classList.add('d-none'));
document.getElementById('cancelSettings').addEventListener('click', () => settingsOverlay.classList.add('d-none'));
document.getElementById('toggleKey').addEventListener('click', () => {
  const inp = document.getElementById('apiKeyInput');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  document.getElementById('toggleKey').textContent = show ? 'Hide' : 'Show';
});
document.getElementById('saveKey').addEventListener('click', async () => {
  const key = document.getElementById('apiKeyInput').value.trim();
  const fb  = document.getElementById('keyFeedback');
  if (!key.startsWith('sk-ant-')) {
    fb.className = 'key-feedback err'; fb.textContent = 'Invalid key — should start with sk-ant-'; return;
  }
  await window.specparse.saveApiKey(key);
  fb.className = 'key-feedback ok'; fb.textContent = 'Key saved';
  setTimeout(() => { settingsOverlay.classList.add('d-none'); fb.textContent = ''; document.getElementById('apiKeyInput').value = ''; }, 1200);
});

// ── Query Bar ─────────────────────────────────────────────────────────────────
function filterSections(query, sections) {
  if (!sections || sections.length === 0) return [];
  const q = query.toLowerCase();
  const sectionNumRe = /\b(\d{2}[\s\-.]?\d{2,3}[\s\-.]?\d{0,2})\b/g;
  const mentioned = [...query.matchAll(sectionNumRe)].map(m => m[1].replace(/[\s\-.]/g, ''));
  if (mentioned.length > 0) {
    const matches = sections.filter(s => {
      const sNum = (s.num || s.number || '').replace(/[\s\-.]/g, '');
      return mentioned.some(n => {
        return sNum.includes(n) || n.includes(sNum) || sNum.slice(0,5) === n.slice(0,5);
      });
    });
    if (matches.length > 0) return matches.slice(0, 4);
  }
  const words = q.split(/\s+/).filter(w => w.length > 3);
  const scored = sections.map(s => {
    const hay = (((s.num || s.number || '')) + ' ' + (s.title || '') + ' ' + (s.content || '')).toLowerCase();
    const hits = words.filter(w => hay.includes(w)).length;
    return { s, hits };
  }).filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits);
  return scored.slice(0, 3).map(x => x.s);
}

window.runQuery = async function() {
  const queryInput  = document.getElementById('queryInput');
  const querySubmit = document.getElementById('querySubmit');
  const queryResp   = document.getElementById('queryResponse');
  const query = queryInput ? queryInput.value.trim() : '';
  if (!query) return;
  if (!window.specparse || !window.specparse.querySpec) {
    if (queryResp) { queryResp.style.display='block'; queryResp.className='query-response error'; queryResp.textContent='API bridge not ready. Please restart the app.'; }
    return;
  }
  const clearBtn = document.getElementById('queryClear');
  querySubmit.disabled = true;
  if (clearBtn) clearBtn.style.display = 'none';
  queryResp.style.display = 'block';
  queryResp.className = 'query-response';
  queryResp.innerHTML = '<span class="query-thinking">Searching spec…</span>';
  try {
    if (!currentSections || currentSections.length === 0) {
      queryResp.className = 'query-response error';
      queryResp.textContent = 'No spec data — process a spec first.';
      querySubmit.disabled = false;
      return;
    }
    // Pass ALL sections — main.js handles scoring and relevance
    const result = await window.specparse.querySpec(query, currentSections, queryHistory, currentSubmittals);
    querySubmit.disabled = false;
    if (result.error) {
      queryResp.className = 'query-response error';
      queryResp.textContent = result.error;
    } else {
      const raw = result.answer || '';
      queryResp.innerHTML = raw
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,'<em>$1</em>')
        .replace(/\n/g,'<br>');
      if (clearBtn) clearBtn.style.display = 'inline-flex';
      queryHistory.push({ role: 'user',      content: query });
      queryHistory.push({ role: 'assistant', content: result.answer });
      if (queryHistory.length > 8) queryHistory = queryHistory.slice(-8);
    }
    } catch(err) {
    queryResp.className = 'query-response error';
    queryResp.textContent = 'Error: ' + err.message;
    querySubmit.disabled = false;
    console.error('[Query error]', err);
  }
};

document.addEventListener('click', function(e) {
  if (e.target.closest('#querySubmit')) { window.runQuery(); return; }
  const toggle = e.target.closest('#queryToggle');
  if (toggle) {
    const body    = document.getElementById('queryBody');
    const chevron = document.getElementById('queryChevron');
    if (body)    body.classList.toggle('hidden');
    if (chevron) chevron.classList.toggle('collapsed');
  }
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target && e.target.id === 'queryInput') window.runQuery();
});


