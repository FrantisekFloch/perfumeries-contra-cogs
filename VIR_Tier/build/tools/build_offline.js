// Build a single-file offline demo: inlines every ES module + CSS + all sample
// data into one HTML that runs by double-clicking (no server, no fetch, no git).
//
// Approach: emulate ES modules with a tiny in-page loader. Each module's source
// is stored verbatim (imports/exports rewritten to use a shared registry), so
// module-local names never collide across files. The data-source fetcher is
// replaced by an in-memory map of the bundled files.
//
// Run: node tools/build_offline.js  -> offline/vir_tier_offline.html

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DATA = join(ROOT, 'data');

const read = (p) => readFileSync(p, 'utf8');

// Every module by its resolved path key (matching import specifiers).
const MODULES = [
  'lib/version', 'lib/enums', 'lib/i18n', 'lib/periods', 'lib/money', 'lib/audit',
  'lib/store', 'lib/xml', 'lib/csv', 'lib/models', 'lib/parsers', 'lib/ingest',
  'lib/companies', 'lib/consolidation', 'lib/reconstruction', 'lib/rebate', 'lib/variance', 'lib/trueup', 'lib/pipeline',
  'lib/ml', 'lib/source', 'lib/approval', 'lib/injection', 'lib/regnotes', 'lib/audit_export',
  'ui/tooltip', 'ui/charts', 'ui/boot', 'ui/ingestflow', 'ui/doc', 'ui/stages', 'ui/dashboards', 'ui/consolidated', 'ui/audit',
  'app',
];

// Resolve an import specifier (relative to the importing module dir) to a key.
function resolveKey(fromKey, spec) {
  const fromDir = fromKey.includes('/') ? fromKey.slice(0, fromKey.lastIndexOf('/')) : '';
  let p = spec.replace(/\.js$/, '');
  const parts = (fromDir ? fromDir.split('/') : []);
  for (const seg of p.split('/')) {
    if (seg === '.') continue;
    else if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

// Rewrite a module's source so it registers into the shared registry `__M`.
// - `import { a, b } from './x.js'` -> `const { a, b } = __require('x-key');`
// - `import * as ns from './x.js'`  -> `const ns = __require('x-key');`
// - `export function foo`/`export const foo`/`export class foo` -> declare + register
// The whole body is wrapped in a function so module-local names are scoped.
function wrapModule(key, srcPath) {
  let code = read(srcPath);
  const exportsSet = new Set();

  // named imports
  code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, spec) => {
    const k = resolveKey(key, spec);
    const clean = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': ')).join(', ');
    return `const { ${clean} } = __require(${JSON.stringify(k)});`;
  });
  // namespace imports
  code = code.replace(/import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"];?/g, (_, ns, spec) => {
    const k = resolveKey(key, spec);
    return `const ${ns} = __require(${JSON.stringify(k)});`;
  });
  // side-effect imports (none expected) -> drop
  code = code.replace(/import\s*['"][^'"]+['"];?/g, '');

  // export [async] function/const/let/class NAME  (also generator function*)
  code = code.replace(/export\s+(async\s+)?(function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g, (_, asyncKw, kind, name) => {
    exportsSet.add(name);
    return `${asyncKw ? 'async ' : ''}${kind} ${name}`;
  });
  // export { a, b }
  code = code.replace(/export\s*\{([^}]+)\};?/g, (_, names) => {
    for (const n of names.split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) exportsSet.add(n);
    return '';
  });

  const registrations = [...exportsSet].map((n) => `  __M[${JSON.stringify(key)}].${n} = ${n};`).join('\n');
  return `__define(${JSON.stringify(key)}, function(){\n${code}\n${registrations}\n});`;
}

function collectData() {
  const manifest = JSON.parse(read(join(DATA, 'manifest.json')));
  const fx = existsSync(join(DATA, 'fx_rates.json')) ? JSON.parse(read(join(DATA, 'fx_rates.json'))) : null;
  const files = {};
  for (const [cat, names] of Object.entries(manifest.categories)) {
    for (const name of names) files[`${cat}/${name}`] = read(join(DATA, 'inbox', cat, name));
  }
  return { manifest, fx, files };
}

function main() {
  const data = collectData();
  const css = read(join(SRC, 'ui', 'styles.css'));
  // Inline SheetJS (styling fork: xlsx-js-style) so the offline Excel export works
  // with no network AND supports header fills / colored tables. Falls back to the
  // plain xlsx build if the styling vendor file is absent.
  const styleJsPath = join(ROOT, 'vendor', 'xlsx-js-style.js');
  const plainJsPath = join(ROOT, 'vendor', 'xlsx.full.min.js');
  const sheetjs = existsSync(styleJsPath) ? read(styleJsPath) : (existsSync(plainJsPath) ? read(plainJsPath) : '');

  const loader = `
const __M = {};
const __factories = {};
const __loaded = {};
function __define(key, fn){ __factories[key] = fn; __M[key] = {}; }
function __require(key){
  if (__loaded[key]) return __M[key];
  const fn = __factories[key];
  if (!fn) throw new Error('module not found: ' + key);
  __loaded[key] = true;
  fn();
  return __M[key];
}
const BUNDLE = ${JSON.stringify(data)};
`;

  const modulesJs = MODULES.map((key) => {
    const srcPath = join(SRC, key + '.js');
    return `// ==== ${key}.js ====\n` + wrapModule(key, srcPath);
  }).join('\n\n');

  // App patch: replace fetch loaders with the in-memory bundle, then boot.
  // We do this by injecting an override module that runs after 'app' defines,
  // but simpler: the app module already reads via folderFetcher/loadManifest/loadFx.
  // Bootstrap: expose the in-memory BUNDLE; the app's loaders detect it and read
  // from memory instead of fetching (no fragile source patching, no fetch shim).
  const bootstrap = `
window.__VIRT_BUNDLE = BUNDLE;
__require('app');
`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>CCOGS Reclaim Tool — Offline Demo</title>
<style>${css}</style>
<script>${sheetjs}</script></head>
<body>
<div id="login-screen" class="login-screen">
  <form id="login-card" class="login-card" autocomplete="off">
    <div class="login-brand">CCOGS<span class="tier"> Reclaim</span></div>
    <p class="login-sub" id="login-sub">Reclaim Tool</p>
    <label class="login-fld"><span id="login-user-label">User</span>
      <input id="login-user" type="text" autocomplete="username" /></label>
    <label class="login-fld"><span id="login-pass-label">Password</span>
      <input id="login-pass" type="password" autocomplete="current-password" /></label>
    <button class="login-btn" id="login-btn" type="submit">Sign in</button>
    <p class="login-err" id="login-err" hidden></p>
    <p class="login-note" id="login-note"></p>
  </form>
</div>
<div id="denied-screen" class="denied-screen" hidden>
  <div class="denied-card">
    <div class="denied-ico">⛔</div>
    <h2 id="denied-title">Access not granted</h2>
    <p id="denied-body">Sorry, you are not granted access to this tool.</p>
    <button class="login-btn" id="denied-back" type="button">Back to sign in</button>
  </div>
</div>
<div id="app" hidden></div>
<script>
${loader}
${modulesJs}
${bootstrap}
</script></body></html>`;

  const outDir = join(ROOT, 'offline');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'vir_tier_offline.html');
  writeFileSync(outPath, html);
  console.log(`Offline build: ${outPath} (${Math.round(html.length / 1024)} KB, ${Object.keys(data.files).length} data files bundled)`);
}

main();
