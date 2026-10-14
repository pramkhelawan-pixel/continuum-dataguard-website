// Post-build guard for the static output in dist/ (runs after `astro build`).
// Fails the build if PELAV legal or auth pages are missing, an auth page loads
// a third-party script or loses its ownership marker, a secret-shaped value is
// present, an internal link or #anchor is broken, or a sitemap URL has no page.
//   node scripts/check-dist.mjs [distDir]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist'));
const SITE = 'https://continuumdataguardtech.co.za';

const LEGAL = [
  'index.html',
  'privacy-policy.html',
  'terms-and-conditions.html',
  'safety-and-disclaimers.html',
  'data-sources.html',
  'account-deletion.html',
];
const AUTH = ['confirm-email.html', 'reset-password.html', 'supabase-client.js'];
const OWNER = 'Source of truth: continuum_dataguard_website';
// Real key material only: a secret key value, or a three-part JWT. The bundled
// supabase-js contains the bare prefix strings, which are not matched.
const SECRET = /sb_secret_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;

const errors = [];
const fail = (msg) => errors.push(msg);
const rel = (p) => relative(DIST, p).split(sep).join('/');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Maps a site path (/a/b, /a/b/, /a/b.html) to the file that would serve it. */
function resolveSitePath(pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  const base = join(DIST, clean);
  const candidates = pathname.endsWith('/')
    ? [join(base, 'index.html')]
    : [base, `${base}.html`, join(base, 'index.html')];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

const ids = new Map();
function idsOf(file) {
  if (!ids.has(file)) {
    ids.set(file, new Set([...readFileSync(file, 'utf8').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])));
  }
  return ids.get(file);
}

if (!existsSync(DIST)) {
  console.error(`check-dist: ${DIST} not found; run astro build first.`);
  process.exit(1);
}

for (const page of LEGAL) {
  if (!existsSync(join(DIST, 'pelav', 'legal', page))) fail(`missing pelav/legal/${page}`);
}
for (const file of AUTH) {
  if (!existsSync(join(DIST, 'pelav', 'auth', file))) fail(`missing pelav/auth/${file}`);
}
for (const page of AUTH.filter((f) => f.endsWith('.html'))) {
  const path = join(DIST, 'pelav', 'auth', page);
  if (!existsSync(path)) continue;
  const html = readFileSync(path, 'utf8');
  if (!html.includes(OWNER)) fail(`pelav/auth/${page}: ownership marker missing`);
  if (!html.includes('<meta name="robots" content="noindex">')) fail(`pelav/auth/${page}: noindex missing`);
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) {
    if (m[1] !== '/pelav/auth/supabase-client.js') fail(`pelav/auth/${page}: unexpected script ${m[1]}`);
  }
}

// Inbound links (the previously deployed /pelav/ page, external pages) use these.
const TERMS = join(DIST, 'terms', 'index.html');
for (const id of ['marine-fishing-disclaimer', 'licence-vault-disclaimer', 'length-to-weight-disclaimer']) {
  if (!existsSync(TERMS) || !idsOf(TERMS).has(id)) fail(`terms/index.html: missing anchor #${id}`);
}

const files = walk(DIST);
for (const file of files.filter((f) => /\.(html|js|css|xml|txt|json)$/.test(f))) {
  if (SECRET.test(readFileSync(file, 'utf8'))) fail(`${rel(file)}: contains a secret-shaped value`);
}

for (const file of files.filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  const pageUrl = new URL(`/${rel(file)}`, SITE);
  for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const raw = m[1].replaceAll('&amp;', '&');
    if (/^(mailto:|tel:|data:|javascript:)/i.test(raw)) continue;
    const url = new URL(raw, pageUrl);
    if (url.origin !== SITE) continue;
    const target = url.pathname === pageUrl.pathname && raw.startsWith('#') ? file : resolveSitePath(url.pathname);
    if (!target) {
      fail(`${rel(file)}: broken link ${raw}`);
      continue;
    }
    if (url.hash && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(url.hash.slice(1)))) {
      fail(`${rel(file)}: missing anchor ${raw}`);
    }
  }
}

const sitemap = join(DIST, 'sitemap.xml');
if (!existsSync(sitemap)) fail('missing sitemap.xml');
else {
  for (const m of readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = new URL(m[1]);
    if (url.origin !== SITE) fail(`sitemap: foreign URL ${m[1]}`);
    else if (!resolveSitePath(url.pathname)) fail(`sitemap: no page for ${m[1]}`);
  }
}

if (errors.length) {
  console.error(`check-dist: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-dist: OK (${files.length} files checked)`);
