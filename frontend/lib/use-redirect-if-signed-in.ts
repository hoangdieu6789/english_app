"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "./auth-api";

/** On the login / register pages: a learner who is already signed in goes to the dashboard. */
export function useRedirectIfSignedIn() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then(() => {
        if (!cancelled) router.replace("/dashboard");
      })
      .catch(() => {}); // not signed in: stay
    return () => {
      cancelled = true;
    };
  }, [router]);
}
