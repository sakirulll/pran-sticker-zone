// End-to-end check of the Google Drive backup, run against a real PHP server and
// database (see sync.test.ts) with a stand-in for Google that this file starts.
// The server's private config must send Google's addresses to the stand-in:
//   'google_auth_url' => 'http://127.0.0.1:8899/auth',
//   'google_token_url' => 'http://127.0.0.1:8899/token',
//   'google_api_url' => 'http://127.0.0.1:8899',
//   'google_piece_units' => 1,
// and list admin@test.local under 'admin_emails'.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
import { gunzipSync } from "node:zlib";

const BASE = process.env.POS_TEST_URL;
const RUN = Date.now().toString(36);
const PORT = 8899;
const GOOGLE = `http://127.0.0.1:${PORT}`;
const PIECE = 262144;
const DAY = 86400_000;
// Not the "Sync" kind: the stand-in for Google lives in this process and has to keep answering.
const runFile = promisify(execFile);

// ---- A stand-in for Google: sign-in, and a Drive that remembers what it is sent.
type DriveFile = { id: string; name: string; parent: string; folder: boolean; createdTime: string; data: Buffer };
const drive = {
  files: new Map<string, DriveFile>(),
  uploads: new Map<string, { name: string; parent: string; total: number; parts: Buffer[]; pieces: number }>(),
  pieces: new Map<string, number>(),
  next: 1,
  finished: 0,
  add(name: string, parent: string, data: Buffer, created = Date.now(), folder = false) {
    const id = `file-${this.next++}`;
    this.files.set(id, { id, name, parent, folder, createdTime: new Date(created).toISOString(), data });
    return id;
  },
  inFolder: (parent: string) => [...drive.files.values()].filter((file) => file.parent === parent && !file.folder),
};

const read = (request: IncomingMessage) => new Promise<Buffer>((done) => {
  const parts: Buffer[] = [];
  request.on("data", (part) => parts.push(part));
  request.on("end", () => done(Buffer.concat(parts)));
});

const google = createServer(async (request, response) => {
  const url = new URL(request.url || "/", GOOGLE);
  const body = await read(request);
  const json = (status: number, value: unknown, headers: Record<string, string> = {}) => {
    response.writeHead(status, { "Content-Type": "application/json", ...headers });
    response.end(JSON.stringify(value));
  };

  if (url.pathname === "/token" && request.method === "POST") {
    const form = new URLSearchParams(body.toString());
    if (form.get("client_id") !== "client-1" || form.get("client_secret") !== "secret-1") return json(401, { error: "invalid_client" });
    if (form.get("grant_type") === "authorization_code" && form.get("code") === "good-code") return json(200, { access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
    if (form.get("grant_type") === "refresh_token" && form.get("refresh_token") === "refresh-1") return json(200, { access_token: "access-2", expires_in: 3600 });
    return json(400, { error: "invalid_grant", error_description: "Bad Request" });
  }

  // An upload in pieces carries no key of its own; the address it goes to is the secret.
  const session = /^\/upload\/session\/(.+)$/.exec(url.pathname);
  if (session && request.method === "PUT") {
    const upload = drive.uploads.get(session[1]);
    if (!upload) return json(404, { error: { message: "No such upload" } });
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(request.headers["content-range"]));
    const received = upload.parts.reduce((sum, part) => sum + part.length, 0);
    if (!range || +range[1] !== received || +range[2] - +range[1] + 1 !== body.length || +range[3] !== upload.total) return json(400, { error: { message: "Bad range" } });
    upload.parts.push(body);
    upload.pieces++;
    if (received + body.length < upload.total) {
      if (body.length % PIECE !== 0) return json(400, { error: { message: "A piece must be a multiple of 256 KB" } });
      response.writeHead(308, { Range: `bytes=0-${received + body.length - 1}` });
      return response.end();
    }
    const id = drive.add(upload.name, upload.parent, Buffer.concat(upload.parts));
    drive.pieces.set(upload.name, upload.pieces);
    drive.finished++;
    drive.uploads.delete(session[1]);
    return json(200, { id });
  }

  if (request.headers.authorization !== "Bearer access-2") return json(401, { error: { message: "Invalid Credentials" } });

  if (url.pathname === "/upload/drive/v3/files" && request.method === "POST" && url.searchParams.get("uploadType") === "resumable") {
    const details = JSON.parse(body.toString());
    const id = `upload-${drive.next++}`;
    drive.uploads.set(id, { name: details.name, parent: details.parents[0], total: +String(request.headers["x-upload-content-length"]), parts: [], pieces: 0 });
    response.writeHead(200, { Location: `${GOOGLE}/upload/session/${id}` });
    return response.end();
  }
  if (url.pathname === "/drive/v3/files" && request.method === "GET") {
    const query = url.searchParams.get("q") || "";
    const parent = /^'([^']+)' in parents/.exec(query);
    const found = parent
      ? drive.inFolder(parent[1]).sort((a, b) => b.createdTime.localeCompare(a.createdTime))
      : [...drive.files.values()].filter((file) => file.folder && query.includes(`name = '${file.name}'`));
    return json(200, { files: found.map((file) => ({ id: file.id, name: file.name, size: String(file.data.length), createdTime: file.createdTime })) });
  }
  if (url.pathname === "/drive/v3/files" && request.method === "POST") {
    const details = JSON.parse(body.toString());
    return json(200, { id: drive.add(details.name, "root", Buffer.alloc(0), Date.now(), true) });
  }
  const one = /^\/drive\/v3\/files\/(.+)$/.exec(url.pathname);
  if (one && request.method === "DELETE") {
    if (!drive.files.delete(decodeURIComponent(one[1]))) return json(404, { error: { message: "File not found" } });
    response.writeHead(204);
    return response.end();
  }
  return json(404, { error: { message: `Unknown: ${request.method} ${url.pathname}` } });
});

