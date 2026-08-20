// Minimal, dependency-free XML parser + helpers.
// Sufficient for the tool's controlled, simple schema (elements, attributes, text,
// nesting, self-closing tags). No namespaces/CDATA/entities beyond the basics.
// Works in both Node (tests) and the browser.
// REUSED verbatim from the reconciliation tool — proven, no domain assumptions.

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
function decode(s) { return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]); }
export function encodeXml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Parse an XML string into a node tree:
 *   { tag, attrs: {}, children: [node...], text: '' }
 * Returns the root element node. Throws on malformed input.
 */
export function parseXml(input) {
  if (typeof input !== 'string' || input.trim() === '') throw new Error('XML parse error: empty input');
  const xml = input
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  let i = 0;
  const len = xml.length;

  function parseTag(raw) {
    const m = raw.match(/^([\w:-]+)/);
    if (!m) throw new Error(`XML parse error: bad tag "${raw}"`);
    const tag = m[1];
    const attrs = {};
    const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = attrRe.exec(raw))) attrs[a[1]] = decode(a[2]);
    return { tag, attrs };
  }

  function parseNodes() {
    const nodes = [];
    let text = '';
    while (i < len) {
      if (xml[i] === '<') {
        if (xml.startsWith('</', i)) {
          const end = xml.indexOf('>', i);
          if (end === -1) throw new Error('XML parse error: unterminated closing tag');
          const tag = xml.slice(i + 2, end).trim();
          i = end + 1;
          if (text.trim()) nodes.push({ text: decode(text.trim()) });
          return { nodes, closed: tag };
        }
        if (text.trim()) nodes.push({ text: decode(text.trim()) });
        text = '';
        const end = xml.indexOf('>', i);
        if (end === -1) throw new Error('XML parse error: unterminated tag');
        let raw = xml.slice(i + 1, end).trim();
        i = end + 1;
        let selfClose = false;
        if (raw.endsWith('/')) { selfClose = true; raw = raw.slice(0, -1).trim(); }
        const { tag, attrs } = parseTag(raw);
        const node = { tag, attrs, children: [], text: '' };
        if (!selfClose) {
          const res = parseNodes();
          if (res.closed !== tag) throw new Error(`XML parse error: mismatched tag </${res.closed}> for <${tag}>`);
          node.children = res.nodes.filter((n) => n.tag);
          node.text = res.nodes.filter((n) => n.text !== undefined && !n.tag).map((n) => n.text).join('');
        }
        nodes.push(node);
      } else {
        text += xml[i++];
      }
    }
    return { nodes };
  }

  const root = parseNodes().nodes.find((n) => n.tag);
  if (!root) throw new Error('XML parse error: no root element');
  return root;
}

// ---- accessors ----
export function child(node, tag) { return node.children.find((c) => c.tag === tag) || null; }
export function children(node, tag) { return node.children.filter((c) => c.tag === tag); }
export function childText(node, tag) { const c = child(node, tag); return c ? c.text : ''; }
export function attr(node, name) { return node && node.attrs ? (node.attrs[name] ?? null) : null; }
