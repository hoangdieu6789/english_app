"use client";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { BandGoalForm } from "@/components/band-goal-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useI18n } from "@/lib/i18n";
import { goalsQuery } from "@/lib/review-api";
import { useSessionStore } from "@/lib/session-store";
import { useLogout } from "@/lib/use-logout";
import { Icon } from "@/components/icon";

const WIDTH = 760;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ds-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, font: "700 var(--text-base)/1.3 var(--font-display)" }}>{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const goals = useQuery(goalsQuery);
  const email = useSessionStore((s) => s.user?.email ?? "");
  const logout = useLogout();

  return (
    <AppShell width={WIDTH}>
      <div className="fade" style={{ maxWidth: WIDTH, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <Section title={t("settings.appearance.title")}>
          <ThemeSwitcher />
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("settings.appearance.hint")}</p>
        </Section>

        <Section title={t("settings.language.title")}>
          <LanguageSwitcher sync showHint hideLabel />
        </Section>

        <Section title={t("settings.goal.title")}>
          {goals.data ? (
            <BandGoalForm goals={goals.data} />
          ) : (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>
          )}
        </Section>

        <Section title={t("settings.account.title")}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("settings.account.email")}</div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, overflowWrap: "anywhere" }}>{email}</div>
            </div>
            <button type="button" className="ds-btn ds-btn-outline" onClick={logout}>
              <Icon name="logout" />
              <span>{t("nav.logout")}</span>
            </button>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
