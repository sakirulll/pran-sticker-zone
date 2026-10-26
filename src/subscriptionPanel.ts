import { contactHtml } from "./contact";
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
  // What each plan includes. Only things the software really does belong here.
  const included = ["আনলিমিটেড প্রডাক্ট লিস্ট", "আনলিমিটেড সেলস ও কাস্টমার", "ডিউ কালেকশন ও প্রফিট-লস রিপোর্ট", "স্টাফ একাউন্ট ও পারমিশন", "প্রতিদিন অটো ব্যাকআপ", "ইনভয়েস প্রিন্ট", "মোবাইল ও কম্পিউটার সব ডিভাইসে"];
  const paidPlan = payments.find((payment) => payment.status === "approved")?.plan;
  const current = subscription.state === "trial" ? "trial" : subscription.state === "active" ? paidPlan : undefined;
  const canBuy = owner && !["lifetime", "suspended", "unverified"].includes(subscription.state);
  const yearOfMonths = settings.priceMonthly * 12;
  const price = (amount: number) => `${Number(amount).toLocaleString("en-BD", { minimumFractionDigits: 2 })}${String.fromCharCode(2547)}`;
  const saving = yearOfMonths > settings.priceYearly ? Math.round(((yearOfMonths - settings.priceYearly) / yearOfMonths) * 100) : 0;
  const card = (plan: { key: string; title: string; days: number; amount: number; was?: number; tag?: string; perMonth?: number; features: [boolean, string][] }) => {
    const isCurrent = current === plan.key;
    // The plan in use shows as subscribed until it is close enough to the end to renew.
    const action = plan.key === "trial"
      ? `<div class="plan-subscribed ${isCurrent ? "" : "off"}">${isCurrent ? "Active" : subscription.state === "expired" ? "Ended" : "Used"}</div>`
      : isCurrent && daysLeft(subscription) > 30
        ? '<div class="plan-subscribed">Subscribed</div>'
        : canBuy ? `<button class="plan-buy" type="button" data-plan="${plan.key}">${isCurrent ? "Renew" : "Buy Now"}</button>` : "";
    return `<div class="plan-card ${isCurrent ? "current" : ""} ${plan.tag && !isCurrent ? "featured" : ""}">
      <div class="plan-tags">${isCurrent ? '<span class="plan-ribbon">Current Plan</span>' : plan.tag ? `<span class="plan-tag">${plan.tag}</span>` : ""}</div>
      <h3>${plan.title}</h3>
      <div class="plan-days">${plan.days} days</div>
      <div class="plan-amount">${price(plan.amount)}</div>
      <div class="plan-was-line">${plan.was && plan.was > plan.amount ? `<s>${price(plan.was)}</s><span class="plan-save">${saving}% off</span>` : plan.perMonth === undefined ? "&nbsp;" : ""}</div>
      ${plan.perMonth ? `<div class="plan-month">${price(plan.perMonth)} / month</div>` : ""}
      ${action}
      ${isCurrent ? `<small class="plan-expiry">${daysLeft(subscription)} days left</small>` : ""}
      <ul class="plan-features">${plan.features.map(([yes, text]) => `<li class="${yes ? "yes" : "no"}">${text}</li>`).join("")}</ul>
    </div>`;
  };
  const cards = [
    card({ key: "monthly", title: "১ মাসের প্ল্যান", days: 30, amount: settings.priceMonthly, features: included.map((text) => [true, text]) }),
    card({ key: "yearly", title: "১ বছরের প্ল্যান", days: 365, amount: settings.priceYearly, was: yearOfMonths, tag: saving ? "Best Value" : "", perMonth: Math.round(settings.priceYearly / 12), features: [...included.map((text): [boolean, string] => [true, text]), ...(yearOfMonths > settings.priceYearly ? [[true, `মাসিকের চেয়ে ${price(yearOfMonths - settings.priceYearly)} সাশ্রয়`] as [boolean, string]] : [])] }),
    ...(settings.trialDays > 0 ? [card({ key: "trial", title: "ফ্রি ট্রায়াল", days: settings.trialDays, amount: 0, features: [[true, "সব ফিচার ব্যবহার করা যায়"], [true, "কোনো টাকা লাগে না"], [false, "মেয়াদ শেষে নতুন কিছু সেভ হয় না"], [false, "একটি দোকানে একবারই"]] })] : []),
  ].join("");

  // Where the shop stands: which plan, how long is left, and until when.
  const planDays = current === "yearly" ? 365 : current === "monthly" ? 30 : current === "trial" ? settings.trialDays : 0;
  const left = ["active", "trial"].includes(subscription.state) ? daysLeft(subscription) : 0;
  const until = left ? new Date(Date.now() + subscription.secondsLeft * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const heroTitle = { lifetime: "Lifetime Access", active: current === "monthly" ? "1 Month Plan" : current === "yearly" ? "1 Year Plan" : "Paid Plan", trial: "Free Trial", expired: "Plan Ended", suspended: "Shop Suspended", unverified: "Email Not Confirmed" }[subscription.state];
  const heroIcon = { lifetime: "★", active: "✓", trial: "⏳", expired: "!", suspended: "!", unverified: "✉" }[subscription.state];
  const hero = `<div class="plan-hero ${subscription.state}">
      <div class="plan-hero-icon" aria-hidden="true">${heroIcon}</div>
      <div class="plan-hero-text"><b>${heroTitle}</b><span>${escapeHtml(summary)}</span>${until ? `<small>Valid until ${until}</small>` : ""}</div>
      ${left ? `<div class="plan-hero-days"><b>${left}</b><span>days left</span></div>` : ""}
      ${left && planDays ? `<i class="plan-hero-bar"><u style="width:${Math.max(3, Math.min(100, (left / planDays) * 100))}%"></u></i>` : ""}
      ${canBuy && subscription.state !== "lifetime" ? `<button class="plan-hero-cta plan-buy-any" type="button">${subscription.state === "expired" ? "Buy a Plan" : "Renew Now"}</button>` : ""}
    </div>`;

  const statusPill = (status: string) => `<span class="plan-pill ${status}">${escapeHtml(status === "pending" ? "Waiting for approval" : status)}</span>`;
  const history = payments.length
    ? `<h3 class="plan-head">Your payments</h3><div class="plan-scroll"><table class="plan-table"><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Method</th><th>Transaction ID</th><th>Status</th></tr></thead><tbody>${payments.map((payment) => `<tr><td>${escapeHtml(payment.createdAt)}</td><td>${escapeHtml(payment.plan)}</td><td><b>${money(payment.amount)}</b></td><td>${escapeHtml(payment.method)}</td><td><code>${escapeHtml(payment.trxId)}</code></td><td>${statusPill(payment.status)}${payment.note ? `<small class="plan-pay-note">${escapeHtml(payment.note)}</small>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : "";
  const wallet = (name: string, number: string, color: string) => `<div class="plan-wallet" style="--w:${color}"><span>${name} · Send Money</span><b>${escapeHtml(number)}</b><button type="button" class="plan-copy" data-copy="${escapeHtml(number)}">Copy</button></div>`;
  const pay = !canBuy
    ? (owner ? "" : "<p class=\"plan-note\">Only the shop owner can pay for the subscription.</p>")
    : `<div class="plan-pay" ${subscription.state === "expired" || message ? "" : "hidden"}><h3 class="plan-head">How to pay</h3>
        ${numbers
          ? `<div class="plan-steps-grid">
              <div class="plan-step"><i>1</i><b>Send Money</b><span>Send the price of the plan you chose to this number:</span>${settings.bkashNumber ? wallet("bKash", settings.bkashNumber, "#e2136e") : ""}${settings.nagadNumber ? wallet("Nagad", settings.nagadNumber, "#f7941d") : ""}</div>
              <div class="plan-step"><i>2</i><b>Copy the TrxID</b><span>Copy the Transaction ID (TrxID) from the confirmation message.</span></div>
              <div class="plan-step"><i>3</i><b>Fill in the form</b><span>Your plan starts as soon as the payment is checked.</span></div>
            </div>`
          : `<p class="plan-note">The payment number has not been set up yet.${support || " Please contact support."}</p>`}
        <form class="plan-form">
          <label>Plan<select name="plan"><option value="yearly">১ বছর – ${price(settings.priceYearly)}</option><option value="monthly">১ মাস – ${price(settings.priceMonthly)}</option></select></label>
          <label>Paid with<select name="method">${settings.nagadNumber && !settings.bkashNumber ? "" : '<option value="bkash">bKash</option>'}${settings.bkashNumber && !settings.nagadNumber ? "" : '<option value="nagad">Nagad</option>'}</select></label>
          <label>Number you sent from<input name="sender" inputmode="tel" placeholder="01XXXXXXXXX" required></label>
          <label>Transaction ID<input name="trxId" placeholder="e.g. 9FK3A7B2XY" required></label>
          <button type="submit">Submit Payment</button>
        </form></div>`;
  container.innerHTML = `
    ${hero}
    ${message ? `<p class="plan-note ${message.ok ? "ok" : ""}" role="status">${escapeHtml(message.text)}</p>` : ""}
    <h3 class="plan-head">Choose a plan</h3>
    <div class="plan-cards">${cards}</div>
    ${pay}${history}${contactHtml(settings) ? `<h3 class="plan-head">Need help? Contact us</h3>${contactHtml(settings)}` : ""}`;

  const paymentForm = container.querySelector<HTMLFormElement>(".plan-form");
  const openPay = (plan: string) => {
    const section = container.querySelector<HTMLElement>(".plan-pay");
    if (!section || !paymentForm) return;
    section.hidden = false;
    (paymentForm.elements.namedItem("plan") as HTMLSelectElement).value = plan;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  container.querySelectorAll<HTMLButtonElement>(".plan-buy").forEach((button) => button.addEventListener("click", () => openPay(button.dataset.plan!)));
  container.querySelector<HTMLButtonElement>(".plan-buy-any")?.addEventListener("click", () => openPay(current === "monthly" ? "monthly" : "yearly"));
  container.querySelectorAll<HTMLButtonElement>(".plan-copy").forEach((button) => button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy || "");
      button.textContent = "Copied";
      button.classList.add("done");
    } catch {
      // Without clipboard access the number can still be read and typed.
    }
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
