export type HostingUser = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
};

import type { Change, RecordRow } from "./shopSync";

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

  register: (name: string, email: string, password: string) =>
    request<{ ok: true; user: HostingUser }>("auth.php?action=register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ ok: true; user: HostingUser }>("auth.php?action=login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<{ ok: true }>("auth.php?action=logout", { method: "POST" }),

  loadShop: () => request<{
    ok: true;
    rev: number;
    membership: ShopMembership;
    records: RecordRow[];
  }>("shop.php"),

  // Sends this device's changes and receives what other devices changed since `since`.
  syncShop: (since: number, changes: Change[]) =>
    request<{ ok: true; rev: number; remote: RecordRow[] }>("shop.php?action=sync", {
      method: "POST",
      body: JSON.stringify({ since, changes }),
    }),

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
