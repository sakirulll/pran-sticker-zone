export type HostingUser = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
};

import type { Change, RecordRow } from "./shopSync";

export type ShopBackup = { name: string; size: number; createdAt: string };

export type Subscription = {
  /** "lifetime" is the platform admin's own shop; "active" is paid. */
  state: "lifetime" | "active" | "trial" | "expired" | "suspended" | "unverified";
  secondsLeft: number;
  /** False while the shop owner still has to confirm the email address. */
  emailVerified: boolean;
};

export type BillingSettings = {
  priceMonthly: number;
  priceYearly: number;
  trialDays: number;
  bkashNumber: string;
  nagadNumber: string;
  supportPhone: string;
  verifyGraceDays: number;
};

export type Payment = {
  id: number;
  plan: "monthly" | "yearly";
  amount: number;
  method: string;
  sender: string;
  trxId: string;
  status: "pending" | "approved" | "rejected";
  note: string;
  createdAt: string;
  shopName: string | null;
  ownerEmail: string | null;
};

export type AdminShop = {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  staff: number;
  records: number;
  subscription: Subscription;
};

export type ShopMembership = {
  owner: boolean;
  roleId: number | null;
};

type ApiFailure = Error & { status?: number };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !body?.ok) {
    const error = new Error(body?.error || "The server could not complete this request.") as ApiFailure;
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export const hostingApi = {
  session: () => request<{ ok: true; user: HostingUser | null }>("auth.php?action=session"),

  register: (name: string, shopName: string, email: string, password: string) =>
    request<{ ok: true; user: HostingUser }>("auth.php?action=register", {
      method: "POST",
      body: JSON.stringify({ name, shopName, email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ ok: true; user: HostingUser }>("auth.php?action=login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  requestPasswordReset: (email: string) =>
    request<{ ok: true }>("auth.php?action=request-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("auth.php?action=reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  verifyEmail: (token: string) =>
    request<{ ok: true }>("auth.php?action=verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resendVerification: () =>
    request<{ ok: true; alreadyVerified?: boolean }>("auth.php?action=resend-verification", { method: "POST" }),

  logout: () => request<{ ok: true }>("auth.php?action=logout", { method: "POST" }),

  loadShop: () => request<{
    ok: true;
    rev: number;
    shopName: string;
    subscription: Subscription;
    admin: boolean;
    membership: ShopMembership;
    records: RecordRow[];
  }>("shop.php"),

  // Sends this device's changes and receives what other devices changed since `since`.
  syncShop: (since: number, changes: Change[]) =>
    request<{ ok: true; rev: number; remote: RecordRow[] }>("shop.php?action=sync", {
      method: "POST",
      body: JSON.stringify({ since, changes }),
    }),

  billingStatus: () => request<{
    ok: true;
    subscription: Subscription;
    settings: BillingSettings;
    payments: Payment[];
    owner: boolean;
  }>("billing.php?action=status"),

  submitPayment: (plan: string, method: string, sender: string, trxId: string) =>
    request<{ ok: true }>("billing.php?action=submit", {
      method: "POST",
      body: JSON.stringify({ plan, method, sender, trxId }),
    }),

  adminOverview: () => request<{
    ok: true;
    shops: AdminShop[];
    payments: Payment[];
    settings: BillingSettings;
  }>("billing.php?action=admin-overview"),

  adminAction: (action: "review" | "extend" | "suspend" | "settings" | "verify", body: Record<string, unknown>) =>
    request<{ ok: true }>(`billing.php?action=admin-${action}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listBackups: () => request<{ ok: true; backups: ShopBackup[] }>("shop.php?action=backups"),

  backupNow: () => request<{ ok: true; backups: ShopBackup[] }>("shop.php?action=backup-now", { method: "POST" }),

  restoreBackup: (name: string) =>
    request<{ ok: true }>("shop.php?action=restore", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  backupDownloadUrl: (name: string) => `/api/shop.php?action=backup-download&name=${encodeURIComponent(name)}`,

  createMember: (name: string, email: string, password: string, roleId: number) =>
    request<{ ok: true }>("auth.php?action=create-member", {
      method: "POST",
      body: JSON.stringify({ name, email, password, roleId }),
    }),

  updateProfile: (name: string, email: string, currentPassword: string, newPassword: string) =>
    request<{ ok: true; user: HostingUser }>("auth.php?action=profile", {
      method: "POST",
      body: JSON.stringify({ name, email, currentPassword, newPassword }),
    }),

  uploadImage: (image: string) =>
    request<{ ok: true; url: string }>("upload.php", {
      method: "POST",
      body: JSON.stringify({ image }),
    }),

  deleteImage: (url: string) =>
    request<{ ok: true }>("upload.php?action=delete", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
};
