// Animated "connecting to systems" boot loader. Shows a centered console card with
// a progress bar and a step log: the current step spins, completed steps get a ✓
// (and can swap to a "done" text). Returns a promise that resolves when finished.
// Steps: [{ text, done? }].

/**
 * Controller-based loader shown IMMEDIATELY (before data finishes loading), so the
 * page never sits blank. Drive it with step()/markDone()/finish() from the caller,
 * interleaving with async work.
 */
export function createBootLoader({ title = 'Connecting…' } = {}) {
  const ov = document.createElement('div');
  ov.className = 'boot-overlay';
  ov.innerHTML = `
    <div class="boot-card">
      <div class="boot-title"><span class="boot-dot"></span>${title}</div>
      <div class="boot-bar"><div class="boot-bar-fill" id="boot-fill"></div></div>
      <ul class="boot-log" id="boot-log"></ul>
    </div>`;
  document.body.appendChild(ov);
  const log = ov.querySelector('#boot-log');
  const fill = ov.querySelector('#boot-fill');
  let current = null;
  let pct = 6;
  fill.style.width = `${pct}%`;

  function finalize() {
    if (!current) return;
    current.classList.remove('active');
    current.classList.add('done');
    current.querySelector('.ic').textContent = '✓';
    const d = current.dataset.done;
    if (d) current.querySelector('.tx').textContent = d;
  }

  return {
    step(text) {
      finalize();
      const li = document.createElement('li');
      li.className = 'boot-step active';
      li.innerHTML = `<span class="ic spin"></span><span class="tx">${text}</span>`;
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
      current = li;
      pct = Math.min(92, pct + 9);
      fill.style.width = `${pct}%`;
    },
    markDone(doneText) { if (current) current.dataset.done = doneText; },
    finish() {
      finalize();
      fill.style.width = '100%';
      return new Promise((r) => setTimeout(() => { ov.remove(); r(); }, 350));
    },
  };
}

export function playBootLoader(steps, { title = 'Connecting…', perStepMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'boot-overlay';
    ov.innerHTML = `
      <div class="boot-card">
        <div class="boot-title"><span class="boot-dot"></span>${title}</div>
        <div class="boot-bar"><div class="boot-bar-fill" id="boot-fill"></div></div>
        <ul class="boot-log" id="boot-log"></ul>
      </div>`;
    document.body.appendChild(ov);
    const log = ov.querySelector('#boot-log');
    const fill = ov.querySelector('#boot-fill');
    let i = 0;

    function tick() {
      // finalize the previous step
      if (i > 0) {
        const prev = log.children[i - 1];
        prev.classList.remove('active');
        prev.classList.add('done');
        prev.querySelector('.ic').textContent = '✓';
        if (steps[i - 1].done) prev.querySelector('.tx').textContent = steps[i - 1].done;
      }
      if (i >= steps.length) {
        fill.style.width = '100%';
        setTimeout(() => { ov.remove(); resolve(); }, 350);
        return;
      }
      const li = document.createElement('li');
      li.className = 'boot-step active';
      li.innerHTML = `<span class="ic spin"></span><span class="tx">${steps[i].text}</span>`;
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
      fill.style.width = `${Math.round((i / steps.length) * 100)}%`;
      i += 1;
      setTimeout(tick, perStepMs);
    }
    tick();
  });
}
