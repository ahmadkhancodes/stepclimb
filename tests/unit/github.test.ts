import { createHmac, generateKeyPairSync, createVerify } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db";
import { appJwt } from "@/lib/github/api";
import { convertManifestCode, hasAppCredentials, loadAppCredentials, saveAppCredentials } from "@/lib/github/app-store";
import { createFixtureApi, FIXTURE_INSTALLATION_ID, FIXTURE_LOGIN, FIXTURE_REPOS, fixtureInstallationPayload } from "@/lib/github/fixtures";
import { loadHangar, serviceBulletin } from "@/lib/github/hangar";
import { APP_EVENTS, APP_PERMISSIONS, buildManifest, makeState, manifestFormAction, verifyState } from "@/lib/github/manifest";
import { buildAppReport, latestScan, scanRepo } from "@/lib/github/scan";
import { applyGithubEvent, claimInstallations, repoDocId, syncInstallation, type RepoDoc } from "@/lib/github/sync";
import { processWebhook, verifySignature } from "@/lib/github/webhook";
import { detectApp } from "@/lib/engine/detect";
import { loadRecipes } from "@/lib/engine/recipes";
import { join } from "node:path";

const KEY = "unit-test-encryption-key-123456";
const TODAY = new Date("2026-11-05T00:00:00Z");
const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("webhook signature", () => {
  const body = JSON.stringify({ zen: "x" });
  it("accepts a valid signature", async () => expect(await verifySignature("s3cret", body, sign("s3cret", body))).toBe(true));
  it("rejects wrong secret, tampered body, missing or malformed header", async () => {
    expect(await verifySignature("other", body, sign("s3cret", body))).toBe(false);
    expect(await verifySignature("s3cret", body + " ", sign("s3cret", body))).toBe(false);
    expect(await verifySignature("s3cret", body, null)).toBe(false);
    expect(await verifySignature("s3cret", body, "sha1=abc")).toBe(false);
    expect(await verifySignature("", body, sign("", body))).toBe(false);
  });
});

describe("processWebhook", () => {
  let db: Db;
  beforeEach(() => { db = createMemoryDb("stepclimb"); });
  const send = (event: string, payload: unknown, delivery = "d1", secret = "hook") => {
    const raw = JSON.stringify(payload);
    return processWebhook(db, { secret, raw, signature: sign(secret, raw), event, delivery });
  };
  it("401 on bad signature and stores nothing", async () => {
    const raw = JSON.stringify(fixtureInstallationPayload());
    const r = await processWebhook(db, { secret: "hook", raw, signature: sign("nope", raw), event: "installation", delivery: "x" });
    expect(r.status).toBe(401);
    expect(await db.docs.find("installations")).toHaveLength(0);
  });
  it("applies an installation event once and flags a sync; a replay is a duplicate", async () => {
    const r = await send("installation", fixtureInstallationPayload());
    expect(r).toMatchObject({ status: 200, syncInstallationId: FIXTURE_INSTALLATION_ID });
    expect(await db.docs.find("installations")).toHaveLength(1);
    const again = await send("installation", fixtureInstallationPayload());
    expect(again.body).toMatchObject({ duplicate: true });
  });
  it("ignores unrelated events (acknowledged, not applied)", async () => {
    expect((await send("push", { ref: "refs/heads/main" }, "d2")).body).toMatchObject({ ignored: true });
  });
  it("400 on missing headers or bad json", async () => {
    expect((await processWebhook(db, { secret: "hook", raw: "{}", signature: sign("hook", "{}"), event: null, delivery: null })).status).toBe(400);
    expect((await processWebhook(db, { secret: "hook", raw: "nope", signature: sign("hook", "nope"), event: "push", delivery: "d3" })).status).toBe(400);
  });
});

