"use client";

import { useRouter } from "next/navigation";
import { authApi } from "@/lib/auth-api";
import { useSessionStore } from "@/lib/session-store";

/** Signs out (server cookie + local session) and goes to the sign-in page. */
export function useLogout() {
  const router = useRouter();
  const setUser = useSessionStore((s) => s.setUser);
  return async function logout() {
    await authApi.logout().catch(() => {});
    setUser(null);
    router.push("/login");
  };
}
