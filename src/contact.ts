// How a shop reaches the people who run the software. The admin sets these on
// the Pricing page; the login screen, the Help page and the Subscription page
// all show them the same way.

export type ContactInfo = {
  supportPhone?: string;
  supportWhatsapp?: string;
  supportEmail?: string;
  supportFacebook?: string;
  supportHours?: string;
};

/** Read without logging in, so the login screen can show it. Empty when the server cannot be reached. */
export async function loadContact(): Promise<ContactInfo> {
  try {
    const response = await fetch("/api/contact.php");
    return response.ok ? await response.json() as ContactInfo : {};
  } catch {
    return {};
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** A chat link for a number written the local way (017...) or with the country code. */
export function whatsappLink(number: string): string {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${/^01\d{9}$/.test(digits) ? `88${digits}` : digits}`;
}

const ICONS = {
  whatsapp: '<path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.500 5.5l1-1.500-2-1-.8.8c-1-.4-1.800-1.200-2.200-2.200l.8-.8-1-2z"/>',
  phone: '<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  facebook: '<path d="M14 9V7.500C14 6.700 14.300 6 15.500 6H17V3h-2.500C11.500 3 10 4.800 10 7.200V9H8v3h2v9h4v-9h2.500l.5-3z"/>',
};

/** The ways to get in touch as a row of links, or "" when the admin has set none. */
export function contactHtml(info: ContactInfo): string {
  const facebook = (info.supportFacebook || "").trim();
  const facebookUrl = /^https?:\/\//i.test(facebook) ? facebook : /^(www\.|m\.)?(facebook|fb)\.com\//i.test(facebook) ? `https://${facebook}` : "";
  const ways: [keyof typeof ICONS, string, string, string][] = [
    ["whatsapp", "WhatsApp", info.supportWhatsapp || "", info.supportWhatsapp ? whatsappLink(info.supportWhatsapp) : ""],
    ["phone", "Call", info.supportPhone || "", info.supportPhone ? `tel:${info.supportPhone.replace(/[^\d+]/g, "")}` : ""],
    ["email", "Email", info.supportEmail || "", info.supportEmail ? `mailto:${info.supportEmail}` : ""],
    // A link shows the page's own name from the end of the address.
    ["facebook", "Facebook", facebookUrl ? facebookUrl.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() || "" : facebook, facebookUrl],
  ];
  const links = ways.filter(([, , text, href]) => text || href).map(([kind, label, text, href]) => {
    const inside = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[kind]}</svg><span><b>${label}</b>${text ? `<small data-no-translate>${escapeHtml(text)}</small>` : ""}</span>`;
    return href
      ? `<a class="contact-link ${kind}" href="${escapeHtml(href)}" ${/^https?:/.test(href) ? 'target="_blank" rel="noopener"' : ""}>${inside}</a>`
      : `<span class="contact-link ${kind}">${inside}</span>`;
  }).join("");
  if (!links) return "";
  const hours = (info.supportHours || "").trim();
  return `<div class="contact-links">${links}</div>${hours ? `<p class="contact-hours"><span>Support hours</span>: <span data-no-translate>${escapeHtml(hours)}</span></p>` : ""}`;
}
