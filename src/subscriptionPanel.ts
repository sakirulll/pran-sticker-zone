import { hostingApi, type Subscription } from "./hostingApi";

export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const daysLeft = (subscription: Subscription) => Math.max(1, Math.ceil(subscription.secondsLeft / 86400));
export const canUseShop = (subscription: Subscription) => ["lifetime", "active", "trial"].includes(subscription.state);
export const subscriptionBadge = (subscription: Subscription) => ({
  lifetime: "Lifetime",
  active: `Paid · ${daysLeft(subscription)} days left`,
  trial: `Trial · ${daysLeft(subscription)} days left`,
  expired: "Expired",
  suspended: "Suspended",
  unverified: "Email not confirmed",
}[subscription.state]);

// Asks the server to email the confirmation link again and reports the outcome in `target`.
export async function resendVerification(target: HTMLElement) {
  try {
    const result = await hostingApi.resendVerification();
    target.textContent = result.alreadyVerified ? "Your email is already confirmed. Reload the page." : "A new link has been sent. Check your inbox and spam folder.";
  } catch (error) {
    target.textContent = error instanceof Error ? error.message : "The link could not be sent. Try again.";
  }
}
export const money = (amount: number) => `${String.fromCharCode(2547)}${Number(amount).toLocaleString("en-BD")}`;

