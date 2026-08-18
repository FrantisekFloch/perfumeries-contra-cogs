import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLang, getLang, t, LANGS } from '../src/lib/i18n.js';

test('default language is en', () => {
  setLang('en');
  assert.equal(getLang(), 'en');
  assert.equal(t('nav.finance'), 'Finance dashboard');
});

test('switching to sk returns Slovak strings', () => {
  setLang('sk');
  assert.equal(getLang(), 'sk');
  assert.equal(t('nav.finance'), 'Finančný dashboard');
  assert.equal(t('status.PartiallyReceived'), 'Čiastočne prijaté');
  setLang('en');
});

test('interpolation replaces {vars}', () => {
  setLang('en');
  const s = t('acc.summary', { open: 3, closed: 5, risk: '€10' });
  assert.match(s, /Open: 3/);
  assert.match(s, /Closed: 5/);
  assert.match(s, /€10/);
});

test('unknown key falls back to the key; LANGS lists both', () => {
  assert.equal(t('nope.nope'), 'nope.nope');
  assert.deepEqual(LANGS, ['en', 'sk']);
});

test('sk about contains the Slovak Contra COGS definition', () => {
  setLang('sk');
  assert.match(t('about.defBody'), /Contra COGS/);
  assert.match(t('about.defBody'), /dobropis/);
  setLang('en');
});
