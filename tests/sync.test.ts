// End-to-end checks for shop syncing, run against a real PHP server and database:
//   POS_TEST_URL=http://127.0.0.1:8081 node --test tests/
// Each run registers fresh accounts, so it never touches existing shops.

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShopData, chunkChanges, ShopSync, type Change, type RecordRow, type ShopData } from "../src/shopSync.ts";

const BASE = process.env.POS_TEST_URL;
const RUN = Date.now().toString(36);

/** One signed-in browser: keeps its own cookie, shop data and sync state. */
class Device {
  cookie = "";
  data: ShopData = {};
  sync!: ShopSync;
  owner = false;

  async call(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(`${BASE}/api/${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).filter((value) => !value.endsWith("=deleted"));
    if (setCookie.length) this.cookie = setCookie.join("; ");
    return { status: response.status, body: await response.json() as any };
  }

  async login(email: string, password = "password123") {
    const result = await this.call("auth.php?action=login", { email, password });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }

  async load(fallback?: ShopData) {
    const result = await this.call("shop.php");
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const rows = result.body.records as RecordRow[];
    this.owner = result.body.membership.owner;
    this.data = buildShopData(rows) ?? structuredClone(fallback ?? {});
    this.sync = new ShopSync(() => this.data, result.body.rev, rows);
  }

  /** What the app does on save and on its timer: send local changes, take in remote ones. */
  async save() {
    for (const batch of chunkChanges(this.sync.collectChanges())) {
      const result = await this.call("shop.php?action=sync", { since: this.sync.rev, changes: batch });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      this.sync.commit(batch as Change[], result.body.rev, result.body.remote);
    }
  }
}

const seed = (): ShopData => ({
  seq: 100,
  products: [
    { id: 20, name: "Bike Sticker", stock: 10, sell: 185 },
    { id: 21, name: "Tank Pad", stock: 4, sell: 145 },
  ],
  sales: [],
  roles: [
    { id: 41, name: "Admin", permissions: ["All permissions"] },
    { id: 42, name: "Cashier", permissions: ["Sales"] },
  ],
  settings: { taxRate: 0, notifications: {} },
  user: { name: "Owner", shop: "Test Shop" },
});

async function newShop(label: string) {
  const email = `${label}-${RUN}@test.local`;
  const owner = new Device();
  const result = await owner.call("auth.php?action=register", { name: "Owner", email, password: "password123" });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  await owner.load(seed());
  await owner.save();
  return { owner, email };
}

async function secondDevice(email: string) {
  const device = new Device();
  await device.login(email);
  await device.load();
  return device;
}

test("a new shop is stored and comes back identical, including empty lists", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("store");
  const again = await secondDevice(email);
  assert.deepEqual(again.data, owner.data);
  assert.deepEqual(again.data.sales, []);
  assert.deepEqual(again.sync.collectChanges(), [], "a freshly loaded shop has nothing to save");
});

test("a save sends only the records that changed", { skip: !BASE }, async () => {
  const { owner } = await newShop("delta");
  owner.data.products[1].sell = 150;
  const changes = owner.sync.collectChanges();
  assert.deepEqual(changes.map((change) => [change.c, change.id]), [["products", "21"]]);
});

test("list order survives: new records added at the front or the end stay there", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("order");
  owner.data.sales.unshift({ id: 501, inv: "A" });
  await owner.save();
  owner.data.sales.unshift({ id: 502, inv: "B" });
  owner.data.sales.push({ id: 503, inv: "C" });
  await owner.save();
  const again = await secondDevice(email);
  assert.deepEqual(again.data.sales.map((sale: any) => sale.id), [502, 501, 503]);
});

test("two devices selling at once: both sales are kept and stock counts both", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("race");
  const other = await secondDevice(email);

  owner.data.products[0].stock -= 2;
  owner.data.sales.unshift({ id: 601, items: [{ id: 20, qty: 2 }] });
  owner.data.seq++;
  other.data.products[0].stock -= 3;
  other.data.sales.unshift({ id: 602, items: [{ id: 20, qty: 3 }] });
  other.data.seq++;

  await owner.save();
  await other.save();
  await owner.save();

  for (const device of [owner, other, await secondDevice(email)]) {
    assert.equal(device.data.products[0].stock, 5);
    assert.deepEqual(device.data.sales.map((sale: any) => sale.id).sort(), [601, 602]);
    assert.equal(device.data.seq, 102);
  }
});

test("edits to different fields of one record are combined, and a price is not added up", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("merge");
  const other = await secondDevice(email);
  owner.data.products[0].name = "Bike Sticker XL";
  other.data.products[0].sell = 200;
  await owner.save();
  await other.save();
  await owner.save();
  for (const device of [owner, other]) {
    assert.deepEqual(device.data.products[0], { id: 20, name: "Bike Sticker XL", stock: 10, sell: 200 });
  }
});

test("a record changed here keeps the same object when a remote change arrives", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("identity");
  const other = await secondDevice(email);
  const held = other.data.products[0];
  owner.data.products[0].sell = 190;
  await owner.save();
  await other.save();
  assert.equal(other.data.products[0], held);
  assert.equal(held.sell, 190);
});

test("a delete reaches the other device", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("delete");
  const other = await secondDevice(email);
  owner.data.products = owner.data.products.filter((product: any) => product.id !== 21);
  await owner.save();
  await other.save();
  assert.deepEqual(other.data.products.map((product: any) => product.id), [20]);
  assert.deepEqual((await secondDevice(email)).data.products.map((product: any) => product.id), [20]);
});

test("staff cannot change roles or shop details, but can sell", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("staff");
  const staffEmail = `cashier-${email}`;
  const created = await owner.call("auth.php?action=create-member", { name: "Cashier", email: staffEmail, password: "password123", roleId: 42 });
  assert.equal(created.status, 200, JSON.stringify(created.body));

  const staff = await secondDevice(staffEmail);
  assert.equal(staff.owner, false);
  staff.data.roles[1].permissions = ["All permissions"];
  staff.data.roles.push({ id: 43, name: "Sneaky", permissions: ["All permissions"] });
  staff.data.user.shop = "Renamed by staff";
  staff.data.sales.unshift({ id: 701 });
  await staff.save();

  // The server's version comes straight back, undoing the refused changes on the staff device too.
  assert.deepEqual(staff.data.roles.map((role: any) => role.id), [41, 42]);
  assert.deepEqual(staff.data.roles[1].permissions, ["Sales"]);
  assert.equal(staff.data.user.shop, "Test Shop");

  const check = await secondDevice(email);
  assert.deepEqual(check.data.roles, seed().roles);
  assert.equal(check.data.user.shop, "Test Shop");
  assert.deepEqual(check.data.sales.map((sale: any) => sale.id), [701]);
});

test("staff cannot use a shop the owner has not set up", { skip: !BASE }, async () => {
  const email = `empty-${RUN}@test.local`;
  const owner = new Device();
  await owner.call("auth.php?action=register", { name: "Owner", email, password: "password123" });
  await owner.call("auth.php?action=create-member", { name: "Cashier", email: `cashier-${email}`, password: "password123", roleId: 42 });
  const staff = new Device();
  await staff.login(`cashier-${email}`);
  const result = await staff.call("shop.php?action=sync", { since: 0, changes: [{ c: "sales", id: "1", pos: 1, data: "{\"id\":1}" }] });
  assert.equal(result.status, 403);
});

test("a large shop is saved in several requests and loads back complete", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("large");
  for (let i = 0; i < 2500; i++) owner.data.sales.push({ id: 10000 + i, note: "x".repeat(200) });
  assert.ok(chunkChanges(owner.sync.collectChanges()).length > 1);
  await owner.save();
  const again = await secondDevice(email);
  assert.equal(again.data.sales.length, 2500);
  assert.deepEqual(again.data.sales.map((sale: any) => sale.id), owner.data.sales.map((sale: any) => sale.id));
});

test("someone who is not signed in gets nothing", { skip: !BASE }, async () => {
  const stranger = new Device();
  assert.equal((await stranger.call("shop.php")).status, 401);
  assert.equal((await stranger.call("shop.php?action=sync", { since: 0, changes: [] })).status, 401);
});

test("a daily backup is taken, and restoring it undoes later changes on every device", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("backup");
  // Opening the shop takes the day's backup once the reply has gone out; give it a moment.
  await owner.load();
  let backups: { name: string }[] = [];
  for (let attempt = 0; attempt < 20 && !backups.length; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    backups = (await owner.call("shop.php?action=backups")).body.backups;
  }
  assert.equal(backups.length, 1);
  assert.match(backups[0].name, /^\d{4}-\d{2}-\d{2}\.json\.gz$/);

  const other = await secondDevice(email);
  owner.data.products = [];
  owner.data.sales.unshift({ id: 801 });
  owner.data.user.shop = "Changed after backup";
  await owner.save();
  await other.save();
  assert.deepEqual(other.data.products, []);

  const restored = await owner.call("shop.php?action=restore", { name: backups[0].name });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  await other.save();
  const fresh = await secondDevice(email);
  for (const device of [other, fresh]) {
    assert.deepEqual(device.data.products, seed().products);
    assert.deepEqual(device.data.sales, []);
    assert.equal(device.data.user.shop, "Test Shop");
  }

  const after = (await owner.call("shop.php?action=backups")).body.backups as { name: string }[];
  assert.ok(after.some((backup) => backup.name.startsWith("before-restore-")), "the state before the restore is kept too");
});

test("backups belong to the owner only, and only real backup names are accepted", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("backupguard");
  await owner.call("auth.php?action=create-member", { name: "Cashier", email: `cashier-${email}`, password: "password123", roleId: 42 });
  const staff = await secondDevice(`cashier-${email}`);
  assert.equal((await staff.call("shop.php?action=backups")).status, 403);
  assert.equal((await staff.call("shop.php?action=restore", { name: "2026-01-01.json.gz" })).status, 403);

  assert.equal((await owner.call("shop.php?action=restore", { name: "../../pos-config.php" })).status, 400);
  assert.equal((await owner.call("shop.php?action=restore", { name: "2001-01-01.json.gz" })).status, 400);
  const made = await owner.call("shop.php?action=backup-now", {});
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const download = await fetch(`${BASE}/api/shop.php?action=backup-download&name=${made.body.backups[0].name}`, { headers: { Cookie: owner.cookie } });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/gzip");
});

test("work kept on the device while offline is sent later and combined with what others did", { skip: !BASE }, async () => {
  const { owner, email } = await newShop("offline");
  const other = await secondDevice(email);

  // What the app stores on the device: the last known server state and the shop with unsent changes.
  owner.data.products[0].stock -= 4;
  owner.data.sales.unshift({ id: 901, items: [{ id: 20, qty: 4 }] });
  const kept = structuredClone({ rev: owner.sync.rev, rows: owner.sync.exportRows(), data: owner.data });

  other.data.products[0].stock -= 1;
  other.data.sales.unshift({ id: 902, items: [{ id: 20, qty: 1 }] });
  await other.save();

  // The device is reopened later: it starts from its own copy, not the server's.
  const reopened = new Device();
  reopened.cookie = owner.cookie;
  reopened.data = kept.data;
  reopened.sync = ShopSync.restore(() => reopened.data, kept.rev, kept.rows);
  assert.equal(reopened.sync.collectChanges().length > 0, true, "the unsent changes are still there");
  await reopened.save();
  await other.save();

  for (const device of [reopened, other, await secondDevice(email)]) {
    assert.equal(device.data.products[0].stock, 5);
    assert.deepEqual(device.data.sales.map((sale: any) => sale.id).sort(), [901, 902]);
  }
  assert.deepEqual(reopened.sync.collectChanges(), []);
});
