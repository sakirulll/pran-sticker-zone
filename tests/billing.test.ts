// End-to-end checks for subscriptions and the platform admin, run against a real
// PHP server and database (see sync.test.ts). The server's private config must
// list admin@test.local under 'admin_emails'.

import assert from "node:assert/strict";
import { after, test } from "node:test";

const BASE = process.env.POS_TEST_URL;
const RUN = Date.now().toString(36);
const DAY = 86400;

class Session {
  cookie = "";
  async call(path: string, body?: unknown) {
    const response = await fetch(`${BASE}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookies = response.headers.getSetCookie().map((value) => value.split(";")[0]);
    if (cookies.length) this.cookie = cookies.join("; ");
    return { status: response.status, body: await response.json() as any };
  }
}

async function newOwner(label: string) {
  const session = new Session();
  const email = `${label}-${RUN}@test.local`;
  const result = await session.call("auth.php?action=register", { name: "Owner", shopName: `${label} shop`, email, password: "password123" });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  // A shop has to hold something before it can be synced by staff.
  const saved = await session.call("shop.php?action=sync", { since: 0, changes: [{ c: "_meta", id: "seq", pos: 0, data: "100" }] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return { session, email };
}

async function adminSession() {
  const session = new Session();
  const login = await session.call("auth.php?action=login", { email: "admin@test.local", password: "password123" });
  if (login.status !== 200) {
    const made = await session.call("auth.php?action=register", { name: "Platform Admin", shopName: "Admin shop", email: "admin@test.local", password: "password123" });
    assert.equal(made.status, 201, JSON.stringify(made.body));
  }
  return session;
}

const shopOf = async (admin: Session, email: string) =>
  (await admin.call("billing.php?action=admin-overview")).body.shops.find((shop: any) => shop.ownerEmail === email);
const canSave = async (session: Session) =>
  (await session.call("shop.php?action=sync", { since: 0, changes: [] })).status;

// Tests below change the platform-wide trial length; always put it back.
after(async () => {
  if (!BASE) return;
  const admin = await adminSession();
  await admin.call("billing.php?action=admin-settings", { price_monthly: 100, price_yearly: 999, trial_days: 14, verify_grace_days: 3, bkash_number: "", nagad_number: "", support_phone: "" });
});

test("a new shop starts on a free trial and the admin's own shop never expires", { skip: !BASE }, async () => {
  const admin = await adminSession();
  const { session } = await newOwner("trial");
  const status = (await session.call("billing.php?action=status")).body;
  assert.equal(status.subscription.state, "trial");
  assert.ok(status.subscription.secondsLeft > 13 * DAY && status.subscription.secondsLeft <= 14 * DAY);
  assert.deepEqual([status.settings.priceMonthly, status.settings.priceYearly], [100, 999]);
  assert.equal((await session.call("shop.php")).body.admin, false);

  const mine = await admin.call("shop.php");
  assert.equal(mine.body.subscription.state, "lifetime");
  assert.equal(mine.body.admin, true);
});

test("only the admin can use the admin panel", { skip: !BASE }, async () => {
  const { session } = await newOwner("notadmin");
  assert.equal((await session.call("billing.php?action=admin-overview")).status, 403);
  assert.equal((await session.call("billing.php?action=admin-extend", { shopId: "x", days: 30 })).status, 403);
  assert.equal((await session.call("billing.php?action=admin-settings", { price_monthly: 1, price_yearly: 1, trial_days: 999 })).status, 403);
  assert.equal((await new Session().call("billing.php?action=status")).status, 401);
});

test("a payment is checked, recorded once, and approving it extends the shop", { skip: !BASE }, async () => {
  const admin = await adminSession();
  const { session, email } = await newOwner("pay");
  const trx = `TRX${RUN.toUpperCase()}A`;

  assert.equal((await session.call("billing.php?action=submit", { plan: "weekly", method: "bkash", sender: "01700000000", trxId: trx })).status, 400);
  assert.equal((await session.call("billing.php?action=submit", { plan: "yearly", method: "bkash", sender: "123", trxId: trx })).status, 400);
  assert.equal((await session.call("billing.php?action=submit", { plan: "yearly", method: "bkash", sender: "01700000000", trxId: "!!" })).status, 400);
  assert.equal((await session.call("billing.php?action=submit", { plan: "yearly", method: "bkash", sender: "01700000000", trxId: trx })).status, 201);
  assert.equal((await session.call("billing.php?action=submit", { plan: "monthly", method: "nagad", sender: "01700000000", trxId: trx.toLowerCase() })).status, 409, "a Transaction ID cannot be used twice");

  const mine = (await session.call("billing.php?action=status")).body.payments;
  assert.deepEqual([mine.length, mine[0].status, mine[0].amount, mine[0].plan], [1, "pending", 999, "yearly"]);

  const pending = (await admin.call("billing.php?action=admin-overview")).body.payments.find((payment: any) => payment.trxId === trx);
  assert.equal(pending.ownerEmail, email);
  assert.equal((await admin.call("billing.php?action=admin-review", { id: pending.id, approve: true })).status, 200);
  assert.equal((await admin.call("billing.php?action=admin-review", { id: pending.id, approve: true })).status, 409, "a payment is only approved once");

  const after = (await session.call("billing.php?action=status")).body;
  assert.equal(after.subscription.state, "active");
  // A year on top of the unused trial, so paying early loses nothing.
  assert.ok(after.subscription.secondsLeft > (365 + 13) * DAY, String(after.subscription.secondsLeft / DAY));
  assert.equal(after.payments[0].status, "approved");
});

test("a rejected payment gives nothing, and staff cannot pay", { skip: !BASE }, async () => {
  const admin = await adminSession();
  const { session, email } = await newOwner("reject");
  const trx = `TRX${RUN.toUpperCase()}B`;
  await session.call("billing.php?action=submit", { plan: "monthly", method: "nagad", sender: "+8801700000000", trxId: trx });
  const pending = (await admin.call("billing.php?action=admin-overview")).body.payments.find((payment: any) => payment.trxId === trx);
  assert.equal((await admin.call("billing.php?action=admin-review", { id: pending.id, approve: false, note: "No such transaction" })).status, 200);
  const status = (await session.call("billing.php?action=status")).body;
  assert.equal(status.subscription.state, "trial");
  assert.deepEqual([status.payments[0].status, status.payments[0].note], ["rejected", "No such transaction"]);

  await session.call("auth.php?action=create-member", { name: "Cashier", email: `cashier-${email}`, password: "password123", roleId: 42 });
  const staff = new Session();
  await staff.call("auth.php?action=login", { email: `cashier-${email}`, password: "password123" });
  assert.equal((await staff.call("billing.php?action=submit", { plan: "monthly", method: "bkash", sender: "01700000000", trxId: `${trx}S` })).status, 403);
  assert.deepEqual((await staff.call("billing.php?action=status")).body.payments, []);
});

test("a suspended shop cannot save until it is restored", { skip: !BASE }, async () => {
  const admin = await adminSession();
  const { session, email } = await newOwner("suspend");
  const shop = await shopOf(admin, email);
  assert.equal(await canSave(session), 200);
  await admin.call("billing.php?action=admin-suspend", { shopId: shop.id, suspended: true });
  assert.equal((await session.call("billing.php?action=status")).body.subscription.state, "suspended");
  assert.equal(await canSave(session), 402);
  assert.equal((await session.call("shop.php")).status, 200, "the owner can still open the shop to see why");
  await admin.call("billing.php?action=admin-suspend", { shopId: shop.id, suspended: false });
  assert.equal(await canSave(session), 200);
});

test("when the trial is over the shop stops saving, and extra days bring it back", { skip: !BASE }, async () => {
  const admin = await adminSession();
  const { session, email } = await newOwner("expire");
  const settings = { price_monthly: 150, price_yearly: 1200, trial_days: 0, bkash_number: "01711111111", nagad_number: "", support_phone: "" };
  assert.equal((await admin.call("billing.php?action=admin-settings", { ...settings, trial_days: 999 })).status, 400);
  assert.equal((await admin.call("billing.php?action=admin-settings", settings)).status, 200);

  const expired = (await session.call("billing.php?action=status")).body;
  assert.equal(expired.subscription.state, "expired");
  assert.deepEqual([expired.settings.priceMonthly, expired.settings.bkashNumber], [150, "01711111111"]);
  assert.equal(await canSave(session), 402);
  assert.equal(await canSave(admin), 200, "the admin's own shop is not affected");

  const shop = await shopOf(admin, email);
  assert.equal((await admin.call("billing.php?action=admin-extend", { shopId: shop.id, days: 0 })).status, 400);
  assert.equal((await admin.call("billing.php?action=admin-extend", { shopId: shop.id, days: 30 })).status, 200);
  const extended = (await session.call("billing.php?action=status")).body.subscription;
  assert.equal(extended.state, "active");
  assert.ok(extended.secondsLeft > 29 * DAY && extended.secondsLeft <= 30 * DAY);
  assert.equal(await canSave(session), 200);
  // Put the platform settings back so later tests start from the defaults.
  await admin.call("billing.php?action=admin-settings", { ...settings, price_monthly: 100, price_yearly: 999, trial_days: 14, bkash_number: "" });
});

test("an owner who never confirms the email is stopped after the allowed days, until the admin confirms it", { skip: !BASE }, async () => {
  const admin = await adminSession();
  const { session, email } = await newOwner("unverified");
  assert.equal(await canSave(session), 200);
  const settings = { price_monthly: 100, price_yearly: 999, trial_days: 14, bkash_number: "", nagad_number: "", support_phone: "" };
  try {
    assert.equal((await admin.call("billing.php?action=admin-settings", { ...settings, verify_grace_days: 0 })).status, 200);
    const status = (await session.call("billing.php?action=status")).body.subscription;
    assert.deepEqual([status.state, status.emailVerified], ["unverified", false]);
    assert.equal(await canSave(session), 402);

    const shop = await shopOf(admin, email);
    assert.equal((await session.call("billing.php?action=admin-verify", { shopId: shop.id })).status, 403);
    assert.equal((await admin.call("billing.php?action=admin-verify", { shopId: shop.id })).status, 200);
    const after = (await session.call("billing.php?action=status")).body.subscription;
    assert.deepEqual([after.state, after.emailVerified], ["trial", true]);
    assert.equal(await canSave(session), 200);
  } finally {
    await admin.call("billing.php?action=admin-settings", { ...settings, verify_grace_days: 3 });
  }
});

test("prices and the support number can be read without logging in, and nothing else", { skip: !BASE }, async () => {
  const admin = await adminSession();
  await admin.call("billing.php?action=admin-settings", { price_monthly: 100, price_yearly: 999, trial_days: 14, verify_grace_days: 3, bkash_number: "01700000001", nagad_number: "", support_phone: "01700000002" });
  const seen = await new Session().call("contact.php");
  assert.equal(seen.status, 200);
  assert.deepEqual(seen.body, { priceMonthly: 100, priceYearly: 999, trialDays: 14, supportPhone: "01700000002" });
});
