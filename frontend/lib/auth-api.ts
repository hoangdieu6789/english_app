import { apiClient, ApiError } from "./api-client";
import type { SessionUser } from "./session-store";
import type { MessageKey } from "./i18n/languages";

export const authApi = {
  // Register also signs the learner in (the API sets the auth cookies).
  register: (email: string, password: string) =>
    apiClient.post<SessionUser>("/auth/register", { email, password }),
  // remember = false: the session ends when the browser closes (and after 24 h at most).
  login: (email: string, password: string, remember = true) =>
    apiClient.post<SessionUser>("/auth/login", { email, password, remember }),
  logout: () => apiClient.post<void>("/auth/logout"),
  me: () => apiClient.get<SessionUser>("/auth/me"),
  // Always succeeds for a valid e-mail (the API does not say whether it is registered).
  forgotPassword: (email: string) => apiClient.post<void>("/auth/forgot-password", { email }),
  resetPassword: (token: string, password: string) => apiClient.post<void>("/auth/reset-password", { token, password }),
};

/** A learner-facing message for a failed login or registration. t: the translator from useI18n(). */
export function authErrorMessage(err: unknown, action: "login" | "register" | "reset", t: (key: MessageKey) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("auth.error.wrongCredentials");
    if (err.status === 409) return t("auth.error.emailTaken");
    if (err.status === 400) return t("auth.error.invalidInput");
    if (err.status === 429) return t("auth.error.tooManyAttempts");
    if (err.status === 410) return t("auth.error.resetLinkInvalid");
  } else if (err instanceof TypeError) {
    return t("auth.error.network");
  }
  if (action === "login") return t("auth.error.loginFailed");
  if (action === "register") return t("auth.error.registerFailed");
  return t("auth.error.resetFailed");
}
