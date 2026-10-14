// V10 release-readiness checks on the built site (run `npm run build` first).
//   node --test "tests/**/*.test.mjs"
//
// These tests report; they never change content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST = join(ROOT, "dist");
const read = (...p) => readFileSync(join(DIST, ...p), "utf8");
const text = (html) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");

test("dist exists (run npm run build first)", () => {
  assert.ok(existsSync(join(DIST, "index.html")), "dist/index.html missing");
});

test("PELAV page does not advertise deferred V10 functionality as available", () => {
  const page = text(read("pelav", "index.html"));
  assert.doesNotMatch(page, /where the app offers one, a free trial/i);
  assert.doesNotMatch(page, /(start|get|try|claim)[^.]{0,40}free trial/i);
  assert.doesNotMatch(page, /(buy|purchase|subscribe)[^.]{0,30}premium/i);
  assert.doesNotMatch(page, /Adding or replacing a document/i);
  assert.doesNotMatch(page, /The Vault stores a copy/i);
  assert.match(page, /does not currently sell subscriptions or offer free trials/);
  // The Vault may appear only in its "not available" disclaimer.
  for (const m of page.matchAll(/[^.]*Licence Vault[^.]*\./g)) {
    assert.match(m[0], /not available in this version/i, m[0]);
  }
  // Likewise the Length-to-Weight Calculator (not in the V10 app; Terms §10).
  const mentions = [...page.matchAll(/[^.]*Length-to-Weight[^.]*\./gi)].map((m) => m[0]);
  assert.ok(mentions.length > 0, "Length-to-Weight disclaimer missing");
  for (const m of mentions) assert.match(m, /not available in this version/i, m);
});

test("PELAV page and Terms section 10 agree that V10 is free, with no Premium tier", () => {
  const terms = text(read("pelav", "legal", "terms-and-conditions.html"));
  assert.match(terms, /This version of the App is free\. It has no Premium tier and no Premium-only features/);
  assert.match(terms, /It does not sell subscriptions or offer free trials/);
  const page = text(read("pelav", "index.html"));
  assert.match(page, /This version of PELAV™ is free\./);
  assert.match(page, /There is no Premium tier/);
  for (const html of [page, terms]) {
    assert.doesNotMatch(html, /Premium currently includes/);
    assert.doesNotMatch(html, /Free vs Premium/);
    assert.doesNotMatch(html, /complimentary access/i);
  }
  const source = readFileSync(join(ROOT, "src", "data", "pelav.ts"), "utf8");
  assert.doesNotMatch(source, /premiumIncludes/);
});

test("generated legal pages state that Length-to-Weight is unavailable in V10", () => {
  const unavailable = /Length-to-Weight calculator is not available in this version of the App/;
  for (const page of ["terms-and-conditions", "safety-and-disclaimers", "data-sources"]) {
    assert.match(text(read("pelav", "legal", `${page}.html`)), unavailable, page);
  }
  assert.match(text(read("terms", "index.html")), /Length-to-Weight Calculator is not available in this version of the app/);
});

test("generated legal pages state the V10 Licence Vault deferral", () => {
  assert.match(text(read("pelav", "legal", "terms-and-conditions.html")), /Digital Fishing Licence Vault is not available in this version of the App/);
  assert.match(text(read("pelav", "legal", "safety-and-disclaimers.html")), /Licence Vault is not available in this version of the App/);
});

test("no legal-review marker, owner-input placeholder or draft banner is published", () => {
  // All nine V2 markers were resolved at source (assets/legal/ in the app
  // repository, pinned by test/compliance/legal_policy_compliance_test.dart).
  const count = (page, re) => (text(read("pelav", "legal", page)).match(re) || []).length;
  for (const page of ["privacy-policy.html", "terms-and-conditions.html", "safety-and-disclaimers.html", "data-sources.html", "account-deletion.html"]) {
    for (const re of [/Draft status/g, /LEGAL REVIEW REQUIRED/g, /OWNER INPUT REQUIRED/g]) {
      assert.equal(count(page, re), 0, `${page} ${re}`);
    }
  }
});

test("legal pages are generated (not hand-edited) and declare canonical URLs", () => {
  for (const page of ["privacy-policy", "terms-and-conditions", "safety-and-disclaimers", "data-sources", "account-deletion"]) {
    const html = read("pelav", "legal", `${page}.html`);
    assert.match(html, /<!-- GENERATED from assets\/legal\/ by tool\/legal\/build_legal_site\.mjs/, page);
    assert.match(html, /<meta name="pelav-legal-source-sha256" content="[0-9a-f]{64}">/, page);
    assert.ok(html.includes(`<link rel="canonical" href="https://continuumdataguardtech.co.za/pelav/legal/${page}.html">`), page);
  }
});

test("third-party attribution and safety notices are present", () => {
  const sources = text(read("pelav", "legal", "data-sources.html"));
  assert.match(sources, /Weather data by Open-Meteo\.com/);
  assert.match(sources, /Creative Commons Attribution 4\.0/);
  assert.match(sources, /Deutscher Wetterdienst/);
  assert.match(sources, /NO GUARANTEES ARE MADE ABOUT THE CORRECTNESS OF THIS TIDAL DATA/);
  assert.match(sources, /OpenStreetMap contributors/);
});

test("site Terms and Privacy pages link to every PELAV legal document", () => {
  const terms = read("terms", "index.html");
  for (const page of ["privacy-policy", "terms-and-conditions", "safety-and-disclaimers", "data-sources", "account-deletion"]) {
    assert.ok(terms.includes(`href="/pelav/legal/${page}.html"`), page);
  }
  const privacy = read("privacy", "index.html");
  assert.ok(privacy.includes('href="/pelav/legal/privacy-policy.html"'));
  assert.ok(privacy.includes('href="/pelav/legal/account-deletion.html"'));
});
