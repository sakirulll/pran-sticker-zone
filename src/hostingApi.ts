export type HostingUser = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
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

  saveShop: (data: Record<string, unknown>) =>
    request<{ ok: true }>("shop.php", {
      method: "PUT",
      body: JSON.stringify({ data }),
    }),

  uploadImage: (image: string) =>
    request<{ ok: true; url: string }>("upload.php", {
      method: "POST",
      body: JSON.stringify({ image }),
    }),
};
