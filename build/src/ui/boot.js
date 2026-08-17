// Animated "connecting to systems" boot loader. Shows a centered console card with
// a progress bar and a step log: the current step spins, completed steps get a ✓
// (and can swap to a "done" text). Returns a promise that resolves when finished.
// Steps: [{ text, done? }].

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
