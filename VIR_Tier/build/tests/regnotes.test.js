import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REG_NOTES, regNote } from '../src/lib/regnotes.js';
import { LeakageDriver } from '../src/lib/enums.js';

test('every leakage driver and timing key has a regulatory note', () => {
  for (const d of Object.values(LeakageDriver)) {
    assert.ok(REG_NOTES[d], `missing note for ${d}`);
    assert.ok(REG_NOTES[d].short && REG_NOTES[d].regulation && REG_NOTES[d].sourceLabel);
  }
  for (const k of ['CONTROL_PERIOD', 'VAT_TAX_POINT', 'VAT_DIVERGENCE']) {
    assert.ok(REG_NOTES[k], `missing note for ${k}`);
  }
});

test('unknown note key falls back gracefully', () => {
  const n = regNote('SOMETHING_UNKNOWN');
  assert.equal(n.short, 'SOMETHING_UNKNOWN');
});
