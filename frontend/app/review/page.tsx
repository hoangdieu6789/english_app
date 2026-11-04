"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BandGoalForm } from "@/components/band-goal-form";
import { phonemeToIpa } from "@/lib/phonemes";
import {
  addNewWords,
  goalsQuery,
  gradeReviewWord,
  removeReviewWord,
  reviewQuery,
  submitReviewAttempt,
  type ReviewAttempt,
  type ReviewWord,
} from "@/lib/review-api";
import { scoreColor } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";
import { useRecorder } from "@/lib/use-recorder";

// A word is a short recording; stop by itself after a few seconds.
const MAX_WORD_SECONDS = 5;
const NEW_WORDS_PER_BATCH = 10;

type Phase = "ready" | "recording" | "scoring" | "result" | "error";

const RATINGS: { q: 1 | 3 | 4 | 5; label: string; color: string }[] = [
  { q: 1, label: "Quên", color: "var(--ds-danger)" },
  { q: 3, label: "Khó", color: "var(--ds-warning)" },
  { q: 4, label: "Nhớ", color: "var(--ds-primary)" },
  { q: 5, label: "Dễ", color: "var(--ds-success)" },
];

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

// Two kinds of spaced-repetition cards (SM-2 on the backend):
// - pronunciation: a word the learner said wrongly; Azure scores each try and schedules it.
// - vocab: a new word for the learner's band range; the learner reveals the meaning and
//   rates how well they remembered it (saying it aloud is scored but does not schedule it).
export default function ReviewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery(reviewQuery);
  const goals = useQuery(goalsQuery);
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<ReviewAttempt | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [editGoals, setEditGoals] = useState(false);

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

  function resetCard() {
    setResult(null);
    setRevealed(false);
    setPhase("ready");
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
    resetCard();
    setDone((n) => n + 1);
    queryClient.invalidateQueries({ queryKey: ["review"] });
  }

  async function rate(q: 1 | 3 | 4 | 5) {
    if (!current) return;
    try {
      await gradeReviewWord(current.id, q);
      next();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Không lưu được.");
    }
  }

  async function remove() {
    if (!current) return;
    try {
      await removeReviewWord(current.id);
      resetCard();
      queryClient.invalidateQueries({ queryKey: ["review"] });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Không bỏ được từ này.");
    }
  }

  async function addWords() {
    setAdding(true);
    setAddMsg(null);
    try {
      const added = await addNewWords(NEW_WORDS_PER_BATCH);
      setAddMsg(`Đã thêm ${added.length} từ mới: ${added.map((w) => w.word).join(", ")}.`);
      queryClient.invalidateQueries({ queryKey: ["review"] });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : "Không thêm được từ mới.");
    } finally {
      setAdding(false);
    }
  }

  const word = result?.word ?? current;
  const isVocab = current?.kind === "vocab";
  const g = goals.data;

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* New words for the learner's band range */}
        <div className="ds-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ font: "700 16px var(--font-display)" }}>Từ mới theo band</div>
              {g && (
                <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginTop: 3 }}>
                  Band hiện tại {g.currentBand.toFixed(1)}
                  {g.measuredBand > 0 ? " (đo từ bài làm)" : g.selfBand != null ? " (ước lượng)" : " (mặc định)"} · mục tiêu{" "}
                  {g.targetBand != null ? g.targetBand.toFixed(1) : "chưa đặt"} · từ band {(g.bandFrom + 0.5).toFixed(1)}–{g.bandTo.toFixed(1)} · còn{" "}
                  {g.remaining} từ
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => setEditGoals((v) => !v)}>
                {editGoals ? "Đóng" : "Đổi mục tiêu"}
              </button>
              <button className="ds-btn ds-btn-sm" onClick={addWords} disabled={adding || !g || g.remaining === 0}>
                {adding ? "AI đang soạn nghĩa..." : `Thêm ${NEW_WORDS_PER_BATCH} từ mới`}
              </button>
            </div>
          </div>
          {g && (editGoals || g.targetBand == null) && (
            <BandGoalForm goals={g} compact={g.targetBand != null} onSaved={() => setEditGoals(false)} />
          )}
          {addMsg && <div style={{ fontSize: 13, color: "var(--ds-text-secondary)" }}>{addMsg}</div>}
        </div>

        {data && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ds-text-muted)" }}>
            <span>
              {data.dueCount > 0 ? `${data.dueCount} thẻ đến hạn ôn` : "Không còn thẻ đến hạn"}
              {done > 0 && ` · đã ôn ${done} thẻ`}
            </span>
            <span>{data.total} thẻ trong danh sách ôn</span>
          </div>
        )}

        <div className="ds-card" style={{ padding: 32, minHeight: 300, display: "flex", flexDirection: "column", gap: 16 }}>
          {isLoading && <div style={{ fontSize: 14, color: "var(--ds-text-muted)" }}>Đang tải...</div>}
          {isError && <div style={{ fontSize: 14, color: "var(--ds-danger)" }}>Không tải được danh sách ôn. Thử tải lại trang.</div>}

          {data && !word && (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", margin: "auto 0" }}>
              <div style={{ font: "700 20px var(--font-display)" }}>{data.total === 0 ? "Chưa có thẻ nào cần ôn" : "Xong các thẻ đến hạn hôm nay"}</div>
              <div style={{ fontSize: 14, color: "var(--ds-text-muted)", maxWidth: 460, lineHeight: 1.6 }}>
                {data.total === 0
                  ? "Thêm từ mới theo band ở trên. Từ bạn phát âm sai nhiều lần khi luyện nói cũng sẽ vào đây."
                  : `Thẻ tiếp theo đến hạn ${data.upcoming[0] ? dueText(data.upcoming[0].dueAt) : "sau"}.`}
              </div>
              <button className="ds-btn" onClick={() => router.push("/practice")}>
                <i className="pi pi-microphone" />
                <span>Luyện nói</span>
              </button>
            </div>
          )}

          {word && current && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ds-text-muted)" }}>
                <span
                  style={{
                    padding: "2px 9px",
                    borderRadius: 99,
                    fontWeight: 600,
                    background: isVocab ? "var(--ds-primary-50)" : "var(--ds-warning-bg)",
                    color: isVocab ? "var(--ds-primary)" : "var(--ds-warning)",
                  }}
                >
                  {isVocab ? `Từ mới · band ${current.vocab?.band.toFixed(1) ?? ""}` : `Phát âm · sai ${current.misses} lần`}
                </span>
                <span>{word.reps > 0 ? `Đã nhớ ${word.reps} lần liên tiếp` : word.lapses > 0 ? `Quên ${word.lapses} lần` : "Thẻ mới"}</span>
              </div>

              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                <div style={{ font: "700 40px var(--font-display)", color: "var(--ds-text)" }}>{current.word}</div>
                {current.vocab?.ipa && <div style={{ fontSize: 16, color: "var(--ds-text-muted)" }}>{current.vocab.ipa}</div>}
                <button className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => speakEnglish(current.word)}>
                  <i className="pi pi-volume-up" />
                  <span>Nghe mẫu</span>
                </button>
              </div>

              {isVocab && current.vocab && !revealed && (
                <button className="ds-btn ds-btn-lg" onClick={() => setRevealed(true)}>
                  <span>Bạn nhớ nghĩa từ này chứ? Hiện nghĩa</span>
                </button>
              )}
              {isVocab && current.vocab && revealed && (
                <div style={{ background: "var(--ds-surface-subtle)", borderRadius: "var(--ds-radius-lg)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 16 }}>
                    <i style={{ color: "var(--ds-text-muted)" }}>{current.vocab.pos}</i> · <b>{current.vocab.meaningVi}</b>
                  </div>
                  <div style={{ fontSize: 14.5, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <button
                      onClick={() => speakEnglish(current.vocab!.exampleEn)}
                      title="Nghe câu ví dụ"
                      aria-label="Nghe câu ví dụ"
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ds-primary)", padding: 0 }}
                    >
                      <i className="pi pi-volume-up" />
                    </button>
                    <span>{current.vocab.exampleEn}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--ds-text-muted)" }}>{current.vocab.exampleVi}</div>
                </div>
              )}

              {/* Saying the word: scheduled by Azure for pronunciation cards, practice only for vocab cards. */}
              {(!isVocab || revealed) && phase === "ready" && (
                <button
                  onClick={startRecording}
                  className={isVocab ? "ds-btn ds-btn-outline" : "ds-btn ds-btn-lg"}
                  style={{ alignSelf: "center", borderRadius: "var(--ds-radius-full)", padding: "0 24px" }}
                >
                  <i className="pi pi-microphone" />
                  <span>{isVocab ? "Đọc to để chấm phát âm" : `Nhấn rồi đọc "${current.word}"`}</span>
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
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  <div style={{ font: "700 26px var(--font-display)", color: scoreColor(result.score) }}>
                    {Math.round(result.score)}/100{!isVocab && ` · ${result.passed ? "Đạt" : "Chưa đạt"}`}
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
                  {!isVocab && <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>{nextReviewText(result.word)}</div>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="ds-btn ds-btn-outline" onClick={() => setPhase("ready")}>
                      <i className="pi pi-refresh" />
                      <span>Đọc lại</span>
                    </button>
                    {!isVocab && (
                      <button className="ds-btn" onClick={next}>
                        <span>Thẻ tiếp theo</span>
                        <i className="pi pi-arrow-right" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isVocab && revealed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Bạn nhớ từ này thế nào?</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    {RATINGS.map((r) => (
                      <button key={r.q} onClick={() => rate(r.q)} className="ds-btn ds-btn-outline" style={{ color: r.color, borderColor: r.color }}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {phase === "ready" && (
                <button
                  onClick={remove}
                  style={{ alignSelf: "center", border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "var(--ds-text-muted)" }}
                >
                  {isVocab ? "Tôi đã biết từ này, bỏ khỏi danh sách ôn" : "Tôi đã nói đúng từ này, bỏ khỏi danh sách ôn"}
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
                <span style={{ flex: 1, fontWeight: 600 }}>
                  {w.word}
                  {w.vocab && <span style={{ fontWeight: 400, color: "var(--ds-text-muted)" }}> · {w.vocab.meaningVi}</span>}
                </span>
                <span style={{ color: "var(--ds-text-muted)", fontSize: 12 }}>{w.kind === "vocab" ? "từ mới" : "phát âm"}</span>
                <span style={{ color: "var(--ds-text-muted)", minWidth: 110, textAlign: "right" }}>{dueText(w.dueAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
