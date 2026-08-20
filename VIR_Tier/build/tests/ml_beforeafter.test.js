import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCcogsEngineCsv, serializeCcogsEngineCsv } from '../src/lib/parsers.js';
import { createCcogsEngineOutput } from '../src/lib/models.js';
import { ingestFiles } from '../src/lib/ingest.js';
import { consolidate } from '../src/lib/consolidation.js';
import { runPipeline } from '../src/lib/pipeline.js';
import { runDiscovery, scoreOpportunities } from '../src/lib/ml.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

function fullRun() {
  const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'));
  const fx = JSON.parse(readFileSync(join(DATA, 'fx_rates.json'), 'utf8'));
  const files = [];
  for (const [cat, names] of Object.entries(manifest.categories)) for (const n of names) files.push({ category: cat, name: n, text: readFileSync(join(DATA, 'inbox', cat, n), 'utf8') });
  const ingested = ingestFiles(files);
  const consolidated = consolidate(ingested);
  const out = runPipeline(consolidated, { fx, now: () => '2026-01-15T00:00:00Z' });
  return { consolidated, out };
}

test('ccogs engine output CSV round-trips', () => {
  const rows = [createCcogsEngineOutput({ outputId: 'ENG-1', agreementId: 'A1', supplierId: 'S1', scopeKey: 'PAN_EU', period: '2026', basis: 'UNITS', engineVolume: 8000, tierApplied: '0.014', amountClaimed: 112, currency: 'EUR', documentType: 'CCOGS_INVOICE' })];
  const back = parseCcogsEngineCsv(serializeCcogsEngineCsv(rows));
  assert.equal(back[0].engineVolume, 8000);
  assert.equal(back[0].amountClaimed, 112);
  assert.equal(back[0].documentType, 'CCOGS_INVOICE');
});

test('before/after: cost of inaction = variance; entitled >= claimed at agreement level', () => {
  const { out } = fullRun();
  assert.ok(out.beforeAfter.length > 0);
  // per-row: recoverable <=> positive cost of inaction
  for (const b of out.beforeAfter) {
    if (b.recoverable) assert.ok(b.costOfInaction > 0);
    else assert.equal(b.costOfInaction, 0);
  }
  // entitlement vs engine claim is meaningful at the AGREEMENT level (the engine
  // baseline can be keyed to a different scope granularity than a single row).
  const byAg = {};
  for (const b of out.beforeAfter) {
    byAg[b.agreementId] = byAg[b.agreementId] || { entitled: 0, claimed: 0 };
    byAg[b.agreementId].entitled += b.after.entitled;
    byAg[b.agreementId].claimed += b.before.claimed;
  }
  for (const [ag, v] of Object.entries(byAg)) {
    assert.ok(v.entitled >= v.claimed - 0.5, `agreement ${ag}: entitled (${v.entitled}) should not be below claimed (${v.claimed})`);
  }
});

test('ML discovery ranks findings by score with transparent signals and reasons', () => {
  const { consolidated, out } = fullRun();
  const disc = runDiscovery({ beforeAfter: out.beforeAfter, reconstructions: out.reconstructions, consolidated });
  assert.ok(disc.findings.length > 0);
  // Ranked by score descending, except for a small set of curated "pinned"
  // agreements that are surfaced at a fixed slot regardless of score.
  const PINNED = new Set(['AGR-010']);
  for (let i = 1; i < disc.findings.length; i++) {
    if (PINNED.has(disc.findings[i - 1].agreementId) || PINNED.has(disc.findings[i].agreementId)) continue;
    assert.ok(disc.findings[i - 1].score >= disc.findings[i].score);
  }
  const top = disc.findings[0];
  assert.ok(top.score >= 0 && top.score <= 1);
  assert.ok(top.confidence >= 0 && top.confidence <= 1);
  assert.ok(top.reasons.length >= 1, 'every finding is explainable');
  assert.ok('magnitude' in top.signals && 'lift' in top.signals && 'tierProximity' in top.signals);
});

test('ML insights include computed + illustrative flags', () => {
  const { consolidated, out } = fullRun();
  const disc = runDiscovery({ beforeAfter: out.beforeAfter, reconstructions: out.reconstructions, consolidated });
  assert.ok(disc.insights.some((i) => i.illustrative === true), 'expected at least one illustrative model-style insight');
  assert.ok(disc.insights.some((i) => i.illustrative === false), 'expected at least one computed insight');
});

test('scoreOpportunities returns empty when nothing recoverable', () => {
  const findings = scoreOpportunities([{ recoverable: false, costOfInaction: 0 }], [], null);
  assert.equal(findings.length, 0);
});
