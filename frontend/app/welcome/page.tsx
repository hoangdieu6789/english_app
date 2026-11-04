"use client";

import { useRouter } from "next/navigation";
import { BandGoalForm } from "@/components/band-goal-form";

// Asked once after registering: the learner's band estimate and target band (both can be
// changed later on the Progress page).
export default function WelcomePage() {
  const router = useRouter();
  return (
    <div
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, background: "linear-gradient(160deg,#fff7f5 0%,#fdeef0 100%)" }}
    >
      <div className="ds-card fade" style={{ width: "100%", maxWidth: 520, padding: 36, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ font: "700 22px var(--font-display)" }}>Chào mừng bạn đến với SpeakUp</div>
          <div style={{ fontSize: 14, color: "var(--ds-text-muted)", marginTop: 6, lineHeight: 1.6 }}>
            Cho biết band IELTS Speaking hiện tại (ước lượng) và band bạn muốn đạt. App dùng hai số này để chọn từ mới vừa sức.
          </div>
        </div>
        <BandGoalForm onSaved={() => router.replace("/dashboard")} />
        <button
          onClick={() => router.replace("/dashboard")}
          style={{ alignSelf: "center", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "var(--ds-text-muted)" }}
        >
          Để sau
        </button>
      </div>
    </div>
  );
}
