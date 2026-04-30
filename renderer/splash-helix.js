/* ============================================================
   SpecParse — Splash helix animation + 007 link handler
   Extracted from the inline <script> so it obeys the
   script-src 'self' CSP. Algorithm is copied EXACTLY from
   Skyfall's splash.html — same constants, same coordinate
   system. If the visual feel differs from Skyfall, the bug
   is in CSS layout (splash sizing, wrap dimensions), not JS.
   ============================================================ */

(function () {
  const wrap = document.querySelector('.splash-helix-wrap');
  const group = wrap && wrap.querySelector('.splash-helix-lines');
  if (!group) return;

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NUM_LINES = prefersReducedMotion ? 40 : 78;
  const SEGMENTS = 14;
  const TILT = 14;
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

  let targetX = 50, targetY = 50;
  let smoothX = 50, smoothY = 50;
  let mouseActive = false;
  let lastMouseActivity = 0;

  window.addEventListener('mousemove', (e) => {
    const splash = document.getElementById('splashScreen');
    if (!splash || splash.classList.contains('fade-out')) return;
    const rect = wrap.getBoundingClientRect();
    targetX = ((e.clientX - rect.left) / rect.width) * 100;
    targetY = ((e.clientY - rect.top) / rect.height) * 100;
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
  requestAnimationFrame(animate);

  // Mark the splash "gone" once the fade-out transition completes
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
