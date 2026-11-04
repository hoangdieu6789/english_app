"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ImprovedAnswerBox, SampleAnswerBox } from "@/components/answer-coach";
import { RubricPanel } from "@/components/rubric-panel";
import { WordTips } from "@/components/word-tips";
import { fetchPronunciationAttempt, resolveAudioUrl } from "@/lib/pronunciation-api";
import { scoreColor } from "@/lib/score-color";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, taskLabel } from "@/lib/task-labels";

const IELTS = ["part1", "part2", "part3"];

// One attempt from the history: the recording, transcript, scores, rubric, pronunciation
// tips, and the model / improved answers.
export default function AttemptPage() {
  const { t, locale } = useI18n();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["attempt", id],
    queryFn: () => fetchPronunciationAttempt(id),
    refetchInterval: (s) => (s.state.data?.gradingStatus === "pending" ? 3000 : false),
  });
  const a = q.data;
  const ielts = a ? IELTS.includes(a.taskType) : false;

  return (
    <AppShell width={860}>
      <div className="fade" style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <Link href="/history" style={{ fontSize: "var(--text-sm)", color: "var(--ds-primary)", fontWeight: 600, textDecoration: "none" }}>
          <i className="pi pi-arrow-left" style={{ fontSize: "var(--text-xs)", marginRight: 6 }} />
          {t("history.back")}
        </Link>
        {q.isLoading && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>}
        {q.isError && <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-danger)" }}>{t("history.notFound")}</div>}
        {a && (
          <>
            <div className="ds-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>
                <span style={{ padding: "1px 8px", borderRadius: 99, background: "var(--ds-primary-50)", color: "var(--ds-primary)", fontWeight: 600 }}>
                  {taskLabel(t, a.taskType)}
                </span>
                <span>{formatDateTime(a.createdAt, locale)}</span>
              </div>
              <div style={{ font: "600 var(--text-lg)/1.45 var(--font-display)", whiteSpace: "pre-line" }}>
                {a.taskType === "shadowing" ? a.referenceText : a.taskPrompt}
              </div>
              {ielts && a.taskPrompt && (
                <div>
                  <SampleAnswerBox taskType={a.taskType} question={a.taskPrompt} />
                </div>
              )}
            </div>

            <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{t("common.youSaid")}</div>
                <audio controls src={resolveAudioUrl(a.audioUrl)} style={{ height: 32 }} />
              </div>
              <div style={{ fontSize: "var(--text-base)", lineHeight: 1.7 }}>{a.recognizedText || t("common.notRecognized")}</div>
              <div style={{ display: "flex", gap: 18, fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", flexWrap: "wrap" }}>
                <span>
                  {t("common.accuracy")} <b style={{ color: scoreColor(a.overallScore) }}>{Math.round(a.overallScore)}</b>
                </span>
                <span>
                  {t("common.fluency")} <b style={{ color: scoreColor(a.fluencyScore) }}>{Math.round(a.fluencyScore)}</b>
                </span>
                {a.prosodyScore != null && (
                  <span>
                    {t("common.prosody")} <b style={{ color: scoreColor(a.prosodyScore) }}>{Math.round(a.prosodyScore)}</b>
                  </span>
                )}
                <span>{t("common.azureScale")}</span>
              </div>
            </div>

            {a.rubric && <RubricPanel rubric={a.rubric} grader={a.grader} pendingSecs={a.gradingStatus === "pending" ? 0 : undefined} />}
            <WordTips words={a.wordScores} />
            {ielts && (a.recognizedText ?? "").split(/\s+/).length >= 3 && <ImprovedAnswerBox attemptId={a.id} initial={a.improvedAnswer} />}
          </>
        )}
      </div>
    </AppShell>
  );
}
