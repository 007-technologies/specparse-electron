/* ============================================================
   SpecParse — Splash helix animation + 007 link handler
   Extracted from the inline <script> so it obeys the
   script-src 'self' CSP.

   v1.3 update: properly fixed the mouse-reactive bend that was
   non-responsive under tall/narrow viewports.

   Root cause of the original bug:
     The SVG uses preserveAspectRatio="xMidYMid slice", which
     scales the 100x100 viewBox UP to fill the wrap div, cropping
     whichever dimension overflows. Under a tall narrow viewport
     (DevTools docked, narrow window), the visible viewBox
     horizontally was only the middle portion of the wrap, but
     the OLD mousemove handler mapped "mouse at left edge of
     wrap" to "viewBox.x = 0" via a naive percentage calculation:
         tX = ((e.clientX - rect.left) / rect.width) * 100;
     viewBox.x = 0 was actually OFF-SCREEN in that case, in the
     cropped portion left of the visible area. The bend force
     followed the cursor mathematically but landed somewhere
     the user couldn't see.

   Fix:
     Compute mouse position in viewBox space, accounting for the
     "slice" scale (max of width/height ratios) and the centered
     offset that comes from cropping. mouseToViewBox() does the
     transform. Now the bend lands exactly where the cursor is,
     regardless of viewport aspect ratio.

   Algorithm (lines, drift, bend force) is otherwise unchanged
   from the original — only the coordinate math was broken.
   ============================================================ */

