"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Waveform } from "@/components/charts/waveform";
import { RubricPanel } from "@/components/rubric-panel";
import {
  PART_INFO,
  cueCardText,
  fetchNextQuestionSet,
  listQuestionSets,
  type IeltsPart,
  type QuestionSet,
} from "@/lib/ielts-api";
import {
  fetchPronunciationAttempt,
  submitPronunciationAttempt,
  resolveAudioUrl,
  type PronunciationAttempt,
} from "@/lib/pronunciation-api";
import { scoreColor } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";
import { MAX_ANSWER_SECONDS, formatSecs, useRecorder } from "@/lib/use-recorder";

const PREP_SECONDS = 60; // Part 2 preparation time, as in the real test

type Phase = "ready" | "prep" | "recording" | "processing" | "result" | "error";

export function IeltsPractice({ part }: { part: IeltsPart }) {
  const queryClient = useQueryClient();
  // Each request asks the backend for a set this learner has not done (exclude = set on screen).
  const [request, setRequest] = useState<{ n: number; exclude?: string }>({ n: 0 });
  const [picked, setPicked] = useState<QuestionSet | null>(null); // a done set chosen to redo
  const [showDone, setShowDone] = useState(false);
  const next = useQuery({
    queryKey: ["ielts-next", part, request],
    queryFn: () => fetchNextQuestionSet(part, request.exclude),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const doneSets = useQuery({
    queryKey: ["ielts-sets", part],
    queryFn: () => listQuestionSets(part),
    enabled: showDone,
  });
  const set = picked ?? next.data?.set ?? null;
  const [qIndex, setQIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const [notes, setNotes] = useState("");
  const [waitSecs, setWaitSecs] = useState(0);
  const [result, setResult] = useState<PronunciationAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const question = !set ? "" : part === "part2" ? set.prompt : (set.questions[qIndex] ?? "");
  const taskPrompt = set && part === "part2" ? cueCardText(set) : question;

  const recorder = useRecorder(
    MAX_ANSWER_SECONDS,
    (wav) => submit(wav),
    (err) => {
      setError(err.message);
      setPhase("error");
    },
  );

  function clearTimers() {
    if (prepRef.current) clearInterval(prepRef.current);
    if (waitRef.current) clearInterval(waitRef.current);
    prepRef.current = waitRef.current = null;
  }
  useEffect(() => () => clearTimers(), []);

  function reset() {
    clearTimers();
    recorder.cancel();
    setPhase("ready");
    setResult(null);
    setError(null);
    setPrepLeft(PREP_SECONDS);
    setNotes("");
  }

  function startPrep() {
    setPhase("prep");
    setPrepLeft(PREP_SECONDS);
    prepRef.current = setInterval(() => {
      setPrepLeft((s) => {
        if (s <= 1) {
          if (prepRef.current) clearInterval(prepRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function startRecording() {
    clearTimers();
    setError(null);
    try {
      await recorder.start();
      setPhase("recording");
    } catch {
      setError("Không truy cập được microphone. Kiểm tra quyền trình duyệt.");
      setPhase("error");
    }
  }

  async function submit(wav: Blob) {
    setPhase("processing");
    setWaitSecs(0);
    const startedAt = Date.now();
    waitRef.current = setInterval(() => setWaitSecs(Math.floor((Date.now() - startedAt) / 1000)), 500);
    try {
      const attempt = await submitPronunciationAttempt(wav, "", { type: part, prompt: taskPrompt, questionSetId: set?.id });
      setResult(attempt);
      setPhase("result");
      queryClient.invalidateQueries({ queryKey: ["ielts-sets", part] });
      queryClient.invalidateQueries({ queryKey: ["progress-summary"] });
      // The AI grades FC/LR/GRA in the background: keep the timer running until it is done.
      if (attempt.gradingStatus !== "pending") stopWaitTimer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chấm điểm thất bại. Thử lại.");
      setPhase("error");
      stopWaitTimer();
    }
  }

  function stopWaitTimer() {
    if (waitRef.current) clearInterval(waitRef.current);
    waitRef.current = null;
  }

  // Poll the attempt while the AI is still grading; the panel fills in when it is done.
  const graded = useQuery({
    queryKey: ["attempt", result?.id],
    queryFn: async () => {
      const a = await fetchPronunciationAttempt(result!.id);
      if (a.gradingStatus !== "pending") {
        stopWaitTimer();
        queryClient.invalidateQueries({ queryKey: ["progress-summary"] });
        queryClient.invalidateQueries({ queryKey: ["ielts-sets", part] });
      }
      return a;
    },
    enabled: result?.gradingStatus === "pending",
    refetchInterval: (q) => (q.state.data && q.state.data.gradingStatus !== "pending" ? false : 2000),
    gcTime: 0,
  });
  const shown = result && graded.data?.id === result.id ? graded.data : result;
  const pendingSecs = shown?.gradingStatus === "pending" ? waitSecs : undefined;

  function stopRecording() {
    try {
      const wav = recorder.stop();
      if (wav) submit(wav);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thu được âm thanh.");
      setPhase("error");
    }
  }

  function newSet() {
    reset();
    setPicked(null);
    setQIndex(0);
    setRequest((r) => ({ n: r.n + 1, exclude: set?.id }));
  }

  function nextQuestion() {
    if (set && part !== "part2" && qIndex + 1 < set.questions.length) {
      reset();
      setQIndex(qIndex + 1);
    } else newSet();
  }

  function redo(s: QuestionSet) {
    reset();
    setPicked(s);
    setQIndex(0);
    setShowDone(false);
  }

  const busy = phase === "recording" || phase === "processing";
  const info = PART_INFO[part];
  const done = (doneSets.data ?? []).filter((s) => s.attemptCount > 0);

  if (!set) {
    return (
      <div className="ds-card" style={{ padding: 26, textAlign: "center", color: "var(--ds-text-muted)" }}>
        {next.isError ? (
          <>
            <div style={{ color: "var(--ds-danger)", marginBottom: 12 }}>Không tải được đề. {next.error.message}</div>
            <button onClick={() => next.refetch()} className="ds-btn ds-btn-outline ds-btn-sm">
              <i className="pi pi-refresh" />
              <span>Thử lại</span>
            </button>
          </>
        ) : (
          <span>
            <i className="pi pi-spinner" style={{ animation: "spin 1s linear infinite", marginRight: 8 }} />
            Đang lấy đề chưa làm...
          </span>
        )}
      </div>
    );
  }

  const badge = picked
    ? { text: "Làm lại", bg: "var(--ds-warning-bg)", fg: "var(--ds-warning)" }
    : next.data?.seen
      ? { text: "Ôn lại · đã làm hết đề", bg: "var(--ds-warning-bg)", fg: "var(--ds-warning)" }
      : set.source === "generated"
        ? { text: "Đề mới", bg: "var(--ds-success-bg)", fg: "var(--ds-success)" }
        : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ds-card" style={{ padding: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 99,
                background: "var(--ds-info-bg)",
                color: "var(--ds-info)",
              }}
            >
              {info.title}
            </span>
            <span style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>
              Chủ đề: {set.topic}
              {part !== "part2" && ` · Câu ${qIndex + 1}/${set.questions.length}`}
            </span>
            {badge && (
              <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: badge.bg, color: badge.fg }}>
                {badge.text}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setShowDone((v) => !v)} disabled={busy} className="ds-btn ds-btn-text ds-btn-sm" aria-expanded={showDone}>
              <i className="pi pi-history" />
              <span>Đề đã làm</span>
            </button>
            <button onClick={newSet} disabled={busy} className="ds-btn ds-btn-text ds-btn-sm">
              <span>Chủ đề khác</span>
              <i className="pi pi-refresh" />
            </button>
          </div>
        </div>

        {next.data && !picked && (
          <div style={{ fontSize: 12, color: "var(--ds-text-muted)", marginTop: -10, marginBottom: 14 }}>
            {next.data.seen ? "Đang tìm thêm đề mới cho bạn" : `Còn ${next.data.unseenCount} bộ đề chưa làm ở ${info.title.split(" · ")[0]}`}
          </div>
        )}

        {showDone && (
          <div
            style={{
              marginBottom: 18,
              padding: 12,
              borderRadius: "var(--ds-radius-md)",
              background: "var(--ds-surface-subtle)",
              border: "1px solid var(--ds-border-subtle)",
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {doneSets.isLoading ? (
              <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Đang tải...</div>
            ) : done.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Bạn chưa làm bộ đề nào ở phần này.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {done.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => redo(s)}
                    className="ds-btn ds-btn-text ds-btn-sm"
                    style={{ justifyContent: "space-between", width: "100%", textAlign: "left" }}
                  >
                    <span>{s.topic}</span>
                    <span style={{ fontSize: 12, color: "var(--ds-text-muted)", whiteSpace: "nowrap" }}>
                      {s.attemptCount} lần
                      {s.bestBand != null && ` · cao nhất ${s.bestBand}`}
                      {s.lastAttemptAt && ` · ${new Date(s.lastAttemptAt).toLocaleDateString("vi-VN")}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: "center", padding: "4px 0" }}>
          <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 8 }}>{info.hint}</div>
          <div style={{ font: "600 26px/1.4 var(--font-display)", color: "var(--ds-text)" }}>{question}</div>
          {part === "part2" && (
            <div style={{ display: "inline-block", textAlign: "left", marginTop: 12, fontSize: 15, color: "var(--ds-text-secondary)" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>You should say:</div>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, listStyle: "disc" }}>
                {set.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {part === "part3" && (
            <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginTop: 8 }}>Liên quan tới Part 2: {set.prompt}</div>
          )}
          <div>
            <button onClick={() => speakEnglish(question)} className="ds-btn ds-btn-outline ds-btn-sm" style={{ marginTop: 14 }}>
              <i className="pi pi-volume-up" />
              <span>Nghe câu hỏi</span>
            </button>
          </div>
        </div>

        {phase === "prep" && (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: prepLeft > 0 ? "var(--ds-text-secondary)" : "var(--ds-primary)" }}>
              {prepLeft > 0 ? `Thời gian chuẩn bị: ${formatSecs(prepLeft)}` : "Hết giờ chuẩn bị — bắt đầu nói"}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi vài từ khoá cho từng ý (không được chấm)"
              rows={4}
              style={{
                width: "100%",
                padding: 12,
                fontSize: 14,
                fontFamily: "inherit",
                borderRadius: "var(--ds-radius-md)",
                border: "1px solid var(--ds-border-subtle)",
                background: "var(--ds-surface-subtle)",
                resize: "vertical",
              }}
            />
          </div>
        )}

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
            <Waveform active={phase === "recording"} />
          </div>

          {(phase === "ready" || phase === "error") && (
            <>
              <div style={{ display: "flex", gap: 10 }}>
                {part === "part2" && (
                  <button onClick={startPrep} className="ds-btn ds-btn-outline ds-btn-lg" style={{ borderRadius: "var(--ds-radius-full)", height: 56 }}>
                    <i className="pi pi-clock" />
                    <span>Chuẩn bị 1 phút</span>
                  </button>
                )}
                <button onClick={startRecording} className="ds-btn ds-btn-lg" style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56 }}>
                  <i className="pi pi-microphone" style={{ fontSize: 18 }} />
                  <span>Nhấn để trả lời</span>
                </button>
              </div>
              {error ? (
                <div style={{ fontSize: 13, color: "var(--ds-danger)" }}>{error}</div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>Mỗi câu trả lời ghi tối đa {MAX_ANSWER_SECONDS} giây</div>
              )}
            </>
          )}
          {phase === "prep" && (
            <button onClick={startRecording} className="ds-btn ds-btn-lg" style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56 }}>
              <i className="pi pi-microphone" style={{ fontSize: 18 }} />
              <span>{prepLeft > 0 ? "Bắt đầu nói ngay" : "Bắt đầu nói"}</span>
            </button>
          )}
          {phase === "recording" && (
            <>
              <button
                onClick={stopRecording}
                className="ds-btn ds-btn-lg"
                style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56, animation: "recpulse 1.6s infinite" }}
              >
                <i className="pi pi-stop-circle" style={{ fontSize: 18 }} />
                <span>
                  Đang ghi âm {formatSecs(recorder.secs)} / {formatSecs(MAX_ANSWER_SECONDS)} · Dừng
                </span>
              </button>
              <div style={{ width: 220, height: 6, borderRadius: 99, background: "var(--ds-surface-muted)", overflow: "hidden" }} title="Mức âm thanh micro">
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.round(recorder.level * 400))}%`,
                    background: recorder.quiet ? "var(--ds-danger)" : "var(--ds-success)",
                    transition: "width .2s",
                  }}
                />
              </div>
              {recorder.quiet ? (
                <div style={{ fontSize: 13, color: "var(--ds-danger)", fontWeight: 600, textAlign: "center", maxWidth: 460 }}>
                  Micro gần như không thu được tiếng. Kiểm tra micro đang chọn hoặc nói to hơn.
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--ds-primary)", fontWeight: 600 }}>
                  {recorder.secs >= MAX_ANSWER_SECONDS - 10 ? "Sắp hết thời gian, hãy kết thúc ý" : "🔴 Đang nghe bạn nói..."}
                </div>
              )}
            </>
          )}
          {phase === "processing" && (
            <>
              <button disabled className="ds-btn ds-btn-lg" style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56 }}>
                <i className="pi pi-spinner" style={{ fontSize: 18, animation: "spin 1s linear infinite" }} />
                <span>Đang chấm điểm... {waitSecs}s</span>
              </button>
              <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>
                Azure chấm phát âm (thường 3–10 giây); AI chấm trôi chảy, từ vựng, ngữ pháp tiếp ngay sau đó
              </div>
            </>
          )}
        </div>
      </div>

      {phase === "result" && shown && (
        <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ font: "700 16px var(--font-display)" }}>Bạn đã nói</div>
              <audio controls src={resolveAudioUrl(shown.audioUrl)} style={{ height: 32 }} />
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.7, color: "var(--ds-text)" }}>{shown.recognizedText || "(không nhận diện được)"}</div>
            <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>
              {shown.transcriptSource === "whisper"
                ? "Chép lời bởi Whisper; Azure chấm phát âm từng từ theo bản chép này."
                : "Chép lời bởi Azure; có thể nhận sai từ phát âm chưa rõ."}
            </div>
            <div style={{ display: "flex", gap: 18, fontSize: 13, color: "var(--ds-text-muted)", flexWrap: "wrap" }}>
              <span>
                Chính xác <b style={{ color: scoreColor(shown.overallScore) }}>{Math.round(shown.overallScore)}</b>
              </span>
              <span>
                Trôi chảy <b style={{ color: scoreColor(shown.fluencyScore) }}>{Math.round(shown.fluencyScore)}</b>
              </span>
              {shown.prosodyScore != null && (
                <span>
                  Ngữ điệu <b style={{ color: scoreColor(shown.prosodyScore) }}>{Math.round(shown.prosodyScore)}</b>
                </span>
              )}
              <span>(điểm Azure 0–100)</span>
            </div>
          </div>

          {shown.rubric && <RubricPanel rubric={shown.rubric} grader={shown.grader} pendingSecs={pendingSecs} />}

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button onClick={reset} className="ds-btn ds-btn-outline">
              <i className="pi pi-refresh" />
              <span>Trả lời lại</span>
            </button>
            <button onClick={nextQuestion} className="ds-btn">
              <span>{part === "part2" || qIndex + 1 >= set.questions.length ? "Bộ đề tiếp theo" : "Câu hỏi tiếp theo"}</span>
              <i className="pi pi-arrow-right" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
