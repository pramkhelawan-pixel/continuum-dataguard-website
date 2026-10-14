// Password-reset and email-confirmation compatibility matrix.
//   node --test tests/
//
// Link formats (Supabase Auth, as produced for these apps):
//   implicit  : {{ .ConfirmationURL }} template + implicit flow (V8, V9 and V10
//               all use AuthFlowType.implicit) -> redirect_to#access_token=...&type=...
//   token_hash: {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=... template
//
// Pages:
//   new = this repository's public/pelav/auth/*.html (V10 redirect target)
//   old = PELAV app repository public-site/*.html (V8/V9 redirect target, the
//         GitHub Pages copy). Read from $PELAV_APP_DIR, else ../project_neptune;
//         skipped if absent. The old pages load supabase-js@2 from a CDN; here
//         they run against the same pinned bundle (2.117.3) instead.
//
// SECURITY DECISION OD-B IS OPEN: the new reset page deliberately REJECTS
// implicit recovery links. The tests below pin that. Do not flip them until the
// owner explicitly approves accepting legacy implicit recovery links.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TOKENS, holdsSession, implicitFragment, loadPage, sessionStorageKey, storedSession, websitePage,
} from "./harness.mjs";

const NEW = "https://continuumdataguardtech.co.za/pelav/auth/";
const OLD = "https://old-host.invalid/project_neptune/"; // old host name not repeated here
const APP_DIR = process.env.PELAV_APP_DIR || join(fileURLToPath(new URL("../../", import.meta.url)), "..", "project_neptune");
const oldPage = (name) => readFileSync(join(APP_DIR, "public-site", name), "utf8");
const haveOld = existsSync(join(APP_DIR, "public-site", "reset-password.html"));

const verifyCalls = (p) => p.calls.filter((c) => c.path === "/auth/v1/verify");
const networkCalls = (p) => p.calls.length;

async function withPage(html, url, options, fn) {
  const page = await loadPage(html, url, options);
  try {
    await fn(page);
  } finally {
    page.dispose();
  }
}

// ---------------------------------------------------------------- new reset page

test("new reset: token_hash recovery link opens the password form", () =>
  withPage(websitePage("reset-password.html"), `${NEW}reset-password.html?token_hash=${TOKENS.recoveryHash}&type=recovery`, {}, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-form"]);
    assert.deepEqual(verifyCalls(p).map((c) => [c.body.token_hash, c.body.type]), [[TOKENS.recoveryHash, "recovery"]]);
  }));

test("new reset: expired/invalid token_hash shows the invalid-link step", () =>
  withPage(websitePage("reset-password.html"), `${NEW}reset-password.html?token_hash=${TOKENS.expiredHash}&type=recovery`, {}, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-invalid"]);
  }));

test("new reset: a signup token_hash is not accepted as a recovery link (no network call)", () =>
  withPage(websitePage("reset-password.html"), `${NEW}reset-password.html?token_hash=${TOKENS.signupHash}&type=signup`, {}, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-invalid"]);
    assert.equal(networkCalls(p), 0);
  }));

test("new reset [OD-B open]: implicit recovery link is REJECTED, without using or storing the tokens", () =>
  withPage(websitePage("reset-password.html"), `${NEW}reset-password.html${implicitFragment("recovery")}`, {}, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-invalid"]);
    assert.equal(networkCalls(p), 0);
    assert.equal(holdsSession(p), false);
  }));

test("new reset: error redirect, missing parameters and PKCE code all show the invalid-link step", async () => {
  for (const suffix of ["?error=access_denied&error_code=otp_expired", "#error=access_denied&error_code=otp_expired", "", "?code=abc"]) {
    await withPage(websitePage("reset-password.html"), `${NEW}reset-password.html${suffix}`, {}, async (p) => {
      assert.deepEqual(p.activeSteps(), ["step-invalid"], suffix);
      assert.ok(p.calls.every((c) => c.path !== "/auth/v1/user" || c.method !== "PUT"), suffix);
    });
  }
});

test("new reset: client script missing shows the initialisation-error step", () =>
  withPage(websitePage("reset-password.html"), `${NEW}reset-password.html?token_hash=${TOKENS.recoveryHash}&type=recovery`, { client: "none" }, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-error"]);
  }));

test("new reset: form validates, updates the password, then signs out and clears the session", () =>
  withPage(websitePage("reset-password.html"), `${NEW}reset-password.html?token_hash=${TOKENS.recoveryHash}&type=recovery`, {}, async (p) => {
    await p.submit("12345");
    assert.equal(p.el("password-error").style.display, "block");
    await p.submit("123456", "654321");
    assert.equal(p.el("confirm-error").style.display, "block");
    assert.equal(p.calls.filter((c) => c.method === "PUT").length, 0);

    await p.submit("correct horse battery");
    const puts = p.calls.filter((c) => c.method === "PUT" && c.path === "/auth/v1/user");
    assert.equal(puts.length, 1);
    assert.equal(puts[0].body.password, "correct horse battery");
    const order = p.calls.map((c) => `${c.method} ${c.path}`);
    assert.ok(order.indexOf("POST /auth/v1/logout") > order.indexOf("PUT /auth/v1/user"), order.join());
    assert.deepEqual(p.activeSteps(), ["step-success"]);
    assert.equal(holdsSession(p), false);
  }));

