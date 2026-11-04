"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { phonemeToIpa } from "@/lib/phonemes";
import { removeReviewWord, reviewQuery, submitReviewAttempt, type ReviewAttempt, type ReviewWord } from "@/lib/review-api";
import { scoreColor } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";
import { useRecorder } from "@/lib/use-recorder";

// A word is a short recording; stop by itself after a few seconds.
const MAX_WORD_SECONDS = 5;

type Phase = "ready" | "recording" | "scoring" | "result" | "error";

function nextReviewText(w: ReviewWord): string {
  if (w.intervalDays <= 0) return "Ôn lại sau ít phút";
  if (w.intervalDays === 1) return "Ôn lại vào ngày mai";
  return `Ôn lại sau ${w.intervalDays} ngày`;
}

function dueText(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} phút nữa`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ nữa`;
  return d.toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "numeric" });
}

// Spaced-repetition review of the words the learner said wrongly: listen, say the word,
// Azure scores it against the word, and a good score pushes the next review further out
// (SM-2 on the backend). A word comes back whenever it is said wrongly again in practice.
export default function ReviewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery(reviewQuery);
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<ReviewAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const current = data?.due[0];
  const recorder = useRecorder(
    MAX_WORD_SECONDS,
    (wav) => score(wav),
    (err) => fail(err.message),
  );

  function fail(message: string) {
    setError(message);
    setPhase("error");
  }

  async function startRecording() {
    setError(null);
    try {
      await recorder.start();
      setPhase("recording");
    } catch {
      fail("Không truy cập được microphone. Kiểm tra quyền trình duyệt.");
    }
  }

  function stopRecording() {
    try {
      const wav = recorder.stop();
      if (wav) score(wav);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Không thu được âm thanh.");
    }
  }

  async function score(wav: Blob) {
    if (!current) return;
    setPhase("scoring");
    try {
      setResult(await submitReviewAttempt(current.id, wav));
      setPhase("result");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Chấm điểm thất bại. Thử lại.");
    }
  }

  function next() {
    setResult(null);
    setPhase("ready");
    setDone((n) => n + 1);
    queryClient.invalidateQueries({ queryKey: ["review"] });
  }

  async function remove() {
    if (!current) return;
    try {
      await removeReviewWord(current.id);
      setResult(null);
      setPhase("ready");
      queryClient.invalidateQueries({ queryKey: ["review"] });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Không bỏ được từ này.");
    }
  }

  const word = result?.word ?? current;

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {data && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ds-text-muted)" }}>
            <span>
              {data.dueCount > 0 ? `${data.dueCount} từ đến hạn ôn` : "Không còn từ đến hạn"}
              {done > 0 && ` · đã ôn ${done} từ`}
            </span>
            <span>{data.total} từ trong danh sách ôn</span>
          </div>
        )}

        <div className="ds-card" style={{ padding: 32, minHeight: 300, display: "flex", flexDirection: "column", gap: 16 }}>
          {isLoading && <div style={{ fontSize: 14, color: "var(--ds-text-muted)" }}>Đang tải...</div>}
          {isError && <div style={{ fontSize: 14, color: "var(--ds-danger)" }}>Không tải được danh sách ôn. Thử tải lại trang.</div>}

          {data && !word && (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", margin: "auto 0" }}>
              <div style={{ font: "700 20px var(--font-display)" }}>
                {data.total === 0 ? "Chưa có từ nào cần ôn" : "Xong các từ đến hạn hôm nay"}
              </div>
              <div style={{ fontSize: 14, color: "var(--ds-text-muted)", maxWidth: 440, lineHeight: 1.6 }}>
                {data.total === 0
                  ? "Khi bạn luyện nói, các từ Azure chấm sai hoặc dưới 60 điểm sẽ vào đây để ôn theo lịch nhắc lại."
                  : `Từ tiếp theo đến hạn ${data.upcoming[0] ? dueText(data.upcoming[0].dueAt) : "sau"}.`}
              </div>
              <button className="ds-btn" onClick={() => router.push("/practice")}>
                <i className="pi pi-microphone" />
                <span>Luyện nói</span>
              </button>
            </div>
          )}

          {word && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ds-text-muted)" }}>
                <span>
                  Lần trước: <b style={{ color: scoreColor((current ?? word).lastScore) }}>{Math.round((current ?? word).lastScore)}</b>/100
                </span>
                <span>{word.reps > 0 ? `Đã nhớ ${word.reps} lần liên tiếp` : word.lapses > 0 ? `Quên ${word.lapses} lần` : "Từ mới"}</span>
              </div>

              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                <div style={{ font: "700 40px var(--font-display)", color: "var(--ds-text)" }}>{word.word}</div>
                <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => speakEnglish(word.word)}>
                  <i className="pi pi-volume-up" />
                  <span>Nghe mẫu</span>
                </button>
              </div>

              {phase === "ready" && (
                <button onClick={startRecording} className="ds-btn ds-btn-lg" style={{ alignSelf: "center", borderRadius: "var(--ds-radius-full)", padding: "0 28px" }}>
                  <i className="pi pi-microphone" />
                  <span>Nhấn rồi đọc &quot;{word.word}&quot;</span>
                </button>
              )}
              {phase === "recording" && (
                <button
                  onClick={stopRecording}
                  className="ds-btn ds-btn-lg"
                  style={{ alignSelf: "center", borderRadius: "var(--ds-radius-full)", padding: "0 28px", animation: "recpulse 1.6s infinite" }}
                >
                  <i className="pi pi-stop-circle" />
                  <span>Dừng ({MAX_WORD_SECONDS - recorder.secs}s)</span>
                </button>
              )}
              {phase === "recording" && recorder.quiet && (
                <div style={{ textAlign: "center", fontSize: 13, color: "var(--ds-warning)" }}>Micro gần như không thu được tiếng. Nói to hơn.</div>
              )}
              {phase === "scoring" && (
                <div style={{ textAlign: "center", fontSize: 14, color: "var(--ds-text-muted)" }}>
                  <i className="pi pi-spinner" style={{ animation: "spin 1s linear infinite", marginRight: 6 }} />
                  Azure đang chấm...
                </div>
              )}
              {phase === "error" && (
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</div>
                  <button className="ds-btn ds-btn-outline" onClick={() => setPhase("ready")}>
                    Thử lại
                  </button>
                </div>
              )}
              {phase === "result" && result && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                  <div style={{ font: "700 30px var(--font-display)", color: scoreColor(result.score) }}>
                    {Math.round(result.score)}/100 · {result.passed ? "Đạt" : "Chưa đạt"}
                  </div>
                  {result.phonemes.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                      {result.phonemes.map((p, i) => (
                        <span
                          key={i}
                          title={`${Math.round(p.score)}/100`}
                          style={{ padding: "3px 8px", borderRadius: 8, background: "var(--ds-surface-subtle)", color: scoreColor(p.score), fontWeight: 600, fontSize: 14 }}
                        >
                          {phonemeToIpa(p.phoneme)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>{nextReviewText(result.word)}</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="ds-btn ds-btn-outline" onClick={() => setPhase("ready")}>
                      <i className="pi pi-refresh" />
                      <span>Đọc lại</span>
                    </button>
                    <button className="ds-btn" onClick={next}>
                      <span>Từ tiếp theo</span>
                      <i className="pi pi-arrow-right" />
                    </button>
                  </div>
                </div>
              )}

              {phase === "ready" && (
                <button
                  onClick={remove}
                  style={{ alignSelf: "center", border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "var(--ds-text-muted)" }}
                >
                  Tôi đã nói đúng từ này, bỏ khỏi danh sách ôn
                </button>
              )}
            </>
          )}
        </div>

        {data && data.upcoming.length > 0 && (
          <div className="ds-card" style={{ padding: 22 }}>
            <div style={{ font: "700 15px var(--font-display)", marginBottom: 8 }}>Sắp đến hạn</div>
            {data.upcoming.map((w) => (
              <div key={w.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--ds-border-subtle)", fontSize: 14 }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{w.word}</span>
                <span style={{ color: scoreColor(w.lastScore), fontWeight: 600 }}>{Math.round(w.lastScore)}</span>
                <span style={{ color: "var(--ds-text-muted)", minWidth: 110, textAlign: "right" }}>{dueText(w.dueAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
