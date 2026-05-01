let selectedFilePath = null;
let outputFilePath   = null;
let currentSubmittals = [];
let currentSections = [];
let currentProjectName = '';
let dragSrcRow = null;
let queryHistory = [];
let processingStartMs = 0;

// CSI MasterFormat division names — covers the divisions Spencer's specs
// actually touch. Used to humanize the "scanning Division 09" headline
// during processing so the user sees real category names instead of
// raw section numbers. (Pre-2004 Division 1-16 numbers map to the same
// division concept as 2004+ 01-49 — close enough for status display.)
const DIVISION_NAMES = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood, Plastics & Composites',
  '07': 'Thermal & Moisture Protection',
  '08': 'Openings (Doors, Windows, Glazing)',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '13': 'Special Construction',
  '14': 'Conveying Equipment',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC',
  '25': 'Integrated Automation',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety & Security',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
  '34': 'Transportation',
  '35': 'Waterway & Marine',
};

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
      // Surface customer ID so Spencer (and any prospects he demos to) can
      // see at a glance which build they're on. Reed sees the same string
      // in admin telemetry — keeps support conversations grounded.
      const aboutCustomer = document.getElementById('aboutCustomer');
      if (aboutCustomer) {
        aboutCustomer.textContent = info.customerId
          ? 'Customer: ' + info.customerId
          : '';
      }
      if (info.hasEmbeddedKey) {
        // Hide the "Manage API Key" button in the About modal — Spencer never needs it.
        const apiBtn = document.getElementById('openApiKey');
        if (apiBtn) apiBtn.style.display = 'none';
      }
    }
  } catch (_) { /* non-fatal */ }
});

// Send-feedback button inside the About modal — opens the same overlay as
// the sidebar Feedback link.
document.getElementById('aboutSendFeedback')?.addEventListener('click', () => {
  // Close About first so the two overlays don't stack visually.
  const aboutOverlay = document.getElementById('aboutOverlay');
  if (aboutOverlay) aboutOverlay.classList.add('d-none');
  if (typeof openFeedbackOverlay === 'function') openFeedbackOverlay();
});

