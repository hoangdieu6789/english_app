// Every API call goes through apiFetch. The access token cookie lives 15 minutes; when a
// call gets 401, apiFetch renews it once with the refresh token (POST /api/auth/refresh,
// rotated by the backend) and repeats the call. Parallel calls share one refresh. If the
// refresh fails too, the session is over and the learner is sent to the login page.

import { getCurrentLang } from "@/lib/i18n/current";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const NO_REFRESH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout", "/auth/forgot-password", "/auth/reset-password"];

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // The learner's language: backend messages, AI feedback and meanings follow it.
  const headers = new Headers(init.headers);
  headers.set("X-App-Lang", getCurrentLang());
  const call = () => fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: "include" });
  let res = await call();
  if (res.status !== 401 || NO_REFRESH.includes(path)) return res;

  if (await refreshSession()) {
    res = await call();
    if (res.status !== 401) return res;
  }
  const onAuthPage = typeof window !== "undefined" && /^\/(login|register|forgot-password|reset-password)/.test(window.location.pathname);
  if (typeof window !== "undefined" && !onAuthPage) {
    window.location.assign("/login");
  }
  return res;
}

/** Throws an Error with the backend's message for a non-2xx response. */
export async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({ message: res.statusText }));
  return new Error(body.message ?? fallback);
}
