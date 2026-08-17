# Perfumeries — Build (demo app)

Vanilla JS + ES modules. **No build step.** `package.json` only configures ES modules and the zero-dependency test runner.

## Run the app locally
Opening `index.html` via `file://` blocks `fetch` of the sample files, so use the tiny local server:

```
node tools/serve.js
```
Then open http://localhost:8080 . (On GitHub Pages it just works — no server needed.)

## Run tests
Zero dependencies — uses Node's built-in test runner:

```
node --test
```

## Layout
```
build/
├── index.html            # app shell
├── package.json          # ES module config + test/serve scripts (no deps)
├── src/
│   ├── app.js            # entry point
│   ├── lib/              # pure logic: parsers + engines (added task by task)
│   └── ui/               # views + styles
├── tests/                # node:test unit/property/scenario tests
├── tools/serve.js        # zero-dep static server for local testing
└── data/
    ├── manifest.json     # file list for FolderSource (no dir listing on static hosts)
    ├── inbox/{invoices,delivery_notes,storage_reports,credit_notes}/
    ├── archive/
    └── samples/          # schema reference (SCHEMAS.md)
```

## Notes
- No secrets/credentials in this folder — safe for a public GitHub demo.
- Engines in `src/lib/` are pure functions, unit-tested in isolation before UI wiring.
- Data-source, persistence, and auth are isolated layers so a cloud version can replace them without touching engines or UI.
