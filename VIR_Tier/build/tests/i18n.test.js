import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, setLang, getLang, LANGS } from '../src/lib/i18n.js';

test('default language is en', () => {
  setLang('en');
  assert.equal(getLang(), 'en');
  assert.match(t('appTitle'), /CCOGS Reclaim Tool/);
});

test('four languages present incl. PL and CZ', () => {
  assert.deepEqual(LANGS.map((l) => l.code), ['en', 'sk', 'pl', 'cs']);
});

test('switching language returns localized strings', () => {
  setLang('sk'); assert.match(t('supplier'), /Dodávateľ/);
  setLang('pl'); assert.match(t('supplier'), /Dostawca/);
  setLang('cs'); assert.match(t('supplier'), /Dodavatel/);
  setLang('en');
});

test('interpolation replaces vars; unknown key falls back to key', () => {
  setLang('en');
  assert.equal(t('found', { count: 12 }), 'Found 12 documents');
  assert.equal(t('__nope__'), '__nope__');
});
