// End-to-end checks for accounts, run against a real PHP server and database:
//   POS_TEST_URL=http://127.0.0.1:8081 POS_TEST_MAIL_LOG=.devtools/mail.log npm test
// The server must be configured with 'mail_log' so reset emails land in that file.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const BASE = process.env.POS_TEST_URL;
const MAIL_LOG = process.env.POS_TEST_MAIL_LOG;
const RUN = Date.now().toString(36);

async function call(path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const cookies = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  return { status: response.status, body: await response.json() as any, cookie: cookies };
}

const register = (email: string) => call("auth.php?action=register", { name: "Reset Tester", email, password: "password123" });
const login = (email: string, password: string) => call("auth.php?action=login", { email, password });

/** The reset links emailed to an address, oldest first. */
function resetTokens(email: string): string[] {
  if (!MAIL_LOG || !existsSync(MAIL_LOG)) return [];
  return readFileSync(MAIL_LOG, "utf8").split("\n---\n")
    .filter((mail) => mail.includes(`To: ${email}\n`))
    .map((mail) => /\?reset=([0-9a-f]{64})/.exec(mail)?.[1])
    .filter((token): token is string => Boolean(token));
}

test("a reset link sets a new password, once", { skip: !BASE || !MAIL_LOG }, async () => {
  const email = `reset-${RUN}@test.local`;
  await register(email);
  assert.equal((await call("auth.php?action=request-reset", { email })).status, 200);
  const [token] = resetTokens(email);
  assert.ok(token, "the reset email carries a link");

  assert.equal((await call("auth.php?action=reset", { token, password: "short" })).status, 400);
  assert.equal((await call("auth.php?action=reset", { token, password: "new-password-1" })).status, 200);
  assert.equal((await login(email, "password123")).status, 401, "the old password stops working");
  assert.equal((await login(email, "new-password-1")).status, 200);
  assert.equal((await call("auth.php?action=reset", { token, password: "another-pass-2" })).status, 410, "a link cannot be used twice");
});

test("using one link cancels the others, and a made-up link is refused", { skip: !BASE || !MAIL_LOG }, async () => {
  const email = `reset2-${RUN}@test.local`;
  await register(email);
  await call("auth.php?action=request-reset", { email });
  await call("auth.php?action=request-reset", { email });
  const [first, second] = resetTokens(email);
  assert.ok(first && second && first !== second);
  assert.equal((await call("auth.php?action=reset", { token: second, password: "new-password-1" })).status, 200);
  assert.equal((await call("auth.php?action=reset", { token: first, password: "new-password-2" })).status, 410);
  assert.equal((await call("auth.php?action=reset", { token: "0".repeat(64), password: "new-password-3" })).status, 410);
});

test("asking for a reset gives the same answer for unknown emails and is limited per hour", { skip: !BASE || !MAIL_LOG }, async () => {
  const unknown = await call("auth.php?action=request-reset", { email: `nobody-${RUN}@test.local` });
  assert.deepEqual([unknown.status, unknown.body], [200, { ok: true }]);
  assert.deepEqual(resetTokens(`nobody-${RUN}@test.local`), []);

  const email = `reset3-${RUN}@test.local`;
  await register(email);
  for (let i = 0; i < 5; i++) assert.equal((await call("auth.php?action=request-reset", { email })).status, 200);
  assert.equal(resetTokens(email).length, 3);
});

test("a signed-in session ends at logout", { skip: !BASE }, async () => {
  const email = `session-${RUN}@test.local`;
  const { cookie } = await register(email);
  assert.equal((await call("auth.php?action=session", undefined, cookie)).body.user.email, email);
  await call("auth.php?action=logout", {}, cookie);
  assert.equal((await call("auth.php?action=session", undefined, cookie)).body.user, null);
});

/** The confirmation links emailed to an address, oldest first. */
function verifyTokens(email: string): string[] {
  if (!MAIL_LOG || !existsSync(MAIL_LOG)) return [];
  return readFileSync(MAIL_LOG, "utf8").split("\n---\n")
    .filter((mail) => mail.includes(`To: ${email}\n`))
    .map((mail) => /\?verify=([0-9a-f]{64})/.exec(mail)?.[1])
    .filter((token): token is string => Boolean(token));
}

test("a new owner is emailed a confirmation link, and opening it confirms the email", { skip: !BASE || !MAIL_LOG }, async () => {
  const email = `verify-${RUN}@test.local`;
  const { cookie } = await register(email);
  const shop = async () => (await call("shop.php", undefined, cookie)).body.subscription;
  assert.equal((await shop()).emailVerified, false);
  assert.equal((await shop()).state, "trial", "the shop works during the allowed days");

  const [token] = verifyTokens(email);
  assert.ok(token, "the confirmation email carries a link");
  assert.equal((await call("auth.php?action=verify", { token: "f".repeat(64) })).status, 410);
  assert.equal((await call("auth.php?action=verify", { token })).status, 200);
  assert.equal((await call("auth.php?action=verify", { token })).status, 200, "opening the link twice is harmless");
  assert.equal((await shop()).emailVerified, true);
  assert.equal((await call("auth.php?action=resend-verification", {}, cookie)).body.alreadyVerified, true);
});

test("the link can be sent again, but not twice in a minute, and the old link stops working", { skip: !BASE || !MAIL_LOG }, async () => {
  const email = `resend-${RUN}@test.local`;
  const { cookie } = await register(email);
  assert.equal((await call("auth.php?action=resend-verification", {}, cookie)).status, 429);
  assert.equal(verifyTokens(email).length, 1);
  assert.equal((await call("auth.php?action=resend-verification", {})).status, 401);
});

test("changing the email address means confirming the new one", { skip: !BASE || !MAIL_LOG }, async () => {
  const email = `change-${RUN}@test.local`;
  const next = `changed-${RUN}@test.local`;
  const { cookie } = await register(email);
  await call("auth.php?action=verify", { token: verifyTokens(email)[0] });
  const changed = await call("auth.php?action=profile", { name: "Reset Tester", email: next, currentPassword: "password123", newPassword: "" }, cookie);
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal((await call("shop.php", undefined, cookie)).body.subscription.emailVerified, false);
  const [token] = verifyTokens(next);
  assert.ok(token, "the link goes to the new address");
  await call("auth.php?action=verify", { token });
  assert.equal((await call("shop.php", undefined, cookie)).body.subscription.emailVerified, true);
});