// Check-for-updates button — fires autoUpdater immediately rather than
// waiting for the hourly background poll. Inline status feedback so the
// user knows their click did something.
document.getElementById('aboutCheckUpdates')?.addEventListener('click', async () => {
  const btn = document.getElementById('aboutCheckUpdates');
  const status = document.getElementById('aboutUpdateStatus');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Checking…';
  if (status) {
    status.textContent = '';
    status.className = 'about-update-status';
  }
  try {
    if (!window.specparse || !window.specparse.checkForUpdates) {
      throw new Error('Update check not available in this build.');
    }
    const result = await window.specparse.checkForUpdates();
    if (status) {
      if (result && result.success) {
        status.textContent = result.message || 'Checked.';
      } else {
        status.textContent = (result && result.error) || 'Check failed.';
        status.classList.add('err');
      }
    }
  } catch (err) {
    if (status) {
      status.textContent = (err && err.message) || 'Check failed.';
      status.classList.add('err');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check for updates';
  }
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

// Sample-spec discovery: ask the main process if assets/samples/sample-spec.pdf
// is bundled with this build. If yes, surface "Try with a sample spec" beneath
// the dropzone. Hidden if no sample bundled — no broken affordance.
(async function setupSampleSpecAffordance() {
  try {
    if (!window.specparse || !window.specparse.getSampleSpec) return;
    const result = await window.specparse.getSampleSpec();
    if (!result || !result.available) return;
    const hint = document.getElementById('sampleSpecHint');
    const btn = document.getElementById('loadSampleSpec');
    if (!hint || !btn) return;
    hint.classList.remove('d-none');
    btn.addEventListener('click', () => {
      // Reuse the existing setFile flow — sample is just a regular file path
      // from the renderer's perspective. The user still gets the project-name
      // input and Generate button so they're walked through the full flow,
      // not teleported to the result.
      setFile(result.path, result.name || 'sample-spec.pdf');
      if (window.specparse && window.specparse.trackEvent) {
        window.specparse.trackEvent('sample_spec_loaded', { source: 'upload-screen' }).catch(() => {});
      }
    });
  } catch (_) { /* fail silently — never block first-launch UX on this */ }
})();

// ── Generate ──────────────────────────────────────────────────────────────────
document.getElementById('generateBtn').addEventListener('click', async () => {
  currentProjectName = document.getElementById('projectName').value.trim() || 'Submittal Log';
  showView('viewProcess');
  document.getElementById('sectionLog').innerHTML = '';
  processingStartMs = Date.now();
  setProgress(0, 'Preparing…', '', '');
  window.specparse.removeProgress();
  let lastDivision = null;
  window.specparse.onProgress(({ message, current, total, found }) => {
    if (total > 0) {
      const pct = Math.min(100, Math.round(current / total * 100));
      // Pull the section number out of the message ("075423 - Title") so we
      // can derive Division (first 2 digits) and show a richer headline.
      const sectionNum = (message || '').split(' - ')[0] || '';
      const division = sectionNum.slice(0, 2);
      const divName = DIVISION_NAMES[division];
      const headline = divName
        ? 'Scanning Division ' + division + ' — ' + divName
        : 'Scanning ' + (message || 'spec');
      const subline = (typeof found === 'number')
        ? found + ' ' + (found === 1 ? 'submittal' : 'submittals') +
          ' found · ' + current + ' / ' + total + ' sections'
        : current + ' / ' + total + ' sections';
      setProgress(pct, headline, subline, formatEta(current, total));
      // Activity log: only emit a line on division transitions (otherwise the
      // log floods with one line per CSI subsection, which is just noise).
      if (division && division !== lastDivision && divName) {
        addLog('Entered Division ' + division + ' — ' + divName, false);
        lastDivision = division;
      }
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
    // Tally confidence buckets so the subtitle gives the user an immediate
    // sense of how much (if any) actually warrants their attention before export.
    const lowCount = currentSubmittals.filter(s => s.confidence === 'low').length;
    const medCount = currentSubmittals.filter(s => s.confidence === 'medium').length;
    const flagged = lowCount + medCount;
    let subtitle = result.count + ' submittals found across ' + result.sections + ' sections.';
    if (flagged === 0) {
      subtitle += ' Everything came from the curated dictionary — no AI guesses to second-guess.';
    } else if (lowCount > 0) {
      subtitle += ' ' + lowCount + ' AI-extracted ' + (lowCount === 1 ? 'row needs' : 'rows need') +
                  ' a closer look (red dot). Edit below before exporting.';
    } else {
      subtitle += ' ' + medCount + ' AI-extracted ' + (medCount === 1 ? 'row' : 'rows') +
                  ' (yellow dot) — worth a glance before exporting.';
    }
    document.getElementById('reviewSubtitle').textContent = subtitle;
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
  // Confidence comes from aiExtractor: 'high' (dictionary), 'medium' (AI clean),
  // or 'low' (AI sketchy). User-added rows have no confidence — treat as 'high'
  // since the user typed it themselves. Legacy persisted rows from before this
  // shipped also have no confidence — treat as 'high' (don't retroactively flag).
  const confidence = s.confidence || 'high';
  tr.dataset.section = secNum;
  tr.dataset.specsection = specSectionFull;
  tr.dataset.description = s.description || '';
  tr.dataset.confidence = confidence;
  const dotTitle = {
    high: 'High confidence — verified from SpecParse\'s curated section dictionary',
    medium: 'Medium confidence — extracted by AI, fields look clean. Worth a glance.',
    low: 'Low confidence — extracted by AI but the fields look incomplete or generic. Please review.',
  }[confidence];
  tr.innerHTML =
    '<td><span class="drag-handle" title="Drag to reorder">&#8942;&#8942;</span></td>' +
    '<td><input type="checkbox" class="row-check" checked /></td>' +
    '<td><span class="conf-dot conf-'+confidence+'" title="'+dotTitle+'"></span></td>' +
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
  // Count confidence buckets across ALL rows (not just checked) so the user
  // sees how many were AI-flagged regardless of their selection state.
  const high = document.querySelectorAll('#reviewBody tr[data-confidence="high"]').length;
  const med  = document.querySelectorAll('#reviewBody tr[data-confidence="medium"]').length;
  const low  = document.querySelectorAll('#reviewBody tr[data-confidence="low"]').length;
  const flagged = med + low;

  let summary = checked + ' of ' + total + ' selected';
  if (flagged > 0) {
    summary += '  ·  <span class="conf-summary"><span class="conf-dot conf-high"></span>'+high+
               ' <span class="conf-dot conf-medium"></span>'+med+
               ' <span class="conf-dot conf-low"></span>'+low+'</span>';
  }
  const countEl = document.getElementById('reviewCount');
  countEl.innerHTML = summary;

  // Show/hide the "flagged only" toggle — pointless when nothing is flagged.
  const flagBtn = document.getElementById('filterFlaggedBtn');
  if (flagBtn) flagBtn.style.display = flagged > 0 ? '' : 'none';
}

// Filter the review table to show only rows that need a second look
// (medium + low confidence). Toggling again restores all rows.
function applyReviewFilter() {
  const flaggedOnly = document.body.classList.contains('review-flagged-only');
  document.querySelectorAll('#reviewBody tr').forEach(tr => {
    const c = tr.dataset.confidence || 'high';
    if (flaggedOnly && c === 'high') tr.classList.add('hidden-by-filter');
    else tr.classList.remove('hidden-by-filter');
  });
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

// Toggle "Show flagged only" — collapses the table to just the medium+low rows.
const filterFlaggedBtn = document.getElementById('filterFlaggedBtn');
if (filterFlaggedBtn) {
  filterFlaggedBtn.addEventListener('click', () => {
    document.body.classList.toggle('review-flagged-only');
    const on = document.body.classList.contains('review-flagged-only');
    filterFlaggedBtn.textContent = on ? 'Show all' : 'Show flagged only';
    filterFlaggedBtn.classList.toggle('btn-active', on);
    applyReviewFilter();
  });
}

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
    // Carry confidence through so reopened projects still show the flags.
    // buildExcel ignores extra fields — Procore export is unaffected.
    confidence:      r.dataset.confidence || 'high',
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
  const empty   = document.getElementById('recentEmpty');
  const hasItems = !!(recent && recent.length);
  // Toggle list vs empty-state inside the recents overlay.
  section.classList.toggle('d-none', !hasItems);
  if (empty) empty.classList.toggle('d-none', hasItems);
  if (!hasItems) return;
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

// Sidebar Settings link — opens the same overlay as the About → Manage API key path
const sidebarSettingsBtn = document.getElementById('sidebarSettings');
if (sidebarSettingsBtn) {
  sidebarSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    settingsOverlay.classList.remove('d-none');
  });
}

// Sidebar Recents link — opens the recents overlay (which contains the
// existing recentSection/recentList markup, populated by loadRecentProjects).
const recentsOverlay = document.getElementById('recentsOverlay');
const sidebarRecentsBtn = document.getElementById('sidebarRecents');
if (sidebarRecentsBtn && recentsOverlay) {
  sidebarRecentsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    recentsOverlay.classList.remove('d-none');
    // Refresh the list every time the overlay opens — cheap, ensures the
    // user sees the latest state even if they just removed an item.
    loadRecentProjects();
  });
  const closeRecentsBtn = document.getElementById('closeRecents');
  if (closeRecentsBtn) {
    closeRecentsBtn.addEventListener('click', () => recentsOverlay.classList.add('d-none'));
  }
}
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

// ── Auto-update banner ────────────────────────────────────────────────────────
// main.js fires 'update-status' events as electron-updater progresses through
// checking → available → downloading → downloaded (or → error). We only show
// the banner when the update is fully downloaded and ready to install — quiet
// during the in-progress states so the user isn't distracted.
(function () {
  const banner = document.getElementById('updateBanner');
  const text = document.getElementById('updateBannerText');
  const btn = document.getElementById('updateBannerBtn');
  const close = document.getElementById('updateBannerClose');
  if (!banner || !window.specparse || !window.specparse.onUpdateStatus) return;

  let dismissedVersion = null;

  window.specparse.onUpdateStatus(({ status, data }) => {
    if (status === 'downloaded') {
      // Don't re-show if user explicitly dismissed this exact version.
      if (dismissedVersion && dismissedVersion === data) return;
      const v = data ? ` (v${data})` : '';
      text.textContent = `A new version of SpecParse is ready to install${v}.`;
      banner.classList.remove('d-none');
    } else if (status === 'error') {
      // Errors are tracked via telemetry; don't bother the user with a banner.
      console.warn('[update] error:', data);
    }
    // checking / available / downloading / not-available — no UI.
  });

  if (btn) {
    btn.addEventListener('click', () => {
      window.specparse.installUpdate();
    });
  }
  if (close) {
    close.addEventListener('click', () => {
      // Dismiss for the current downloaded version. Banner returns next
      // launch (when the update is auto-installed by autoInstallOnAppQuit
      // OR a newer version arrives).
      dismissedVersion = text.textContent.match(/v[\d.]+/)?.[0] || true;
      banner.classList.add('d-none');
    });
  }
})();

// ── First-launch onboarding overlay ──────────────────────────────────────────
// Mirrors Cipher's pattern. Shown exactly once per machine — keyed off
// localStorage.specparseOnboarded. Critical for prospects Spencer demos to who
// open SpecParse with zero context.
//
// Mark as onboarded on display (not dismiss) so a force-quit during
// onboarding doesn't replay the modal next launch.
const SPECPARSE_ONBOARDED_KEY = 'specparseOnboarded';

(async function maybeShowSpecParseOnboarding() {
  try {
    let onboarded = null;
    try { onboarded = localStorage.getItem(SPECPARSE_ONBOARDED_KEY); } catch (_) { return; }
    if (onboarded === '1') return;

    const overlay = document.getElementById('onboardingOverlay');
    const splash = document.getElementById('splashScreen');
    if (!overlay) return;

    // Wait for the splash to dismiss before showing onboarding — splash
    // takes priority on first impression.
    function showWhenReady() {
      // Surface the sample-spec link inside the onboarding modal too.
      try {
        if (window.specparse && window.specparse.getSampleSpec) {
          window.specparse.getSampleSpec().then((result) => {
            const hint = document.getElementById('onboardingSampleHint');
            const btn = document.getElementById('onboardingTrySample');
            if (hint && result && result.available) {
              hint.classList.remove('d-none');
              if (btn) {
                btn.addEventListener('click', () => {
                  closeOnboarding();
                  if (typeof setFile === 'function') setFile(result.path, result.name || 'sample-spec.pdf');
                  if (window.specparse && window.specparse.trackEvent) {
                    window.specparse.trackEvent('sample_spec_loaded', { source: 'onboarding-modal' }).catch(() => {});
                  }
                });
              }
            } else if (hint) {
              hint.classList.add('d-none');
            }
          }).catch(() => { /* fail silently */ });
        }
      } catch (_) { /* ignore */ }

      overlay.classList.remove('d-none');
      try { localStorage.setItem(SPECPARSE_ONBOARDED_KEY, '1'); } catch (_) { /* */ }
    }

    // If splash is still up, wait for it to fade. Otherwise show now.
    if (splash && splash.style.display !== 'none' && !splash.classList.contains('fade-out')) {
      // Watch for the splash to dismiss. Show onboarding 300ms after fade so
      // it doesn't feel jarring.
      const continueBtn = document.getElementById('splashContinue');
      if (continueBtn) {
        continueBtn.addEventListener('click', () => {
          setTimeout(showWhenReady, 1000);
        }, { once: true });
      } else {
        // No splash continue button (already past) — just show.
        setTimeout(showWhenReady, 100);
      }
    } else {
      setTimeout(showWhenReady, 100);
    }
  } catch (_) { /* never block first launch */ }
})();

function closeOnboarding() {
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) overlay.classList.add('d-none');
}
document.getElementById('onboardingSkip')?.addEventListener('click', closeOnboarding);
document.getElementById('onboardingStart')?.addEventListener('click', closeOnboarding);
document.getElementById('onboardingOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'onboardingOverlay') closeOnboarding();
});

// ── In-app feedback modal ────────────────────────────────────────────────────
// Mirrors Cipher's pattern. Sidebar Feedback link opens this; it POSTs to
// /api/feedback via the main process IPC. Reed gets an email per send.
let feedbackCategory = 'other';
let feedbackSending = false;

function openFeedbackOverlay() {
  const overlay = document.getElementById('feedbackOverlay');
  if (!overlay) return;
  // Reset state on every open — don't carry typed text across opens.
  document.getElementById('feedbackBody').value = '';
  document.getElementById('feedbackEmail').value = '';
  feedbackCategory = 'other';
  document.querySelectorAll('#feedbackOverlay .feedback-cat').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.cat === 'other');
  });
  const status = document.getElementById('feedbackStatus');
  if (status) {
    status.classList.add('d-none');
    status.textContent = '';
    status.className = 'feedback-status d-none';
  }
  overlay.classList.remove('d-none');
  setTimeout(() => document.getElementById('feedbackBody').focus(), 50);
}

