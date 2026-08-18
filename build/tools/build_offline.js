// Builds a single self-contained HTML file that runs by double-clicking (no server,
// no git, no fetch). It inlines the CSS, bundles all ES modules into one inline
// <script type="module">, and embeds the sample data so the folder scan works offline.
//
// Run: node tools/build_offline.js  ->  offline/perfumeries_offline.html

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, '..');
const read = (p) => readFileSync(join(BUILD, p), 'utf8');

// 1) Embed data keyed by the URLs FolderSource requests (baseUrl './data/').
const manifest = JSON.parse(read('data/manifest.json'));
const DATA = { './data/manifest.json': read('data/manifest.json') };
for (const [cat, files] of Object.entries(manifest.inbox)) {
  for (const name of files) {
    const rel = `data/inbox/${cat}/${name}`;
    DATA[`./data/inbox/${cat}/${name}`] = read(rel);
  }
}

// 2) Bundle modules in dependency order (strip import/export).
const MODULES = [
  'src/lib/version.js', 'src/lib/i18n.js', 'src/lib/companies.js', 'src/lib/enums.js', 'src/lib/models.js', 'src/lib/xml.js',
  'src/lib/csv.js', 'src/lib/parsers.js', 'src/lib/store.js', 'src/lib/source.js',
  'src/lib/ingest.js', 'src/lib/matching.js', 'src/lib/gap.js', 'src/lib/timing.js',
  'src/lib/governance.js', 'src/lib/lifecycle.js', 'src/lib/analytics.js', 'src/lib/insights.js',
  'src/lib/inventory.js', 'src/lib/archive.js', 'src/lib/session.js', 'src/lib/forecast.js',
  'src/lib/pipeline.js', 'src/ui/charts.js', 'src/ui/dashboards.js', 'src/ui/tour.js',
  'src/ui/boot.js', 'src/app.js',
];
const strip = (src) => src
  .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];/g, '') // drop import statements
  .replace(/^\s*export\s+/gm, ''); // drop the export keyword

const bundle = MODULES.map((m) => `// ===== ${m} =====\n${strip(read(m))}`).join('\n\n');

// 3) Assemble the offline script: data + reader hook + bundle.
const script = `const DATA = ${JSON.stringify(DATA)};
globalThis.__PERFUMERIES_READ_TEXT__ = (url) => {
  if (!(url in DATA)) return Promise.reject(new Error('offline: missing ' + url));
  return Promise.resolve(DATA[url]);
};

${bundle}`;

// 4) Transform index.html: inline CSS + replace the module <script src> with our bundle.
const css = read('src/ui/styles.css');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${css}\n</style>`);
html = html.replace(/<script type="module" src="\.\/src\/app\.js"><\/script>/, `<script type="module">\n${script}\n</script>`);
html = html.replace('scaffold ready', 'offline build');

mkdirSync(join(BUILD, 'offline'), { recursive: true });
// Output name can be overridden (e.g. `node tools/build_offline.js perfumeries_v2_offline.html`).
const outName = process.argv[2] || 'perfumeries_offline.html';
const out = join(BUILD, 'offline', outName);
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB, ${Object.keys(DATA).length} embedded files)`);
