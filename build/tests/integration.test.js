import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runPipeline } from '../src/lib/pipeline.js';
import { createFolderSource } from '../src/lib/source.js';
import { StateStore, createMemoryBackend } from '../src/lib/store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, '..');
const DATA = join(BUILD, 'data') + '/';
const diskRead = (p) => readFileSync(p, 'utf8');

test('integration: manifest-based folder scan + full pipeline composes end to end', async () => {
  const store = new StateStore(createMemoryBackend(), 'int');
  // Folder-only sources (as a static host would use), reading via the manifest.
  const sources = [createFolderSource({ baseUrl: DATA, readText: diskRead })];
  const { ingest, portfolio, scanResults } = await runPipeline(store, sources);
  assert.equal(scanResults[0].status, 'Found');
  assert.ok(ingest.invoices.length >= 1);
  assert.ok(portfolio.length >= 1);
  assert.equal(portfolio.find((v) => v.invoiceNumber === 'INV-2026-0001').missingQty, 100);
});

test('static-demo readiness: manifest lists the four inbox categories', () => {
  const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'));
  assert.deepEqual(
    Object.keys(manifest.inbox).sort(),
    ['credit_notes', 'delivery_notes', 'invoices', 'storage_reports'],
  );
  // every listed file actually exists on disk
  for (const [cat, files] of Object.entries(manifest.inbox)) {
    for (const f of files) assert.ok(existsSync(join(DATA, 'inbox', cat, f)), `${cat}/${f} exists`);
  }
});

test('static-demo readiness: no build step / no dependencies and no secrets file', () => {
  const pkg = JSON.parse(readFileSync(join(BUILD, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined); // zero runtime deps -> no build/install needed
  assert.equal(pkg.type, 'module');
  assert.equal(existsSync(join(BUILD, '.env')), false); // no secrets file committed
});

test('static-demo readiness: index.html loads the ES module entry point', () => {
  const html = readFileSync(join(BUILD, 'index.html'), 'utf8');
  assert.match(html, /<script type="module" src="\.\/src\/app\.js">/);
});
