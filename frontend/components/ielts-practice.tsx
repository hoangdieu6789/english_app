"use client";

import { useEffect, useRef, useState } from "react";
import { Waveform } from "@/components/charts/waveform";
import { RubricPanel } from "@/components/rubric-panel";
import { CUE_CARDS, PART1_TOPICS, PART_INFO, cueCardText, pick, type IeltsPart } from "@/lib/ielts-questions";
import { submitPronunciationAttempt, resolveAudioUrl, type PronunciationAttempt } from "@/lib/pronunciation-api";
import { scoreColor } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";
import { MAX_ANSWER_SECONDS, formatSecs, useRecorder } from "@/lib/use-recorder";

const PREP_SECONDS = 60; // Part 2 preparation time, as in the real test

type Phase = "ready" | "prep" | "recording" | "processing" | "result" | "error";

export function IeltsPractice({ part }: { part: IeltsPart }) {
  const [topic, setTopic] = useState(() => pick(PART1_TOPICS));
  const [card, setCard] = useState(() => pick(CUE_CARDS));
  const [qIndex, setQIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const [notes, setNotes] = useState("");
  const [waitSecs, setWaitSecs] = useState(0);
  const [result, setResult] = useState<PronunciationAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const question = part === "part1" ? topic.questions[qIndex] : part === "part3" ? card.part3[qIndex] : card.prompt;
  const taskPrompt = part === "part2" ? cueCardText(card) : question;

  const recorder = useRecorder(MAX_ANSWER_SECONDS, (wav) => submit(wav));

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
      const attempt = await submitPronunciationAttempt(wav, "", { type: part, prompt: taskPrompt });
      setResult(attempt);
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chấm điểm thất bại. Thử lại.");
      setPhase("error");
    } finally {
      if (waitRef.current) clearInterval(waitRef.current);
    }
  }

  function stopRecording() {
    try {
      const wav = recorder.stop();
      if (wav) submit(wav);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thu được âm thanh.");
      setPhase("error");
    }
  }

  function nextQuestion() {
    reset();
    if (part === "part1") {
      if (qIndex + 1 < topic.questions.length) setQIndex(qIndex + 1);
      else {
        setTopic(pick(PART1_TOPICS, topic));
        setQIndex(0);
      }
    } else if (part === "part3") {
      if (qIndex + 1 < card.part3.length) setQIndex(qIndex + 1);
      else {
        setCard(pick(CUE_CARDS, card));
        setQIndex(0);
      }
    } else {
      setCard(pick(CUE_CARDS, card));
    }
  }

  function otherTopic() {
    reset();
    setQIndex(0);
    if (part === "part1") setTopic(pick(PART1_TOPICS, topic));
    else setCard(pick(CUE_CARDS, card));
  }

  const busy = phase === "recording" || phase === "processing";
  const info = PART_INFO[part];

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
              Chủ đề: {part === "part1" ? topic.topic : card.topic}
              {part !== "part2" && ` · Câu ${qIndex + 1}/${part === "part1" ? topic.questions.length : card.part3.length}`}
            </span>
          </div>
          <button onClick={otherTopic} disabled={busy} className="ds-btn ds-btn-text ds-btn-sm">
            <span>Chủ đề khác</span>
            <i className="pi pi-refresh" />
          </button>
        </div>

        <div style={{ textAlign: "center", padding: "4px 0" }}>
          <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginBottom: 8 }}>{info.hint}</div>
          <div style={{ font: "600 26px/1.4 var(--font-display)", color: "var(--ds-text)" }}>{question}</div>
          {part === "part2" && (
            <div style={{ display: "inline-block", textAlign: "left", marginTop: 12, fontSize: 15, color: "var(--ds-text-secondary)" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>You should say:</div>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, listStyle: "disc" }}>
                {card.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {part === "part3" && (
            <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginTop: 8 }}>Liên quan tới Part 2: {card.prompt}</div>
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
              <div style={{ fontSize: 13, color: "var(--ds-primary)", fontWeight: 600 }}>
                {recorder.secs >= MAX_ANSWER_SECONDS - 10 ? "Sắp hết thời gian, hãy kết thúc ý" : "🔴 Đang nghe bạn nói..."}
              </div>
            </>
          )}
          {phase === "processing" && (
            <>
              <button disabled className="ds-btn ds-btn-lg" style={{ borderRadius: "var(--ds-radius-full)", padding: "0 30px", height: 56 }}>
                <i className="pi pi-spinner" style={{ fontSize: 18, animation: "spin 1s linear infinite" }} />
                <span>Đang chấm điểm... {waitSecs}s</span>
              </button>
              <div style={{ fontSize: 13, color: "var(--ds-text-muted)" }}>
                Azure chấm phát âm, rồi AI chấm trôi chảy, từ vựng, ngữ pháp (thường 10–30 giây)
              </div>
            </>
          )}
        </div>
      </div>

      {phase === "result" && result && (
        <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ font: "700 16px var(--font-display)" }}>Bạn đã nói</div>
              <audio controls src={resolveAudioUrl(result.audioUrl)} style={{ height: 32 }} />
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.7, color: "var(--ds-text)" }}>{result.recognizedText || "(không nhận diện được)"}</div>
            <div style={{ display: "flex", gap: 18, fontSize: 13, color: "var(--ds-text-muted)", flexWrap: "wrap" }}>
              <span>
                Chính xác <b style={{ color: scoreColor(result.overallScore) }}>{Math.round(result.overallScore)}</b>
              </span>
              <span>
                Trôi chảy <b style={{ color: scoreColor(result.fluencyScore) }}>{Math.round(result.fluencyScore)}</b>
              </span>
              {result.prosodyScore != null && (
                <span>
                  Ngữ điệu <b style={{ color: scoreColor(result.prosodyScore) }}>{Math.round(result.prosodyScore)}</b>
                </span>
              )}
              <span>(điểm Azure 0–100)</span>
            </div>
          </div>

          {result.rubric && <RubricPanel rubric={result.rubric} />}

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button onClick={reset} className="ds-btn ds-btn-outline">
              <i className="pi pi-refresh" />
              <span>Trả lời lại</span>
            </button>
            <button onClick={nextQuestion} className="ds-btn">
              <span>{part === "part2" ? "Cue card khác" : "Câu hỏi tiếp theo"}</span>
              <i className="pi pi-arrow-right" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