test("new reset: a rejected password update shows a generic error and allows retry", () =>
  withPage(websitePage("reset-password.html"), `${NEW}reset-password.html?token_hash=${TOKENS.recoveryHash}&type=recovery`, { failUpdate: true }, async (p) => {
    await p.submit("correct horse battery");
    assert.deepEqual(p.activeSteps(), ["step-form"]);
    assert.equal(p.el("form-error").style.display, "block");
    assert.doesNotMatch(p.el("form-error").textContent, /weak|Password is too/); // server message not echoed
    assert.equal(p.el("submit-btn").disabled, false);
  }));

test("new reset: a failed sign-out after a successful update is reported, not shown as success", () =>
  withPage(websitePage("reset-password.html"), `${NEW}reset-password.html?token_hash=${TOKENS.recoveryHash}&type=recovery`, { failLogout: true }, async (p) => {
    await p.submit("correct horse battery");
    assert.notDeepEqual(p.activeSteps(), ["step-success"]);
    assert.match(p.el("form-error").textContent, /could not safely sign out/);
    assert.equal(p.el("submit-btn").disabled, true);
  }));

// ---------------------------------------------------------------- new confirm page

test("new confirm: implicit signup link confirms, then signs out", () =>
  withPage(websitePage("confirm-email.html"), `${NEW}confirm-email.html${implicitFragment("signup")}`, {}, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-success"]);
    assert.ok(p.calls.some((c) => c.path === "/auth/v1/logout"));
    assert.equal(holdsSession(p), false);
  }));

test("new confirm: token_hash email/signup link confirms, then signs out", async () => {
  for (const type of ["email", "signup"]) {
    await withPage(websitePage("confirm-email.html"), `${NEW}confirm-email.html?token_hash=${TOKENS.signupHash}&type=${type}`, {}, async (p) => {
      assert.deepEqual(p.activeSteps(), ["step-success"], type);
      assert.equal(holdsSession(p), false, type);
    });
  }
});

test("new confirm: invalid token_hash, revoked implicit token, recovery link and no parameters are rejected", async () => {
  const cases = [
    `?token_hash=${TOKENS.expiredHash}&type=email`,
    implicitFragment("signup", TOKENS.revokedAccess),
    implicitFragment("recovery"),
    `?token_hash=${TOKENS.recoveryHash}&type=recovery`,
    "",
  ];
  for (const suffix of cases) {
    await withPage(websitePage("confirm-email.html"), `${NEW}confirm-email.html${suffix}`, {}, async (p) => {
      assert.deepEqual(p.activeSteps(), ["step-invalid"], suffix);
    });
  }
});

test("new confirm: a stale stored session never turns a rejected implicit link into success", async () => {
  const html = websitePage("confirm-email.html");
  const seed = { [sessionStorageKey(html)]: storedSession() };
  await withPage(html, `${NEW}confirm-email.html${implicitFragment("signup", TOKENS.revokedAccess)}`, { seed }, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-invalid"]);
  });
});

// ---------------------------------------------------------------- old V8/V9 pages

test("old V8/V9 reset: implicit recovery link opens the form (works today)", { skip: !haveOld && "app repo not found" }, () =>
  withPage(oldPage("reset-password.html"), `${OLD}reset-password.html${implicitFragment("recovery")}`, { client: "umd-global" }, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-form"]);
  }));

test("old V8/V9 reset: token_hash link FAILS (a project-wide template switch would break V8/V9)", { skip: !haveOld && "app repo not found" }, () =>
  withPage(oldPage("reset-password.html"), `${OLD}reset-password.html?token_hash=${TOKENS.recoveryHash}&type=recovery`, { client: "umd-global" }, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-invalid"]);
    assert.equal(verifyCalls(p).length, 0);
  }));

test("old V8/V9 reset: implicit tokens are trusted on the URL's type alone (any valid session + type=recovery)", { skip: !haveOld && "app repo not found" }, () =>
  // Documents the trade-off behind OD-B: supabase-js takes the recovery
  // signal from the URL fragment; only the token's validity is server-checked.
  withPage(oldPage("reset-password.html"), `${OLD}reset-password.html${implicitFragment("recovery")}`, { client: "umd-global" }, async (p) => {
    assert.ok(p.calls.some((c) => c.method === "GET" && c.path === "/auth/v1/user"));
    assert.equal(verifyCalls(p).length, 0);
    assert.deepEqual(p.activeSteps(), ["step-form"]);
  }));

test("old V8/V9 confirm: implicit signup link confirms; token_hash link fails", { skip: !haveOld && "app repo not found" }, async () => {
  await withPage(oldPage("confirm-email.html"), `${OLD}confirm-email.html${implicitFragment("signup")}`, { client: "umd-global" }, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-success"]);
  });
  await withPage(oldPage("confirm-email.html"), `${OLD}confirm-email.html?token_hash=${TOKENS.signupHash}&type=email`, { client: "umd-global" }, async (p) => {
    assert.deepEqual(p.activeSteps(), ["step-invalid"]);
  });
});
