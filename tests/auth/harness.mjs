// Password-reset / email-confirmation compatibility harness.
//
// Runs an auth page's real inline script, with the real bundled supabase-js
// (public/pelav/auth/supabase-client.js), inside a minimal fake browser. All
// network traffic goes to an in-process fake Supabase Auth server: nothing
// reaches production, and no real token or key is used. The page's own
// SUPABASE_URL constant is only used as the fake server's host name.
//
// The fake server models the parts of Supabase Auth these pages use:
//   POST /auth/v1/verify        token_hash + type        -> session | 403
//   GET  /auth/v1/user          Bearer access token      -> user | 401
//   PUT  /auth/v1/user          Bearer + { password }    -> user | 401/422
//   POST /auth/v1/logout        Bearer                   -> 204
//   POST /auth/v1/token?grant_type=pkce                  -> 400 (no verifier)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const WEBSITE = fileURLToPath(new URL("../../", import.meta.url));
const BUNDLE = readFileSync(new URL("public/pelav/auth/supabase-client.js", `file:///${WEBSITE.replaceAll("\\", "/")}`), "utf8");

export const websitePage = (name) => readFileSync(`${WEBSITE}public/pelav/auth/${name}`, "utf8");

/** Fake tokens. Real-looking values are deliberately avoided. */
export const TOKENS = {
  recoveryHash: "th-recovery-valid",
  signupHash: "th-signup-valid",
  expiredHash: "th-expired",
  access: "at-valid",
  refresh: "rt-valid",
  revokedAccess: "at-revoked",
};

const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "angler@example.test" };
const session = () => ({
  access_token: TOKENS.access,
  refresh_token: TOKENS.refresh,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
});

/** Implicit-flow redirect fragment, as Supabase appends it with {{ .ConfirmationURL }}. */
export function implicitFragment(type, access = TOKENS.access) {
  const now = Math.floor(Date.now() / 1000);
  return `#access_token=${access}&expires_at=${now + 3600}&expires_in=3600&refresh_token=${TOKENS.refresh}&token_type=bearer&type=${type}`;
}

function fakeAuthServer(calls) {
  const json = (status, body) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    const auth = new Headers(init.headers).get("authorization") || "";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, query: url.search, body });
    const bearerOk = auth === `Bearer ${TOKENS.access}`;
    if (url.pathname === "/auth/v1/verify" && method === "POST") {
      const ok =
        (body?.token_hash === TOKENS.recoveryHash && body?.type === "recovery") ||
        (body?.token_hash === TOKENS.signupHash && ["signup", "email"].includes(body?.type));
      return ok ? json(200, session()) : json(403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
    }
    if (url.pathname === "/auth/v1/user" && method === "GET") {
      return bearerOk ? json(200, user) : json(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    }
    if (url.pathname === "/auth/v1/user" && method === "PUT") {
      if (!bearerOk) return json(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      if (calls.failUpdate) return json(422, { code: 422, error_code: "weak_password", msg: "Password is too weak" });
      return json(200, user);
    }
    if (url.pathname === "/auth/v1/logout" && method === "POST") {
      return calls.failLogout ? json(500, { code: 500, msg: "boom" }) : new Response(null, { status: 204 });
    }
    if (url.pathname === "/auth/v1/token") {
      return json(400, { code: 400, error_code: "bad_code_verifier", msg: "code challenge does not match" });
    }
    return json(404, { code: 404, msg: `fake server: no route ${method} ${url.pathname}` });
  };
}

class FakeElement {
  constructor(id, classes, tag) {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this._classes = new Set(classes);
    this.style = {};
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this._listeners = {};
    const self = this;
    this.classList = {
      add: (c) => self._classes.add(c),
      remove: (c) => self._classes.delete(c),
      contains: (c) => self._classes.has(c),
    };
  }
  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }
  async dispatch(type) {
    const event = { type, preventDefault() {} };
    for (const fn of this._listeners[type] || []) await fn(event);
  }
}

