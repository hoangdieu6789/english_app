"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ProgressRing } from "@/components/charts/progress-ring";
import { Waveform } from "@/components/charts/waveform";
import { fetchNextSentence, type PracticeSentence } from "@/lib/practice-api";
import { submitPronunciationAttempt, resolveAudioUrl, type PronunciationAttempt } from "@/lib/pronunciation-api";
import { WavRecorder } from "@/lib/wav-recorder";
import { scoreColor, scoreColorSoft } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";

type RecState = "idle" | "recording" | "processing" | "result" | "error";

export default function PracticePage() {
  const [sentence, setSentence] = useState<PracticeSentence | null>(null);
  const [sentenceLoading, setSentenceLoading] = useState(true);
  const [sentenceError, setSentenceError] = useState<string | null>(null);
  const [rec, setRec] = useState<RecState>("idle");
  const [recSecs, setRecSecs] = useState(0);
  const [layout, setLayout] = useState<"A" | "B">("A");
  const [result, setResult] = useState<PronunciationAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<WavRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadNextSentence() {
    setSentenceLoading(true);
    setSentenceError(null);
    try {
      const next = await fetchNextSentence();
      setSentence(next);
    } catch (err) {
      setSentenceError(err instanceof Error ? err.message : "Không tạo được câu mới. Thử lại.");
    } finally {
      setSentenceLoading(false);
    }
  }

  useEffect(() => {
    loadNextSentence();
  }, []);

  async function startRecording() {
    setError(null);
    try {
      const recorder = new WavRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setRec("recording");
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setError("Không truy cập được microphone. Kiểm tra quyền trình duyệt.");
      setRec("error");
    }
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    const recorder = recorderRef.current;
    if (!recorder || !sentence) return;

    setRec("processing");
    try {
      const wavBlob = recorder.stop();
      const attempt = await submitPronunciationAttempt(wavBlob, sentence.text);
      setResult(attempt);
      setRec("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chấm điểm thất bại. Thử lại.");
      setRec("error");
    }
  }

  function toggleRecord() {
    if (rec === "idle" || rec === "error") startRecording();
    else if (rec === "recording") stopRecording();
  }

  function retryRecord() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRec("idle");
    setRecSecs(0);
    setResult(null);
    setError(null);
  }

  function nextSentence() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRec("idle");
    setRecSecs(0);
    setResult(null);
    setError(null);
    loadNextSentence();
  }

  const words =
    result?.wordScores.map((w) => ({
      text: w.word,
      score: Math.round(w.accuracyScore),
      color: scoreColor(w.accuracyScore),
      colorSoft: scoreColorSoft(w.accuracyScore),
      errLabel: w.errorType !== "none" ? `Cần luyện: ${w.word}` : `Tốt: ${w.word}`,
    })) ?? [];

  const phonemes =
    result?.phonemeScores.map((p) => ({
      sym: p.phoneme,
      score: Math.round(p.score),
      color: scoreColor(p.score),
    })) ?? [];

  const segBtnBase: React.CSSProperties = {
    border: "none",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: 99,
    fontFamily: "inherit",
  };

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 940, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="ds-card" style={{ padding: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "var(--ds-info-bg)",
                  color: "var(--ds-info)",
                }}
              >
                <i className="pi pi-sparkles" style={{ fontSize: 11 }} />
                Câu do AI tạo
              </span>
              <span style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Chủ đề: Giao tiếp hằng ngày</span>
            </div>
            <button onClick={nextSentence} disabled={sentenceLoading} className="ds-btn ds-btn-text ds-btn-sm">
              <span>Câu khác</span>
              <i className="pi pi-refresh" />
            </button>
          </div>

          <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
            {sentenceLoading && (
              <div style={{ fontSize: 14, color: "var(--ds-text-muted)", padding: "20px 0" }}>
                <i className="pi pi-spinner" style={{ animation: "spin 1s linear infinite", marginRight: 8 }} />
                Đang tạo câu mới...
              </div>
            )}
            {sentenceError && (
              <div style={{ fontSize: 14, color: "var(--ds-danger)", padding: "20px 0" }}>{sentenceError}</div>
            )}
            {sentence && !sentenceLoading && !sentenceError && (
              <>
                <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 8 }}>Nghe rồi đọc to câu sau</div>
                <div style={{ font: "600 30px/1.4 var(--font-display)", color: "var(--ds-text)" }}>{sentence.text}</div>
                <div style={{ fontSize: 15, color: "var(--ds-text-muted)", marginTop: 8 }}>{sentence.phonetic}</div>
                <div style={{ fontSize: 14, color: "var(--ds-text-secondary)", marginTop: 6, fontStyle: "italic" }}>
                  {sentence.gloss}
                </div>
                <button onClick={() => speakEnglish(sentence.text)} className="ds-btn ds-btn-outline ds-btn-sm" style={{ marginTop: 14 }}>
                  <i className="pi pi-volume-up" />
                  <span>Nghe mẫu</span>
                </button>
              </>
            )}
          </div>

          <div
            style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: "1px solid var(--ds-border-subtle)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ width: "100%", maxWidth: 520, height: 64, display: "grid", placeItems: "center" }}>
              <Waveform active={rec === "recording"} />
            </div>

            {(rec === "idle" || rec === "error") && (
              <>
                <button
                  onClick={toggleRecord}
                  disabled={!sentence}
                  className="ds-btn ds-btn-lg"
                  style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56 }}
                >
                  <i className="pi pi-microphone" style={{ fontSize: 18 }} />
                  <span>Nhấn để nói</span>
                </button>
                {error ? (
                  <div style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>
                    Cứ thoải mái — bạn có thể thử lại bao nhiêu lần cũng được
                  </div>
                )}
              </>
            )}
            {rec === "recording" && (
              <>
                <button
                  onClick={toggleRecord}
                  className="ds-btn ds-btn-lg"
                  style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56, animation: "recpulse 1.6s infinite" }}
                >
                  <i className="pi pi-stop-circle" style={{ fontSize: 18 }} />
                  <span>Đang ghi âm 0:{String(recSecs).padStart(2, "0")} · Dừng</span>
                </button>
                <div style={{ fontSize: 13, color: "var(--ds-primary)", fontWeight: 600 }}>🔴 Đang nghe bạn nói...</div>
              </>
            )}
            {rec === "processing" && (
              <>
                <button
                  disabled
                  className="ds-btn ds-btn-lg"
                  style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56 }}
                >
                  <i className="pi pi-spinner" style={{ fontSize: 18, animation: "spin 1s linear infinite" }} />
                  <span>Đang chấm điểm...</span>
                </button>
                <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Đang gửi lên Azure Speech để phân tích</div>
              </>
            )}
          </div>
        </div>

        {rec === "result" && result && (
          <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ font: "700 18px var(--font-display)" }}>Kết quả phát âm</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Bố cục:</span>
                <div style={{ display: "inline-flex", background: "var(--ds-surface-muted)", borderRadius: "var(--ds-radius-full)", padding: 3 }}>
                  <button
                    onClick={() => setLayout("A")}
                    style={{
                      ...segBtnBase,
                      background: layout === "A" ? "#fff" : "transparent",
                      color: layout === "A" ? "var(--ds-primary)" : "var(--ds-text-muted)",
                      boxShadow: layout === "A" ? "var(--ds-shadow-xs)" : "none",
                    }}
                  >
                    A · Tổng quan
                  </button>
                  <button
                    onClick={() => setLayout("B")}
                    style={{
                      ...segBtnBase,
                      background: layout === "B" ? "#fff" : "transparent",
                      color: layout === "B" ? "var(--ds-primary)" : "var(--ds-text-muted)",
                      boxShadow: layout === "B" ? "var(--ds-shadow-xs)" : "none",
                    }}
                  >
                    B · Theo từ
                  </button>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: "var(--ds-success-bg)",
                border: "1px solid var(--ds-success-border)",
                borderRadius: "var(--ds-radius-lg)",
                color: "var(--ds-success)",
              }}
            >
              <i className="pi pi-check-circle" style={{ fontSize: 18 }} />
              <span style={{ fontSize: 14, color: "var(--ds-text)", flex: 1 }}>
                Bạn nói: <b>{result.recognizedText ?? "(không nhận diện được)"}</b>
              </span>
              <audio controls src={resolveAudioUrl(result.audioUrl)} style={{ height: 32 }} />
            </div>

            {layout === "A" ? (
              <div className="fade" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
                <div className="ds-card" style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
                  <div style={{ display: "flex", gap: 22 }}>
                    <div style={{ position: "relative", width: 118, height: 118 }}>
                      <ProgressRing pct={result.overallScore} color={scoreColor(result.overallScore)} size={118} strokeWidth={11} />
                      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
                        <div>
                          <div style={{ font: "700 26px var(--font-display)" }}>{Math.round(result.overallScore)}</div>
                          <div style={{ fontSize: 11, color: "var(--ds-text-muted)" }}>Chính xác</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ position: "relative", width: 118, height: 118 }}>
                      <ProgressRing pct={result.fluencyScore} color={scoreColor(result.fluencyScore)} size={118} strokeWidth={11} />
                      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
                        <div>
                          <div style={{ font: "700 26px var(--font-display)" }}>{Math.round(result.fluencyScore)}</div>
                          <div style={{ fontSize: 11, color: "var(--ds-text-muted)" }}>Trôi chảy</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ width: "100%", borderTop: "1px solid var(--ds-border-subtle)", paddingTop: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)", marginBottom: 10 }}>
                      Âm cần luyện thêm
                    </div>
                    {phonemes.length === 0 && (
                      <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Không có dữ liệu phoneme</div>
                    )}
                    {phonemes.map((p, i) => (
                      <div key={`${p.sym}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                        <span style={{ font: "700 15px var(--font-display)", width: 34, color: "var(--ds-text)" }}>{p.sym}</span>
                        <div style={{ flex: 1, height: 8, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 99, background: p.color, width: `${p.score}%` }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, width: 30, textAlign: "right", color: p.color }}>{p.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ds-card" style={{ padding: 26 }}>
                  <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 14 }}>Từng từ (màu theo độ chính xác)</div>
                  <div style={{ font: "600 26px/1.9 var(--font-display)", display: "flex", flexWrap: "wrap", gap: "2px 4px" }}>
                    {words.map((w, i) => (
                      <span
                        key={i}
                        title={w.errLabel}
                        style={{ display: "inline-block", padding: "2px 5px", borderRadius: 6, color: w.color, background: w.colorSoft }}
                      >
                        {w.text}
                      </span>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      marginTop: 20,
                      paddingTop: 16,
                      borderTop: "1px solid var(--ds-border-subtle)",
                      fontSize: 12,
                      color: "var(--ds-text-muted)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: "#16A34A" }} />
                      Tốt
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: "#EA580C" }} />
                      Khá
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: "#DC2626" }} />
                      Cần luyện
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="fade" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
                <div className="ds-card" style={{ padding: 28 }}>
                  <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 18 }}>
                    Đọc lại từng từ — màu theo độ chính xác thực tế
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 12px" }}>
                    {words.map((w, i) => (
                      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <span style={{ font: "600 24px var(--font-display)", color: w.color }}>{w.text}</span>
                        <div style={{ width: 46, height: 5, borderRadius: 99, background: w.colorSoft }}>
                          <div style={{ height: "100%", borderRadius: 99, background: w.color, width: `${w.score}%` }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: w.color }}>{w.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Độ chính xác</span>
                      <span style={{ font: "700 18px var(--font-display)", color: scoreColor(result.overallScore) }}>
                        {Math.round(result.overallScore)}
                      </span>
                    </div>
                    <div style={{ height: 9, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: scoreColor(result.overallScore), width: `${result.overallScore}%` }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Độ trôi chảy</span>
                      <span style={{ font: "700 18px var(--font-display)", color: scoreColor(result.fluencyScore) }}>
                        {Math.round(result.fluencyScore)}
                      </span>
                    </div>
                    <div style={{ height: 9, background: "var(--ds-surface-muted)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: scoreColor(result.fluencyScore), width: `${result.fluencyScore}%` }} />
                    </div>
                  </div>
                  <div className="ds-card" style={{ padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-text-secondary)", marginBottom: 12 }}>Âm cần luyện</div>
                    {phonemes.map((p, i) => (
                      <div
                        key={`${p.sym}-${i}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "7px 0",
                          borderBottom: "1px solid var(--ds-border-subtle)",
                        }}
                      >
                        <span style={{ font: "700 15px var(--font-display)" }}>{p.sym}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: p.color }}>{p.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={retryRecord} className="ds-btn ds-btn-outline">
                <i className="pi pi-refresh" />
                <span>Thử lại</span>
              </button>
              <button onClick={nextSentence} className="ds-btn">
                <span>Câu tiếp theo</span>
                <i className="pi pi-arrow-right" />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