// The subscription status, prices, how to pay and the payment form. It is used
// both inside the app and on the page shown when the subscription has ended,
// which is why it does not rely on anything from the running shop.
export async function mountSubscriptionPanel(container: HTMLElement, message?: { text: string; ok: boolean }) {
  container.className = "plan-panel";
  container.innerHTML = "<p>Loading…</p>";
  let status: Awaited<ReturnType<typeof hostingApi.billingStatus>>;
  try {
    status = await hostingApi.billingStatus();
  } catch (error) {
    container.innerHTML = `<p class="plan-note">${escapeHtml(error instanceof Error ? error.message : "The subscription details could not be loaded.")}</p>`;
    return;
  }
  const { subscription, settings, payments, owner } = status;
  const summary = {
    lifetime: "This shop has lifetime access.",
    active: `Your subscription is paid. ${daysLeft(subscription)} days left.`,
    trial: `You are on the free trial. ${daysLeft(subscription)} days left.`,
    expired: "The free trial or paid period has ended. Pay for a plan to continue using the shop.",
    suspended: "This shop has been suspended. Please contact support.",
    unverified: "The shop owner needs to confirm the email address before the shop can be used.",
  }[subscription.state];
  const numbers = [
    settings.bkashNumber && `bKash: <b>${escapeHtml(settings.bkashNumber)}</b>`,
    settings.nagadNumber && `Nagad: <b>${escapeHtml(settings.nagadNumber)}</b>`,
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const support = settings.supportPhone ? ` Need help? Call ${escapeHtml(settings.supportPhone)}.` : "";
  const history = payments.length
    ? `<h3>Your payments</h3><div class="plan-scroll"><table class="plan-table"><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Method</th><th>Transaction ID</th><th>Status</th></tr></thead><tbody>${payments.map((payment) => `<tr><td>${escapeHtml(payment.createdAt)}</td><td>${escapeHtml(payment.plan)}</td><td>${money(payment.amount)}</td><td>${escapeHtml(payment.method)}</td><td>${escapeHtml(payment.trxId)}</td><td>${escapeHtml(payment.status === "pending" ? "Waiting for approval" : payment.status)}${payment.note ? ` – ${escapeHtml(payment.note)}` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : "";
  // What each plan includes. Only things the software really does belong here.
  const included = ["আনলিমিটেড প্রডাক্ট লিস্ট", "আনলিমিটেড সেলস ও কাস্টমার", "ডিউ কালেকশন ও প্রফিট-লস রিপোর্ট", "স্টাফ একাউন্ট ও পারমিশন", "প্রতিদিন অটো ব্যাকআপ", "ইনভয়েস প্রিন্ট", "মোবাইল ও কম্পিউটার সব ডিভাইসে"];
  const paidPlan = payments.find((payment) => payment.status === "approved")?.plan;
  const current = subscription.state === "trial" ? "trial" : subscription.state === "active" ? paidPlan : undefined;
  const canBuy = owner && !["lifetime", "suspended", "unverified"].includes(subscription.state);
  const yearOfMonths = settings.priceMonthly * 12;
  const price = (amount: number) => `${Number(amount).toLocaleString("en-BD", { minimumFractionDigits: 2 })}${String.fromCharCode(2547)}`;
  const card = (plan: { key: string; title: string; days: number; amount: number; was?: number; features: [boolean, string][] }) => {
    const isCurrent = current === plan.key;
    // The plan in use shows as subscribed until it is close enough to the end to renew.
    const action = plan.key === "trial"
      ? `<div class="plan-subscribed ${isCurrent ? "" : "off"}">${isCurrent ? "Active" : subscription.state === "expired" ? "Ended" : "Used"}</div>`
      : isCurrent && daysLeft(subscription) > 30
        ? '<div class="plan-subscribed">Subscribed</div>'
        : canBuy ? `<button class="plan-buy" type="button" data-plan="${plan.key}">${isCurrent ? "Renew" : "Buy Now"}</button>` : "";
    return `<div class="plan-card ${isCurrent ? "current" : ""}">
      ${isCurrent ? '<span class="plan-ribbon">Current Plan</span>' : ""}
      ${plan.was && plan.was > plan.amount ? `<span class="plan-was">${price(plan.was)}</span>` : ""}
      <h3>${plan.title}</h3>
      <div class="plan-days">${plan.days} Days</div>
      <div class="plan-amount">${price(plan.amount)}</div>
      ${action}
      ${isCurrent ? `<small class="plan-expiry">${daysLeft(subscription)} days left</small>` : ""}
      <ul class="plan-features">${plan.features.map(([yes, text]) => `<li class="${yes ? "yes" : "no"}">${text}</li>`).join("")}</ul>
    </div>`;
  };
  const cards = [
    card({ key: "monthly", title: "১ মাসের প্ল্যান", days: 30, amount: settings.priceMonthly, features: included.map((text) => [true, text]) }),
    card({ key: "yearly", title: "১ বছরের প্ল্যান", days: 365, amount: settings.priceYearly, was: yearOfMonths, features: [...included.map((text): [boolean, string] => [true, text]), ...(yearOfMonths > settings.priceYearly ? [[true, `মাসিকের চেয়ে ${price(yearOfMonths - settings.priceYearly)} সাশ্রয়`] as [boolean, string]] : [])] }),
    ...(settings.trialDays > 0 ? [card({ key: "trial", title: "ফ্রি ট্রায়াল", days: settings.trialDays, amount: 0, features: [[true, "সব ফিচার ব্যবহার করা যায়"], [true, "কোনো টাকা লাগে না"], [false, "মেয়াদ শেষে নতুন কিছু সেভ হয় না"], [false, "একটি দোকানে একবারই"]] })] : []),
  ].join("");

  const pay = !canBuy
    ? (owner ? "" : "<p>Only the shop owner can pay for the subscription.</p>")
    : `<div class="plan-pay" ${subscription.state === "expired" || message ? "" : "hidden"}><h3>How to pay</h3>
        ${numbers
          ? `<ol class="plan-steps"><li>Send Money for the plan you chose to: ${numbers}</li><li>Copy the Transaction ID (TrxID) from the confirmation message.</li><li>Fill in the form below. Your plan starts as soon as the payment is checked.</li></ol>`
          : `<p class="plan-note">The payment number has not been set up yet.${support || " Please contact support."}</p>`}
        <form class="plan-form">
          <label>Plan<select name="plan"><option value="yearly">১ বছর – ${price(settings.priceYearly)}</option><option value="monthly">১ মাস – ${price(settings.priceMonthly)}</option></select></label>
          <label>Paid with<select name="method">${settings.nagadNumber && !settings.bkashNumber ? "" : '<option value="bkash">bKash</option>'}${settings.bkashNumber && !settings.nagadNumber ? "" : '<option value="nagad">Nagad</option>'}</select></label>
          <label>Number you sent from<input name="sender" inputmode="tel" placeholder="01XXXXXXXXX" required></label>
          <label>Transaction ID<input name="trxId" placeholder="e.g. 9FK3A7B2XY" required></label>
          <button type="submit">Submit Payment</button>
        </form></div>`;
  container.innerHTML = `
    <p class="plan-status ${subscription.state === "expired" || subscription.state === "suspended" ? "bad" : subscription.state === "trial" ? "" : "ok"}">${escapeHtml(summary)}</p>
    ${message ? `<p class="plan-note ${message.ok ? "ok" : ""}" role="status">${escapeHtml(message.text)}</p>` : ""}
    <div class="plan-cards">${cards}</div>
    ${pay}${history}${support && numbers ? `<p>${support}</p>` : ""}`;

  const paymentForm = container.querySelector<HTMLFormElement>(".plan-form");
  container.querySelectorAll<HTMLButtonElement>(".plan-buy").forEach((button) => button.addEventListener("click", () => {
    const section = container.querySelector<HTMLElement>(".plan-pay");
    if (!section || !paymentForm) return;
    section.hidden = false;
    (paymentForm.elements.namedItem("plan") as HTMLSelectElement).value = button.dataset.plan!;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  paymentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(paymentForm);
    const button = paymentForm.querySelector("button")!;
    button.disabled = true;
    try {
      await hostingApi.submitPayment(String(values.get("plan")), String(values.get("method")), String(values.get("sender")), String(values.get("trxId")));
      await mountSubscriptionPanel(container, { text: "Payment submitted. Your plan will start as soon as it is checked.", ok: true });
    } catch (error) {
      await mountSubscriptionPanel(container, { text: error instanceof Error ? error.message : "The payment could not be submitted.", ok: false });
    }
  });
}
