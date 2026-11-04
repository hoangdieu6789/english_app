import { apiClient, ApiError } from "./api-client";
import type { SessionUser } from "./session-store";

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

/** A learner-facing message for a failed login or registration. */
export function authErrorMessage(err: unknown, action: "login" | "register" | "reset"): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Email hoặc mật khẩu không đúng.";
    if (err.status === 409) return "Email này đã được đăng ký. Hãy đăng nhập.";
    if (err.status === 400) return "Email hoặc mật khẩu chưa hợp lệ (mật khẩu tối thiểu 8 ký tự).";
    if (err.status === 429) return "Bạn thử quá nhiều lần. Đợi một lát rồi thử lại.";
    if (err.status === 410) return "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu link mới.";
  } else if (err instanceof TypeError) {
    return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  }
  if (action === "login") return "Đăng nhập thất bại. Thử lại sau.";
  if (action === "register") return "Đăng ký thất bại. Thử lại sau.";
  return "Không đặt lại được mật khẩu. Thử lại sau.";
}