describe("manifest builder", () => {
  const m = buildManifest("https://stepclimb.buffersoltech.com/");
  it("carries ARCHITECTURE permissions and events", () => {
    expect(m.default_permissions).toEqual(APP_PERMISSIONS);
    expect(m.default_permissions).toEqual({ contents: "write", pull_requests: "write", checks: "write", metadata: "read" });
    expect(m.default_events).toEqual([...APP_EVENTS]);
    expect(m.default_events).toEqual(["pull_request", "push", "issue_comment", "check_run"]);
  });
  it("derives webhook, callback and setup URLs from the origin without a double slash", () => {
    expect(m.hook_attributes.url).toBe("https://stepclimb.buffersoltech.com/api/github/webhook");
    expect(m.redirect_url).toBe("https://stepclimb.buffersoltech.com/api/github/manifest/callback");
    expect(m.callback_urls).toEqual(["https://stepclimb.buffersoltech.com/api/auth/callback/github"]);
    expect(m.setup_url).toBe("https://stepclimb.buffersoltech.com/api/github/setup");
    expect(m.public).toBe(true);
  });
  it("posts to github.com, org form only for valid logins", () => {
    expect(manifestFormAction("s")).toBe("https://github.com/settings/apps/new?state=s");
    expect(manifestFormAction("s", "acme-co")).toBe("https://github.com/organizations/acme-co/settings/apps/new?state=s");
    expect(manifestFormAction("s", "../evil")).toBe("https://github.com/settings/apps/new?state=s");
  });
  it("state is signed, expires and rejects tampering", async () => {
    const st = await makeState("k", 1_000);
    expect(await verifyState("k", st, 2_000)).toBe(true);
    expect(await verifyState("other", st, 2_000)).toBe(false);
    expect(await verifyState("k", st, 1_000 + 31 * 60_000)).toBe(false);
    expect(await verifyState("k", st.replace(/.$/, "0") === st ? st + "0" : st.replace(/.$/, "0"), 2_000)).toBe(false);
    expect(await verifyState("k", null)).toBe(false);
  });
});

describe("encrypted credential storage", () => {
  const conv = { id: 42, slug: "stepclimb-by-buffersol", name: "Stepclimb", html_url: "https://github.com/apps/stepclimb-by-buffersol", client_id: "Iv1.abc", client_secret: "cs-secret", webhook_secret: "wh-secret", pem: "-----BEGIN RSA PRIVATE KEY-----\nxx\n-----END RSA PRIVATE KEY-----" };
  it("round trips and never stores plaintext", async () => {
    const t = await encryptSecret("hello", KEY);
    expect(t.startsWith("v1.")).toBe(true);
    expect(t).not.toContain("hello");
    expect(await decryptSecret(t, KEY)).toBe("hello");
    await expect(decryptSecret(t, "a-different-key-1234567890")).rejects.toThrow();
    await expect(encryptSecret("x", "short")).rejects.toThrow();
  });
  it("saves once, encrypted; second save is refused", async () => {
    const db = createMemoryDb("stepclimb");
    expect(await saveAppCredentials(db, conv, KEY)).toBe(true);
    expect(await saveAppCredentials(db, { ...conv, id: 43 }, KEY)).toBe(false);
    const raw = JSON.stringify(await db.docs.get("github_app", "primary"));
    for (const secret of ["cs-secret", "wh-secret", "BEGIN RSA", "Iv1.abc"]) expect(raw).not.toContain(secret);
    expect(await hasAppCredentials(db)).toMatchObject({ slug: conv.slug });
    expect(await loadAppCredentials(db, KEY)).toMatchObject({ appId: "42", clientId: "Iv1.abc", clientSecret: "cs-secret", webhookSecret: "wh-secret", privateKeyPem: conv.pem });
  });
  it("manifest conversion uses the injected fetch and validates the answer", async () => {
    const calls: string[] = [];
    const ok = (async (u: string) => { calls.push(u); return new Response(JSON.stringify(conv)); }) as unknown as typeof fetch;
    expect((await convertManifestCode("abcdef123456", ok)).id).toBe(42);
    expect(calls[0]).toBe("https://api.github.com/app-manifests/abcdef123456/conversions");
    await expect(convertManifestCode("../x", ok)).rejects.toThrow("bad_code");
    await expect(convertManifestCode("abcdef123456", (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch)).rejects.toThrow();
    await expect(convertManifestCode("abcdef123456", (async () => new Response("{}")) as unknown as typeof fetch)).rejects.toThrow("conversion_incomplete");
  });
  it("signs a verifiable RS256 app JWT", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const jwt = appJwt("42", privateKey, 1_700_000_000);
    const [h, b, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(b!, "base64url").toString())).toMatchObject({ iss: "42", exp: 1_700_000_540 });
    expect(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(s!, "base64url"))).toBe(true);
  });
});

