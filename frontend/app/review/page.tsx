"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { REVIEW, REVIEW_TAGS } from "@/lib/mock/practice-data";

type Step = "front" | "meaning" | "speak";
type SpeakState = "idle" | "rec" | "scored";

export default function ReviewPage() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState<Step>("front");
  const [choice, setChoice] = useState<number | null>(null);
  const [speak, setSpeak] = useState<SpeakState>("idle");
  const [done, setDone] = useState(false);

  const word = REVIEW[idx];
  const tag = REVIEW_TAGS[word.tag];

  function advance() {
    if (idx + 1 >= REVIEW.length) {
      setDone(true);
    } else {
      setIdx((i) => i + 1);
      setStep("front");
      setChoice(null);
      setSpeak("idle");
    }
  }

  function restart() {
    setIdx(0);
    setStep("front");
    setChoice(null);
    setSpeak("idle");
    setDone(false);
  }

  function chooseMeaning(i: number) {
    if (choice == null) setChoice(i);
  }

  function startSpeak() {
    setSpeak("rec");
    setTimeout(() => setSpeak("scored"), 1500);
  }

  const progress = Math.round((idx / REVIEW.length) * 100);

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {!done ? (
          <>
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  fontSize: 13,
                  color: "var(--ds-text-muted)",
                }}
              >
                <span>Từ {idx + 1} / {REVIEW.length}</span>
                <span>{REVIEW.length - idx - 1} từ còn lại hôm nay</span>
              </div>
              <div style={{ height: 8, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    background: "var(--ds-primary)",
                    borderRadius: 99,
                    transition: "width .3s var(--ds-ease)",
                    width: `${progress}%`,
                  }}
                />
              </div>
            </div>

            <div className="ds-card" style={{ padding: 32, minHeight: 340, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 99,
                    background: tag.bg,
                    color: tag.fg,
                  }}
                >
                  {tag.label}
                </span>
                <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Đã gặp {word.seen} lần</span>
              </div>

              <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
                <div style={{ font: "700 40px var(--font-display)", color: "var(--ds-text)" }}>{word.word}</div>
                <div style={{ fontSize: 16, color: "var(--ds-text-muted)" }}>{word.phonetic}</div>
                <button className="ds-btn ds-btn-outline ds-btn-sm" style={{ alignSelf: "center", marginTop: 6 }}>
                  <i className="pi pi-volume-up" />
                  <span>Nghe</span>
                </button>
              </div>

              {step === "front" && (
                <button onClick={() => setStep("meaning")} className="ds-btn ds-btn-lg" style={{ marginTop: 20 }}>
                  <span>Bạn nhớ nghĩa từ này chứ?</span>
                </button>
              )}

              {step === "meaning" && (
                <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, color: "var(--ds-text-muted)", textAlign: "center", marginBottom: 2 }}>
                    Chọn nghĩa đúng
                  </div>
                  {word.options.map((text, i) => {
                    const answered = choice != null;
                    const isCorrect = i === word.correct;
                    const isChosen = choice === i;
                    let borderColor = "var(--ds-border)";
                    let bg = "#fff";
                    let opacity = 1;
                    let icon = "";
                    let iconColor = "";
                    if (answered) {
                      if (isCorrect) {
                        borderColor = "var(--ds-success)";
                        bg = "var(--ds-success-bg)";
                        icon = "pi pi-check-circle";
                        iconColor = "var(--ds-success)";
                      } else if (isChosen) {
                        borderColor = "var(--ds-danger)";
                        bg = "var(--ds-danger-bg)";
                        icon = "pi pi-times-circle";
                        iconColor = "var(--ds-danger)";
                      } else {
                        opacity = 0.6;
                      }
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => chooseMeaning(i)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "13px 16px",
                          borderRadius: "var(--ds-radius-lg)",
                          border: `1.5px solid ${borderColor}`,
                          background: bg,
                          cursor: answered ? "default" : "pointer",
                          fontSize: 15,
                          fontFamily: "inherit",
                          textAlign: "left",
                          color: "var(--ds-text)",
                          opacity,
                        }}
                      >
                        <span>{text}</span>
                        {icon && <i className={icon} style={{ color: iconColor }} />}
                      </button>
                    );
                  })}
                  {choice != null && (
                    <>
                      <div
                        style={{
                          marginTop: 8,
                          padding: "12px 14px",
                          background: "var(--ds-surface-subtle)",
                          borderRadius: "var(--ds-radius-lg)",
                          fontSize: 14,
                          color: "var(--ds-text-secondary)",
                        }}
                      >
                        <b>Ví dụ:</b> {word.example}
                      </div>
                      <button
                        onClick={() => { setStep("speak"); setSpeak("idle"); }}
                        className="ds-btn"
                        style={{ marginTop: 4 }}
                      >
                        <i className="pi pi-microphone" />
                        <span>Luyện nói lại từ này</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {step === "speak" && (
                <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                  {speak === "idle" && (
                    <button onClick={startSpeak} className="ds-btn ds-btn-lg" style={{ borderRadius: "var(--ds-radius-full)", padding: "0 28px" }}>
                      <i className="pi pi-microphone" />
                      <span>Nhấn để đọc &quot;{word.word}&quot;</span>
                    </button>
                  )}
                  {speak === "rec" && (
                    <button
                      className="ds-btn ds-btn-lg"
                      style={{ borderRadius: "var(--ds-radius-full)", padding: "0 28px", animation: "recpulse 1.6s infinite" }}
                    >
                      <i className="pi pi-spinner" style={{ animation: "spin 1s linear infinite" }} />
                      <span>Đang nghe...</span>
                    </button>
                  )}
                  {speak === "scored" && (
                    <>
                      <div style={{ textAlign: "center" }}>
                        <span style={{ font: "700 32px var(--font-display)", color: "var(--ds-success)" }}>Tốt lắm! 👏</span>
                        <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginTop: 4 }}>
                          Bạn đọc từ này rõ hơn lần trước rồi
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginTop: 4 }}>Mức độ nhớ của bạn?</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={advance} className="ds-btn ds-btn-outline" style={{ color: "var(--ds-danger)", borderColor: "var(--ds-danger)" }}>
                          <span>Khó</span>
                        </button>
                        <button onClick={advance} className="ds-btn ds-btn-outline" style={{ color: "var(--ds-warning)", borderColor: "var(--ds-warning)" }}>
                          <span>Tạm ổn</span>
                        </button>
                        <button onClick={advance} className="ds-btn ds-btn-outline" style={{ color: "var(--ds-success)", borderColor: "var(--ds-success)" }}>
                          <span>Dễ</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div
            className="ds-card fade"
            style={{ padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
          >
            <span
              style={{
                width: 76,
                height: 76,
                borderRadius: "50%",
                background: "var(--ds-success-bg)",
                color: "var(--ds-success)",
                display: "grid",
                placeItems: "center",
                fontSize: 36,
              }}
            >
              <i className="pi pi-check" />
            </span>
            <div style={{ font: "700 26px var(--font-display)" }}>Xong buổi ôn hôm nay!</div>
            <div style={{ fontSize: 15, color: "var(--ds-text-muted)", maxWidth: 420, lineHeight: 1.6 }}>
              Bạn đã ôn <b>{REVIEW.length} từ</b> và luyện phát âm lại từng từ. Cứ đều đặn thế này, vốn từ sẽ chắc dần.
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button onClick={restart} className="ds-btn ds-btn-outline">
                <i className="pi pi-refresh" />
                <span>Ôn lại</span>
              </button>
              <button onClick={() => router.push("/progress")} className="ds-btn">
                <span>Xem tiến độ</span>
                <i className="pi pi-arrow-right" />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
