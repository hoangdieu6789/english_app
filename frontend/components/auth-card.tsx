"use client";

import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { Icon } from "@/components/icon";
import { useI18n } from "@/lib/i18n";

// The password pages (forgot / reset) use the same layout as sign in, with a way back.
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <AuthLayout heroTitle={t("auth.brand.tagline")} heroIntro={t("auth.brand.intro")} title={title} subtitle={subtitle}>
      {children}
      <Link href="/login" className="ds-tap" style={{ alignSelf: "center", fontSize: "var(--text-sm)", fontWeight: 700 }}>
        <Icon name="back" />
        {t("auth.card.backToLogin")}
      </Link>
    </AuthLayout>
  );
}