describe("installation and repository sync", () => {
  let db: Db;
  beforeEach(() => { db = createMemoryDb("stepclimb"); });

  it("syncs repos from the API, is idempotent, and drops repos GitHub no longer lists", async () => {
    await applyGithubEvent(db, "installation", fixtureInstallationPayload());
    const api = createFixtureApi();
    expect(await syncInstallation(db, api, FIXTURE_INSTALLATION_ID)).toEqual({ added: FIXTURE_REPOS.length, removed: 0, total: FIXTURE_REPOS.length });
    expect(await syncInstallation(db, api, FIXTURE_INSTALLATION_ID)).toMatchObject({ added: 0, removed: 0 });
    expect(await db.docs.find("repos")).toHaveLength(FIXTURE_REPOS.length);
    const fewer = createFixtureApi(FIXTURE_REPOS.slice(0, 2));
    expect(await syncInstallation(db, fewer, FIXTURE_INSTALLATION_ID)).toMatchObject({ removed: FIXTURE_REPOS.length - 2, total: 2 });
    expect(await db.docs.find("repos")).toHaveLength(2);
  });

  it("installation_repositories adds and removes", async () => {
    await applyGithubEvent(db, "installation", fixtureInstallationPayload());
    const add = await applyGithubEvent(db, "installation_repositories", { action: "added", installation: fixtureInstallationPayload().installation, repositories_added: [{ id: 1, full_name: "a/one" }, { id: 2, full_name: "a/two" }] });
    expect(add?.needsSync).toBe(true);
    expect(await db.docs.find("repos")).toHaveLength(2);
    await applyGithubEvent(db, "installation_repositories", { action: "removed", installation: fixtureInstallationPayload().installation, repositories_removed: [{ id: 1, full_name: "a/one" }] });
    expect((await db.docs.find<RepoDoc>("repos")).map((r) => r.fullName)).toEqual(["a/two"]);
  });

  it("suspend, unsuspend and delete", async () => {
    const inst = fixtureInstallationPayload().installation;
    await applyGithubEvent(db, "installation", { action: "created", installation: inst });
    await applyGithubEvent(db, "installation", { action: "suspend", installation: inst });
    expect((await db.docs.get<{ suspendedAt: Date | null }>("installations", FIXTURE_INSTALLATION_ID))?.suspendedAt).toBeInstanceOf(Date);
    await applyGithubEvent(db, "installation", { action: "unsuspend", installation: inst });
    expect((await db.docs.get<{ suspendedAt: Date | null }>("installations", FIXTURE_INSTALLATION_ID))?.suspendedAt).toBeNull();
    await syncInstallation(db, createFixtureApi(), FIXTURE_INSTALLATION_ID);
    await applyGithubEvent(db, "installation", { action: "deleted", installation: inst });
    expect(await db.docs.find("installations")).toHaveLength(0);
    expect(await db.docs.find("repos")).toHaveLength(0);
  });

  it("claims what GitHub lists for the user, and never takes another org's installation", async () => {
    await applyGithubEvent(db, "installation", fixtureInstallationPayload());
    await syncInstallation(db, createFixtureApi(), FIXTURE_INSTALLATION_ID);
    expect(await claimInstallations(db, "org-x", { githubLogin: "someone-else" })).toEqual([]);
    // an organisation install is never claimed by a login match alone
    expect(await claimInstallations(db, "org-x", { githubLogin: FIXTURE_LOGIN })).toEqual([]);
    expect(await claimInstallations(db, "org-a", { githubLogin: FIXTURE_LOGIN, visibleIds: [FIXTURE_INSTALLATION_ID] })).toEqual([FIXTURE_INSTALLATION_ID]);
    expect((await db.docs.find<RepoDoc>("repos", { accountId: "org-a" })).length).toBe(FIXTURE_REPOS.length);
    expect(await claimInstallations(db, "org-b", { installationId: FIXTURE_INSTALLATION_ID, githubLogin: FIXTURE_LOGIN })).toEqual([]);
  });

  it("refuses an explicit id the user cannot see on GitHub, even right after install (P0-1)", async () => {
    await applyGithubEvent(db, "installation", fixtureInstallationPayload());
    expect(await claimInstallations(db, "org-z", { installationId: FIXTURE_INSTALLATION_ID })).toEqual([]);
    expect(await claimInstallations(db, "org-z", { installationId: FIXTURE_INSTALLATION_ID, githubLogin: "attacker", visibleIds: ["123"] })).toEqual([]);
    expect(await claimInstallations(db, "org-z", { installationId: FIXTURE_INSTALLATION_ID, visibleIds: [FIXTURE_INSTALLATION_ID] })).toEqual([FIXTURE_INSTALLATION_ID]);
  });
});

