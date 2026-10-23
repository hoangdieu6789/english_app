import { apiClient } from "./api-client";
import type { SessionUser } from "./session-store";

export const authApi = {
  register: (email: string, password: string) =>
    apiClient.post<SessionUser>("/auth/register", { email, password }),
  login: (email: string, password: string) =>
    apiClient.post<SessionUser>("/auth/login", { email, password }),
  logout: () => apiClient.post<void>("/auth/logout"),
  me: () => apiClient.get<SessionUser>("/auth/me"),
};
