// Hover tooltip layer for Regulatory_Note explanations (Req 12).
// Wrap any timing/driver value with `hintSpan(text, noteKey)`; a single floating
// tip element follows the mouse and shows the note's short + regulation + source.

import { regNote } from '../lib/regnotes.js';

let tipEl = null;
function ensureTip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip hidden';
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

/** Return an HTML string for a hinted value. */
export function hintSpan(text, noteKey) {
  return `<span class="hint" data-note="${noteKey}">${text}</span>`;
}

/** Attach delegated hover handlers once. */
export function initTooltips(root = document.body) {
  const tip = ensureTip();
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest('.hint');
    if (!el) return;
    const n = regNote(el.dataset.note);
    tip.innerHTML = `<div>${n.short}</div><div class="reg">${n.regulation}</div><div class="src">${n.sourceLabel}</div>`;
    tip.classList.remove('hidden');
    position(tip, e);
  });
  root.addEventListener('mousemove', (e) => {
    if (!tip.classList.contains('hidden') && e.target.closest('.hint')) position(tip, e);
  });
  root.addEventListener('mouseout', (e) => {
    if (e.target.closest('.hint')) tip.classList.add('hidden');
  });
}

function position(tip, e) {
  const pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = tip.getBoundingClientRect();
  if (x + r.width > window.innerWidth) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight) y = e.clientY - r.height - pad;
  tip.style.left = `${Math.max(4, x)}px`;
  tip.style.top = `${Math.max(4, y)}px`;
}