(function () {
  const wrap = document.querySelector('.splash-helix-wrap');
  const svg = wrap && wrap.querySelector('.splash-helix');
  const group = wrap && wrap.querySelector('.splash-helix-lines');
  if (!group || !svg) return;

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NUM_LINES = prefersReducedMotion ? 40 : 78;
  const SEGMENTS = 14;
  const TILT = 14;
  // Must match the SVG's viewBox attribute in index.html.
  const VIEWBOX_W = 100;
  const VIEWBOX_H = 100;
  const linePaths = [];

  for (let i = 0; i < NUM_LINES; i++) {
    const path = document.createElementNS(SVG_NS, 'path');
    const t = i / (NUM_LINES - 1);
    const distFromCenter = Math.abs(t - 0.5) * 2;
    const sw = 0.26 - distFromCenter * 0.08;
    const so = 0.80 - distFromCenter * 0.15;
    path.setAttribute('stroke-width', sw.toFixed(3));
    path.setAttribute('stroke-opacity', so.toFixed(2));
    group.appendChild(path);
    linePaths.push({
      el: path,
      phase: i * 0.28,
      baseY: t * 120 - 10,
      wobble: 1.0,
      amp: 2.4,
    });
  }

  // Initialize cursor target + smoothed position to match the IDLE DRIFT
  // value at time = 0. The drift formula below is:
  //   targetX = 50 + Math.sin(t) * 30
  //   targetY = 50 + Math.cos(t * 0.9) * 22
  // At t = 0: sin(0) = 0, cos(0) = 1 → (50, 72).
  // Without this, smoothX/Y at (50, 50) takes ~1s of 0.05-factor smoothing
  // to converge to (50, 72), creating a visible "settle-in" wobble in the
  // first second after splash paints. Pre-aligning kills the wobble.
  let targetX = 50, targetY = 72;
  let smoothX = 50, smoothY = 72;
  let mouseActive = false;
  let lastMouseActivity = 0;

  // Convert client-space mouse coordinates into viewBox-space coordinates.
  // SVG renders 100x100 viewBox into the SVG's bounding rect using
  // xMidYMid slice — which means: scale UNIFORMLY by max(width/100, height/100)
  // (fill, crop). The shorter dimension overflows and is cropped at the edges
  // (centered).
  //
  // Worked example: rect.width = 400, rect.height = 600 (portrait, e.g. DevTools docked)
  //   scale       = max(400/100, 600/100) = 6
  //   displayedW  = 100 * 6 = 600 (overflows the 400px wide rect by 200px)
  //   offsetX     = (400 - 600) / 2 = -100 (visible viewBox starts at viewBox.x = 100/6 ≈ 16.7)
  //   Mouse at clientX = rect.left + 0 → vbX = (0 - (-100)) / 6 ≈ 16.7   (correct: leftmost VISIBLE viewBox pixel)
  //   Mouse at clientX = rect.left + 200 → vbX = (200 - (-100)) / 6 = 50  (correct: center)
  //   Mouse at clientX = rect.left + 400 → vbX = (400 - (-100)) / 6 ≈ 83.3 (correct: rightmost VISIBLE viewBox pixel)
  //
  // Old broken code returned 0 / 50 / 100 for those same positions — mapping
  // the user's visible left edge to viewBox.x=0, which was off-screen.
  function mouseToViewBox(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 50, y: 50 };
    const scale = Math.max(rect.width / VIEWBOX_W, rect.height / VIEWBOX_H);
    const displayedW = VIEWBOX_W * scale;
    const displayedH = VIEWBOX_H * scale;
    const offsetX = (rect.width - displayedW) / 2;
    const offsetY = (rect.height - displayedH) / 2;
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  }

  window.addEventListener('mousemove', (e) => {
    const splash = document.getElementById('splashScreen');
    if (!splash || splash.classList.contains('fade-out')) return;
    const vb = mouseToViewBox(e.clientX, e.clientY);
    targetX = vb.x;
    targetY = vb.y;
    mouseActive = true;
    lastMouseActivity = performance.now();
  }, { passive: true });

  function buildPath(line, time) {
    const drift = time * 0.00028;
    let d = '';
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS;
      const x = t * 128 - 14;
      let y = line.baseY + TILT * (t - 0.5);
      const wavePhase = line.phase + drift + s * 0.42 * line.wobble;
      y += Math.sin(wavePhase) * line.amp;
      y += Math.cos(wavePhase * 0.53 + line.phase * 0.3) * 0.8;
      const dx = x - smoothX;
      const dy = y - smoothY;
      const distSq = dx * dx + dy * dy;
      const falloff = 28 / (1 + distSq * 0.016);
      if (distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        y += (dy / dist) * falloff;
      }
      d += (s === 0 ? 'M' : ' L') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    return d;
  }

  function animate(time) {
    const splash = document.getElementById('splashScreen');
    if (!splash || splash.classList.contains('splash-gone')) return;
    if (!mouseActive || time - lastMouseActivity > 3000) {
      // Idle drift — gentle figure-eight when the cursor isn't moving.
      // Coordinates are already in viewBox space (0-100), so the drift
      // works correctly under any viewport aspect ratio.
      const t = time * 0.0002;
      targetX = 50 + Math.sin(t) * 30;
      targetY = 50 + Math.cos(t * 0.9) * 22;
    }
    smoothX += (targetX - smoothX) * 0.05;
    smoothY += (targetY - smoothY) * 0.05;
    for (let i = 0; i < linePaths.length; i++) {
      linePaths[i].el.setAttribute('d', buildPath(linePaths[i], time));
    }
    requestAnimationFrame(animate);
  }

  // Render the first frame synchronously BEFORE handing off to
  // requestAnimationFrame. Without this, the paths exist in the DOM but
  // have no `d` attribute on first paint — visually, the splash appears
  // with no helix for one frame (~16ms), then the helix pops in. Doing
  // a synchronous initial paint means the helix is fully drawn the
  // moment the splash becomes visible. Subsequent frames go through
  // requestAnimationFrame as usual.
  for (let i = 0; i < linePaths.length; i++) {
    linePaths[i].el.setAttribute('d', buildPath(linePaths[i], 0));
  }
  requestAnimationFrame(animate);

  // Mark the splash "gone" once the fade-out transition completes —
  // lets the animate loop exit cleanly instead of running forever in the
  // background after the user has clicked through.
  const splashEl = document.getElementById('splashScreen');
  if (splashEl) {
    const observer = new MutationObserver(function () {
      if (splashEl.classList.contains('fade-out')) {
        setTimeout(function () { splashEl.classList.add('splash-gone'); }, 700);
      }
    });
    observer.observe(splashEl, { attributes: true, attributeFilter: ['class'] });
  }
})();

/* ============================================================
   007 brand link — open https://007technologies.com externally
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  const brandLinks = document.querySelectorAll('#sidebarBrand007, #splashFooter007');
  brandLinks.forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      const url = el.getAttribute('href') || 'https://007technologies.com';
      if (window.specparse && window.specparse.openExternal) {
        window.specparse.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    });
  });
});