function closeFeedbackOverlay() {
  if (feedbackSending) return;  // don't yank mid-send
  const overlay = document.getElementById('feedbackOverlay');
  if (overlay) overlay.classList.add('d-none');
}

document.getElementById('sidebarFeedback')?.addEventListener('click', (e) => {
  e.preventDefault();
  openFeedbackOverlay();
});
document.getElementById('feedbackClose')?.addEventListener('click', closeFeedbackOverlay);
document.getElementById('feedbackCancel')?.addEventListener('click', closeFeedbackOverlay);
document.getElementById('feedbackOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'feedbackOverlay') closeFeedbackOverlay();
});

// Category buttons — one always active, mirroring feedbackCategory.
document.querySelectorAll('#feedbackOverlay .feedback-cat').forEach((btn) => {
  btn.addEventListener('click', () => {
    feedbackCategory = btn.dataset.cat || 'other';
    document.querySelectorAll('#feedbackOverlay .feedback-cat').forEach((b) => {
      b.classList.toggle('is-active', b === btn);
    });
  });
});

document.getElementById('feedbackSend')?.addEventListener('click', async () => {
  if (feedbackSending) return;
  const sendBtn = document.getElementById('feedbackSend');
  const status = document.getElementById('feedbackStatus');
  const body = (document.getElementById('feedbackBody').value || '').trim();
  const email = (document.getElementById('feedbackEmail').value || '').trim();

  if (status) status.classList.remove('d-none');
  if (!body) {
    status.className = 'feedback-status err';
    status.textContent = 'Please type a message before sending.';
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    status.className = 'feedback-status err';
    status.textContent = 'That email looks off — leave it blank or fix it.';
    return;
  }

  feedbackSending = true;
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  status.className = 'feedback-status';
  status.textContent = '';

  try {
    const res = await window.specparse.sendFeedback({
      category: feedbackCategory,
      body,
      user_email: email || undefined,
    });
    if (res && res.success) {
      status.className = 'feedback-status ok';
      status.textContent = 'Sent! Reed gets a copy in his inbox right now. Thanks for taking the time.';
      document.getElementById('feedbackBody').value = '';
      setTimeout(() => { closeFeedbackOverlay(); }, 1800);
    } else {
      status.className = 'feedback-status err';
      status.textContent = (res && res.error) || 'Couldn’t send right now. Try again in a moment.';
    }
  } catch (err) {
    status.className = 'feedback-status err';
    status.textContent = (err && err.message) || 'Couldn’t send right now. Try again in a moment.';
  } finally {
    feedbackSending = false;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send feedback';
  }
});


