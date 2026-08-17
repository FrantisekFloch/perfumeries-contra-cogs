// Smoke test — proves the zero-dependency test harness works and core modules import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION } from '../src/lib/version.js';

test('version module loads and exposes a semver-ish string', () => {
  assert.equal(typeof VERSION, 'string');
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});