before(async () => { if (BASE) await new Promise<void>((ready) => google.listen(PORT, "127.0.0.1", ready)); });
after(async () => {
  if (!BASE) return;
  await new Promise((closed) => google.close(closed));
});

// ---- The site, as a browser would use it.
class Session {
  cookie = "";
  async raw(path: string, body?: unknown) {
    const response = await fetch(`${BASE}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      redirect: "manual",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookies = response.headers.getSetCookie().map((value) => value.split(";")[0]);
    if (cookies.length) this.cookie = cookies.join("; ");
    return response;
  }
  async call(path: string, body?: unknown) {
    const response = await this.raw(path, body);
    return { status: response.status, body: await response.json() as any };
  }
}

async function signedIn(email: string, shopName: string) {
  const session = new Session();
  const login = await session.call("auth.php?action=login", { email, password: "password123" });
  if (login.status !== 200) {
    const made = await session.call("auth.php?action=register", { name: "Drive Tester", shopName, email, password: "password123" });
    assert.equal(made.status, 201, JSON.stringify(made.body));
  }
  return session;
}

/** The files inside a .tar: [name, size]. Fails if the archive is not laid out properly. */
function tarEntries(archive: Buffer): [string, number][] {
  const entries: [string, number][] = [];
  let at = 0;
  while (at + 512 <= archive.length && archive[at] !== 0) {
    const header = archive.subarray(at, at + 512);
    assert.equal(header.subarray(257, 262).toString(), "ustar");
    const text = (from: number, length: number) => header.subarray(from, from + length).toString().replace(/\0.*$/s, "");
    const stored = parseInt(text(148, 8), 8);
    const sum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    assert.equal(stored, sum, "the header checksum is right");
    const size = parseInt(text(124, 12), 8);
    entries.push([text(0, 100), size]);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

test("only the platform admin can reach the Drive backup", { skip: !BASE }, async () => {
  const owner = await signedIn(`drive-owner-${RUN}@test.local`, "Drive owner shop");
  assert.equal((await owner.call("drive.php?action=status")).status, 403);
  assert.equal((await owner.call("drive.php?action=run", {})).status, 403);
  assert.equal((await new Session().call("drive.php?action=status")).status, 401);
});

test("the admin connects Google Drive, copies go up, and old ones are cleared out", { skip: !BASE }, async () => {
  const admin = await signedIn("admin@test.local", "Admin shop");
  await admin.call("drive.php?action=disconnect", {});

  assert.equal((await admin.call("drive.php?action=settings", { clientId: "", clientSecret: "secret-1" })).status, 400);
  assert.equal((await admin.call("drive.php?action=settings", { clientId: "client-1", clientSecret: "secret-1" })).status, 200);
  let status = (await admin.call("drive.php?action=status")).body;
  assert.equal(status.connected, false);
  assert.equal(status.hasSecret, true);
  assert.equal(status.redirectUri, `${BASE}/api/drive.php`);
  assert.ok(!JSON.stringify(status).includes("secret-1"), "the secret is never sent back");
  assert.equal((await admin.call("drive.php?action=run", {})).status, 400, "nothing to run before connecting");

  // Being sent to Google, and coming back.
  const connect = async () => {
    const sent = await admin.raw("drive.php?action=connect");
    assert.equal(sent.status, 302);
    const to = new URL(sent.headers.get("location")!);
    assert.equal(`${to.origin}${to.pathname}`, `${GOOGLE}/auth`);
    assert.equal(to.searchParams.get("client_id"), "client-1");
    assert.equal(to.searchParams.get("redirect_uri"), `${BASE}/api/drive.php`);
    assert.equal(to.searchParams.get("scope"), "https://www.googleapis.com/auth/drive.file");
    assert.equal(to.searchParams.get("access_type"), "offline");
    return to.searchParams.get("state")!;
  };
  const comeBack = async (query: string) => new URL((await admin.raw(`drive.php?${query}`)).headers.get("location")!).searchParams.get("drive");

  await connect();
  assert.equal(await comeBack("code=good-code&state=made-up"), "expired", "an answer nobody asked for is refused");
  assert.equal(await comeBack(`error=access_denied&state=${await connect()}`), "refused");
  assert.equal(await comeBack(`code=wrong-code&state=${await connect()}`), "failed");
  assert.equal((await admin.call("drive.php?action=status")).body.connected, false);
  assert.equal(await comeBack(`code=good-code&state=${await connect()}`), "connected");
  status = (await admin.call("drive.php?action=status")).body;
  assert.equal(status.connected, true);
  assert.equal(status.problem, "");
  assert.ok(!JSON.stringify(status).includes("refresh-1"), "the permission is never sent back");

  // The first copy: the database, and the pictures if there are any.
  const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
  let run = (await admin.call("drive.php?action=run", {})).body.result;
  assert.equal(run.ok, true, run.message);
  const folder = [...drive.files.values()].find((file) => file.folder)!;
  assert.equal(folder.name, "HishabPOS Backups");
  const database = drive.inFolder(folder.id).find((file) => file.name === `hishabpos-database-${today}.sql.gz`);
  assert.ok(database, `the database copy is there: ${drive.inFolder(folder.id).map((file) => file.name)}`);
  const sql = gunzipSync(database.data).toString();
  assert.match(sql, /CREATE TABLE `pos_users`/);
  assert.match(sql, /CREATE TABLE `pos_shop_records`|CREATE TABLE `pos_shops`/);
  assert.match(sql, /INSERT INTO `pos_users` VALUES/);
  assert.match(sql, /admin@test\.local/);
  assert.ok(!sql.includes("refresh-1") && !sql.includes("secret-1"), "the key to this Drive is not put on the Drive");
  assert.equal(drive.pieces.get(database.name), Math.ceil(database.data.length / PIECE), "sent in 256 KB pieces");

  const pictures = drive.inFolder(folder.id).find((file) => file.name === `hishabpos-pictures-${today}.tar.gz`);
  if (pictures) {
    const entries = tarEntries(gunzipSync(pictures.data));
    assert.ok(entries.length > 0);
    assert.ok(entries.every(([name]) => /^uploads\/[0-9a-f-]{36}\/.+/.test(name)), entries.map(([name]) => name).join(", "));
    assert.equal(drive.pieces.get(pictures.name), Math.ceil(pictures.data.length / PIECE));
  }

  // A month on: the old copy goes, a recent one stays, and today's is replaced, not doubled.
  const old = drive.add("hishabpos-database-old.sql.gz", folder.id, Buffer.from("old"), Date.now() - 31 * DAY);
  const recent = drive.add("hishabpos-database-recent.sql.gz", folder.id, Buffer.from("recent"), Date.now() - 29 * DAY);
  run = (await admin.call("drive.php?action=run", {})).body.result;
  assert.equal(run.ok, true, run.message);
  assert.equal(run.removed, 1);
  assert.equal(drive.files.has(old), false);
  assert.equal(drive.files.has(recent), true);
  assert.equal(drive.inFolder(folder.id).filter((file) => file.name === database.name).length, 1);
  assert.equal(drive.files.size, [...drive.files.values()].filter((file) => file.folder).length + drive.inFolder(folder.id).length);
  assert.equal([...drive.files.values()].filter((file) => file.folder).length, 1, "the folder is found again, not made twice");

  status = (await admin.call("drive.php?action=status")).body;
  assert.equal(status.lastOk, true);
  assert.deepEqual(status.files.map((file: any) => file.name).sort(), drive.inFolder(folder.id).map((file) => file.name).sort());

  // The daily run that happens by itself, and the cron job.
  const php = resolve(".devtools/php/php.exe");
  const config = resolve(".devtools/pos-config.php");
  if (existsSync(php) && existsSync(config)) {
    const env = { ...process.env, POS_CONFIG_FILE: config };
    const already = (await runFile(php, ["api/drive-cron.php"], { env })).stdout;
    assert.match(already, /already on Drive/);
    const before = drive.inFolder(folder.id).find((file) => file.name === database.name)!.id;
    const finished = drive.finished;
    const script = 'require "api/bootstrap.php"; require "api/drivebackup.php"; $p = db(); drive_meta_set($p, "attempt_day", ""); drive_backup_if_due($p); drive_backup_if_due($p); echo drive_meta($p, "last_result"), "|", drive_meta($p, "attempt_day");';
    const byItself = (await runFile(php, ["-r", script], { env })).stdout;
    assert.equal(byItself, `1 sent, 0 old removed|${today}`, "the database only, as the pictures went up today");
    const now = drive.inFolder(folder.id).find((file) => file.name === database.name)!.id;
    assert.notEqual(now, before, "today's copy was taken again");
    assert.equal(drive.finished, finished + 1, "and only once, though it was asked for twice");
  }

  // Google taking the permission away shows up as a problem, not a crash.
  await admin.call("drive.php?action=settings", { clientId: "client-1", clientSecret: "secret-1" });
  assert.equal((await admin.call("drive.php?action=status")).body.connected, false, "new credentials need a new connection");
  assert.equal((await admin.call("drive.php?action=run", {})).status, 400);
});
