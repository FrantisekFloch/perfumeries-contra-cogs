// Guided "walk me through" demo: an animated pointer glides to each target, a
// spotlight ring highlights it, a click pulse fires, and a caption explains the step.
// Steps: [{ selector, text, before? }]. `before` navigates (e.g., switch tab) first.

export function startTour(steps, labels = { next: 'Next', skip: 'Skip', done: 'Done' }) {
  let i = 0;
  const overlay = document.createElement('div'); overlay.className = 'tour-overlay';
  const ring = document.createElement('div'); ring.className = 'tour-ring';
  const pointer = document.createElement('div'); pointer.className = 'tour-pointer';
  const box = document.createElement('div'); box.className = 'tour-box';
  overlay.append(ring, pointer, box);
  document.body.appendChild(overlay);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cleanup = () => overlay.remove();

  function positionTo(el) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 + window.scrollX;
    const cy = r.top + r.height / 2 + window.scrollY;
    pointer.style.transform = `translate(${cx}px, ${cy}px)`;
    ring.style.left = `${r.left + window.scrollX}px`;
    ring.style.top = `${r.top + window.scrollY}px`;
    ring.style.width = `${r.width}px`;
    ring.style.height = `${r.height}px`;
    const boxTop = r.bottom + window.scrollY + 12;
    box.style.left = `${Math.max(12, Math.min(window.innerWidth - 340, r.left + window.scrollX))}px`;
    box.style.top = `${boxTop}px`;
    pointer.classList.remove('click'); void pointer.offsetWidth; pointer.classList.add('click');
  }

  async function show() {
    const step = steps[i];
    if (step.before) { try { step.before(); } catch { /* ignore */ } }
    await wait(140);
    const el = document.querySelector(step.selector) || document.body;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* ignore */ }
    await wait(220);
    positionTo(el);
    const last = i === steps.length - 1;
    box.innerHTML = `<p>${step.text}</p><div class="tour-actions">
      <button class="tour-skip">${labels.skip}</button>
      <button class="tour-next">${last ? labels.done : labels.next}</button></div>`;
    box.querySelector('.tour-next').onclick = () => { i += 1; if (i >= steps.length) cleanup(); else show(); };
    box.querySelector('.tour-skip').onclick = cleanup;
  }

  show();
  return { stop: cleanup };
}
