"use client";

import { useRouter } from "next/navigation";
import { BandGoalForm } from "@/components/band-goal-form";
import { useI18n } from "@/lib/i18n";

// Asked once after registering: the learner's band estimate and target band (both can be
// changed later on the Progress page).
export default function WelcomePage() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <div
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, background: "linear-gradient(160deg,#fff7f5 0%,#fdeef0 100%)" }}
    >
      <div className="ds-card fade" style={{ width: "100%", maxWidth: 520, padding: 36, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ font: "700 22px var(--font-display)" }}>{t("auth.welcome.title")}</div>
          <div style={{ fontSize: 14, color: "var(--ds-text-muted)", marginTop: 6, lineHeight: 1.6 }}>
            {t("auth.welcome.intro")}
          </div>
        </div>
        <BandGoalForm onSaved={() => router.replace("/dashboard")} />
        <button
          onClick={() => router.replace("/dashboard")}
          style={{ alignSelf: "center", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "var(--ds-text-muted)" }}
        >
          {t("common.later")}
        </button>
      </div>
    </div>
  );
}