describe("detection through the contents API (fixtures, no clone)", () => {
  it("detects each fixture repo", async () => {
    const api = createFixtureApi();
    const detect = async (full: string, dir = "") => {
      const f = (n: string) => api.getFile("1", full, dir ? `${dir}/${n}` : n, "main").then((v) => v ?? undefined);
      return detectApp({ path: dir, composerJson: await f("composer.json"), composerLock: await f("composer.lock"), packageJson: await f("package.json") });
    };
    expect(await detect(`${FIXTURE_LOGIN}/billing-portal`)).toMatchObject({ laravelMajor: 11, frontendStack: "livewire", testFramework: "pest", supported: true });
    expect(await detect(`${FIXTURE_LOGIN}/dispatch-api`)).toMatchObject({ laravelMajor: 10, frontendStack: "api_only", testFramework: "phpunit" });
    expect(await detect(`${FIXTURE_LOGIN}/clinic-booking`)).toMatchObject({ laravelMajor: 12, frontendStack: "inertia_react" });
    expect((await detect(`${FIXTURE_LOGIN}/marketing-site`)).isLaravel).toBe(false);
  });
});

describe("scan report and Hangar", () => {
  const recipes = loadRecipes(join(process.cwd(), "recipes"));
  let db: Db;
  beforeEach(async () => {
    db = createMemoryDb("stepclimb");
    await applyGithubEvent(db, "installation", fixtureInstallationPayload());
    await claimInstallations(db, "org-a", { githubLogin: FIXTURE_LOGIN, visibleIds: [FIXTURE_INSTALLATION_ID] });
    await syncInstallation(db, createFixtureApi(), FIXTURE_INSTALLATION_ID);
  });
  const repoByName = async (n: string) => (await db.docs.find<RepoDoc>("repos", { fullName: `${FIXTURE_LOGIN}/${n}` }))[0]!;

  it("Laravel 10 api app: three hops, effort L, ended support, recipes listed", async () => {
    const scan = await scanRepo(db, createFixtureApi(), await repoByName("dispatch-api"), { today: TODAY, recipes });
    const a = scan.report.apps[0]!;
    expect(a.behind).toBe(3);
    expect(scan.effortBand).toBe("L");
    expect(a.eol).toMatchObject({ state: "ended", securityEnd: "2025-02-04" });
    expect(a.hops.map((h) => `${h.from}>${h.to}`)).toEqual(["10>11", "11>12", "12>13"]);
    expect(a.hops.every((h) => h.recipes.length > 0 && !h.missing)).toBe(true);
    expect(scan.report.reads).toMatch(/composer\.json, composer\.lock and package\.json only/);
    expect(scan.report.calendar.find((c) => c.label === "Laravel 12")).toMatchObject({ securityEnd: "2027-02-24", state: "supported" });
  });

  it("Laravel 11 with private composer repo and no lock raises flags; two hops is M", async () => {
    const scan = await scanRepo(db, createFixtureApi(), await repoByName("storefront"), { today: TODAY, recipes });
    expect(scan.effortBand).toBe("M");
    expect(scan.riskFlags.join("|")).toMatch(/Private Composer repository/);
    expect(scan.riskFlags.join("|")).toMatch(/No test suite/);
    expect(scan.riskFlags.join("|")).toMatch(/composer\.lock missing/);
  });

  it("monorepo yields one app per composer.json; worst effort wins", async () => {
    const scan = await scanRepo(db, createFixtureApi(), await repoByName("monorepo"), { today: TODAY, recipes });
    expect(scan.report.apps.map((a) => a.path)).toEqual(["apps/admin", "apps/web"]);
    expect(scan.effortBand).toBe("M");
    expect(await db.docs.find("apps", { repoId: (await repoByName("monorepo")).id })).toHaveLength(2);
  });

  it("non Laravel repo has no apps and no effort", async () => {
    const scan = await scanRepo(db, createFixtureApi(), await repoByName("marketing-site"), { today: TODAY, recipes });
    expect(scan.report.apps).toEqual([]);
    expect(scan.effortBand).toBeNull();
  });

  it("buildAppReport marks an unsupported major and gives XL", () => {
    const app = detectApp({ path: "", composerJson: JSON.stringify({ require: { "laravel/framework": "^8.0" } }) });
    const r = buildAppReport(app, {}, TODAY, recipes);
    expect(r.effort).toBe("XL");
    expect(r.hops).toEqual([]);
    expect(r.riskFlags.join("|")).toMatch(/Not supported yet/);
  });

  it("latest scan wins and the Hangar lists scanned and unscanned airframes with a bulletin", async () => {
    const r = await repoByName("clinic-booking");
    await scanRepo(db, createFixtureApi(), r, { today: new Date("2026-11-01T00:00:00Z"), recipes });
    const s2 = await scanRepo(db, createFixtureApi(), r, { today: TODAY, recipes });
    expect((await latestScan(db, r.id))?.id).toBe(s2.id);
    await scanRepo(db, createFixtureApi(), await repoByName("dispatch-api"), { today: TODAY, recipes });
    const h = await loadHangar(db, "org-a");
    expect(h.repoCount).toBe(FIXTURE_REPOS.length);
    expect(h.rows.filter((x) => x.kind === "unscanned")).toHaveLength(FIXTURE_REPOS.length - 2);
    const b = serviceBulletin(h.rows);
    expect(b).toMatchObject({ tone: "soon", major: 12, securityEnd: "2027-02-24", days: 111, affected: 1 });
    expect((await loadHangar(db, "org-other")).rows).toEqual([]);
    expect(repoDocId("1", "a/b")).toBe("1:a/b");
  });

  it("bulletin falls back to ended majors and is null for an empty fleet", async () => {
    expect(serviceBulletin([])).toBeNull();
    await scanRepo(db, createFixtureApi(), await repoByName("dispatch-api"), { today: TODAY, recipes });
    expect(serviceBulletin((await loadHangar(db, "org-a")).rows)).toMatchObject({ tone: "ended", major: 10, affected: 1 });
  });
});