function fakeDocument(html) {
  const byId = new Map();
  const all = [];
  for (const m of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)) {
    const attrs = m[2];
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    const cls = /\bclass="([^"]+)"/.exec(attrs)?.[1];
    if (!id && !cls) continue;
    const el = new FakeElement(id ?? null, (cls ?? "").split(/\s+/).filter(Boolean), m[1]);
    all.push(el);
    if (id) byId.set(id, el);
  }
  const stepError = byId.get("step-error");
  const stepErrorParagraph = stepError ? new FakeElement(null, [], "p") : null;
  return {
    byId,
    getElementById: (id) => byId.get(id) ?? null,
    querySelectorAll: (sel) => {
      if (!sel.startsWith(".")) throw new Error(`fake DOM: unsupported selector ${sel}`);
      return all.filter((el) => el.classList.contains(sel.slice(1)));
    },
    querySelector: (sel) => {
      if (sel === "#step-error p") return stepErrorParagraph;
      throw new Error(`fake DOM: unsupported selector ${sel}`);
    },
    addEventListener() {},
    removeEventListener() {},
    visibilityState: "visible",
    stepErrorParagraph,
  };
}

/**
 * Loads `html` at `url` and runs its inline script.
 * options.client: "bundle" (the self-hosted PelavSupabase, as the website
 *   pages load it), "umd-global" (exposes the same pinned bundle as
 *   window.supabase, standing in for the old pages' CDN script), or "none"
 *   (the client script failed to load).
 */
export async function loadPage(html, url, { client = "bundle", failUpdate = false, failLogout = false, seed = {} } = {}) {
  const calls = [];
  calls.failUpdate = failUpdate;
  calls.failLogout = failLogout;
  const document = fakeDocument(html);
  const href = new URL(url);
  const location = {
    get href() { return href.href; },
    get search() { return href.search; },
    get hash() { return href.hash; },
    set hash(v) { href.hash = v; },
    get origin() { return href.origin; },
    get pathname() { return href.pathname; },
  };
  const storage = new Map(Object.entries(seed));
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    key: (i) => [...storage.keys()][i] ?? null,
    get length() { return storage.size; },
  };
  const timers = new Set();
  // Long page timeouts (the old pages wait 4 s) are shortened so tests stay fast.
  const setTimeoutFast = (fn, ms = 0, ...args) => {
    const t = setTimeout(() => { timers.delete(t); fn(...args); }, Math.min(ms, 150));
    timers.add(t);
    return t;
  };
  const context = {
    console,
    document,
    location,
    history: { state: null, replaceState: (_s, _t, u) => { const n = new URL(u, href); href.search = n.search; href.hash = n.hash; } },
    localStorage,
    navigator: { userAgent: "pelav-auth-harness" },
    fetch: fakeAuthServer(calls),
    Response, Headers, Request, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController,
    crypto: globalThis.crypto, atob, btoa, structuredClone, queueMicrotask,
    setTimeout: setTimeoutFast,
    clearTimeout: (t) => { timers.delete(t); clearTimeout(t); },
    // supabase-js builds a realtime client at createClient(); these pages never
    // open a channel, so any actual connection attempt is a test failure.
    WebSocket: class NoWebSocket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor() { throw new Error("harness: unexpected realtime connection"); }
    },
    setInterval: () => 0, // supabase-js auto-refresh ticker: not needed here
    clearInterval: () => {},
    addEventListener() {},
    removeEventListener() {},
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  if (client !== "none") {
    vm.runInContext(BUNDLE, context, { filename: "supabase-client.js" });
    if (client === "umd-global") context.supabase = context.PelavSupabase;
  }
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length !== 1) throw new Error(`expected one inline script, found ${scripts.length}`);
  vm.runInContext(scripts[0], context, { filename: href.pathname });
  const page = {
    calls,
    storage,
    document,
    location,
    activeSteps: () => [...document.byId.values()].filter((el) => el.classList.contains("step") && el.classList.contains("active")).map((el) => el.id),
    el: (id) => document.byId.get(id),
    settle: async (ms = 400) => {
      const end = Date.now() + ms;
      while (Date.now() < end) await new Promise((r) => setTimeout(r, 10));
    },
    submit: async (password, confirm = password) => {
      document.byId.get("password").value = password;
      document.byId.get("confirm").value = confirm;
      await document.byId.get("reset-form").dispatch("submit");
      await page.settle(150);
    },
    dispose: () => { for (const t of timers) clearTimeout(t); timers.clear(); },
  };
  await page.settle();
  return page;
}

/** supabase-js's default localStorage key for the page's project (sb-<ref>-auth-token). */
export function sessionStorageKey(html) {
  const url = /const SUPABASE_URL = '([^']+)'/.exec(html)?.[1];
  if (!url) throw new Error("page has no SUPABASE_URL constant");
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

/** A previously stored (stale) session, as supabase-js persists it. */
export const storedSession = () => JSON.stringify(session());

/** True if any storage value still holds the fake access token. */
export const holdsSession = (page) => [...page.storage.values()].some((v) => v.includes(TOKENS.access));
