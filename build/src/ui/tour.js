// Guided "walk me through" demo. An animated pointer glides to each target, a
// spotlight ring highlights it, a click pulse fires, and a caption explains the step.
// Special steps:
//   { intro: true, text }                      — centered welcome window (no target)
//   { selector, text, before?, satellites? }   — highlight one element; optional
//        satellites: [{ selector, text, dir }] render small arrow-tip banners pointing
//        at several parts of the screen at once (dir: 'up'|'down'|'left'|'right').
// `before` runs first (e.g. switch tab) so the target exists before we point at it.

export function startTour(steps, labels = { next: 'Next', skip: 'Skip', done: 'Done', start: 'Start tour' }) {
  let i = 0;
  const overlay = document.createElement('div'); overlay.className = 'tour-overlay';
  const ring = document.createElement('div'); ring.className = 'tour-ring'; ring.setAttribute('aria-hidden', 'true');
  const pointer = document.createElement('div'); pointer.className = 'tour-pointer'; pointer.setAttribute('aria-hidden', 'true');
  const box = document.createElement('div'); box.className = 'tour-box';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-live', 'polite');
  const satLayer = document.createElement('div'); satLayer.className = 'tour-satellites'; satLayer.setAttribute('aria-hidden', 'true');
  overlay.append(ring, pointer, satLayer, box);
  document.body.appendChild(overlay);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
    else if (e.key === 'Enter') { const nx = box.querySelector('.tour-next'); if (nx) { e.preventDefault(); nx.click(); } }
  };
  const cleanup = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
  document.addEventListener('keydown', onKey);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function positionTo(el) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 + window.scrollX;
    const cy = r.top + r.height / 2 + window.scrollY;
    pointer.style.transform = `translate(${cx}px, ${cy}px)`;
    ring.style.left = `${r.left + window.scrollX}px`;
    ring.style.top = `${r.top + window.scrollY}px`;
    ring.style.width = `${r.width}px`;
    ring.style.height = `${r.height}px`;
    ring.style.opacity = '1';
    const boxTop = r.bottom + window.scrollY + 14;
    box.style.left = `${clamp(r.left + window.scrollX, 12, window.innerWidth - 352)}px`;
    box.style.top = `${boxTop}px`;
    box.style.transform = '';
    pointer.classList.remove('click'); void pointer.offsetWidth; pointer.classList.add('click');
  }

  function centerBox() {
    ring.style.opacity = '0';
    pointer.style.opacity = '0';
    box.style.left = '50%';
    box.style.top = '42%';
    box.style.transform = 'translate(-50%, -50%)';
  }

  // Place small arrow-tip banners next to several targets at once.
  function renderSatellites(sats = []) {
    satLayer.innerHTML = '';
    sats.forEach((s) => {
      const el = document.querySelector(s.selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dir = s.dir || 'up';
      const tip = document.createElement('div');
      tip.className = `tour-tip tip-${dir}`;
      tip.innerHTML = `<span class="tour-tip-arrow"></span><span class="tour-tip-tx">${s.text}</span>`;
      let left = r.left + window.scrollX;
      let top = r.top + window.scrollY;
      const W = 220;
      if (dir === 'up') { top = r.bottom + window.scrollY + 8; left = clamp(left, 8, window.innerWidth - W - 8); }
      else if (dir === 'down') { top = r.top + window.scrollY - 8; left = clamp(left, 8, window.innerWidth - W - 8); }
      else if (dir === 'left') { left = r.right + window.scrollX + 10; top = r.top + window.scrollY; }
      else { left = clamp(r.left + window.scrollX - W - 10, 8, window.innerWidth - W - 8); top = r.top + window.scrollY; }
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
      // fade/slide in with a slight stagger
      tip.style.animationDelay = `${Math.random() * 180}ms`;
      satLayer.appendChild(tip);
    });
  }

  async function show() {
    const step = steps[i];
    satLayer.innerHTML = '';
    if (step.before) { try { step.before(); } catch { /* ignore */ } }
    await wait(160);

    const last = i === steps.length - 1;
    const nextLabel = last ? labels.done : labels.next;

    if (step.intro) {
      centerBox();
      box.innerHTML = `<h4 class="tour-h">${step.title || ''}</h4><p>${step.text}</p><div class="tour-actions">
        <button class="tour-skip">${labels.skip}</button>
        <button class="tour-next">${labels.start || labels.next}</button></div>`;
    } else {
      const el = document.querySelector(step.selector) || document.body;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* ignore */ }
      await wait(240);
      pointer.style.opacity = '1';
      positionTo(el);
      box.innerHTML = `<p>${step.text}</p><div class="tour-actions">
        <button class="tour-skip">${labels.skip}</button>
        <button class="tour-next">${nextLabel}</button></div>`;
      if (step.satellites) { await wait(180); renderSatellites(step.satellites); }
    }

    const nextBtn = box.querySelector('.tour-next');
    nextBtn.onclick = () => { i += 1; if (i >= steps.length) cleanup(); else show(); };
    box.querySelector('.tour-skip').onclick = cleanup;
    try { nextBtn.focus(); } catch { /* ignore */ }
  }

  show();
  return { stop: cleanup };
}
