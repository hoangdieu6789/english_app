"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { useI18n } from "@/lib/i18n";
import { fetchLesson, lessonAudioSrc, saveLessonProgress, type Lesson } from "@/lib/listening-api";
import { PlayerControls, useLessonAudio } from "@/components/listening/lesson-audio";
import { SaveBar, Transcript } from "@/components/listening/transcript";
import { Dictation } from "@/components/listening/dictation";

// One listening lesson: Listen (player, transcript that can be hidden, save words) and
// Dictation. YouTube lessons embed the player; the transcript does not follow the video.

export default function LessonPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["lesson", params.id], queryFn: () => fetchLesson(params.id) });
  return (
    <AppShell width={860}>
      <div className="fade" style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <Link href="/listen" className="ds-btn ds-btn-text" style={{ alignSelf: "flex-start" }}>
          <Icon name="back" />
          <span>{t("listen.back")}</span>
        </Link>
        {q.isLoading && <div style={{ color: "var(--ds-text-muted)" }}>{t("common.loading")}</div>}
        {q.isError && <div style={{ color: "var(--ds-danger)" }}>{q.error instanceof Error ? q.error.message : t("listen.err.loadLesson")}</div>}
        {q.data && <LessonView lesson={q.data} />}
      </div>
    </AppShell>
  );
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"listen" | "dictation">("listen");
  const [hidden, setHidden] = useState(false);
  const [phrase, setPhrase] = useState<{ text: string; context: string } | null>(null);
  const lastSaved = useRef(0);
  const src = lessonAudioSrc(lesson);
  const onTime = useCallback(
    (time: number) => {
      // Remember where the learner is, every 15 seconds of listening.
      if (Math.abs(time - lastSaved.current) >= 15) {
        lastSaved.current = time;
        void saveLessonProgress(lesson.id, time);
      }
    },
    [lesson.id],
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audio = useLessonAudio(audioRef, onTime);
  const hasText = lesson.segments.length > 0;

  // Start where the learner stopped last time.
  useEffect(() => {
    const p = lesson.progress?.positionSec ?? 0;
    const a = audioRef.current;
    if (!a || p < 5) return;
    const go = () => {
      a.currentTime = p;
      lastSaved.current = p;
    };
    if (a.readyState >= 1) go();
    else a.addEventListener("loadedmetadata", go, { once: true });
  }, [lesson.progress?.positionSec]);

  return (
    <>
      <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="ls-tag" data-tone="accent">
            {t(`listen.kind.${lesson.kind}`)}
          </span>
          {lesson.band > 0 && <span className="ls-tag">Band {lesson.band.toFixed(1)}</span>}
          {lesson.speakers?.map((s) => (
            <span key={s.name} className="ls-tag">
              {s.name}
            </span>
          ))}
        </div>
        <h2 style={{ margin: 0, font: "700 var(--text-2xl)/1.25 var(--font-display)" }}>{lesson.title}</h2>
        {(lesson.credit || lesson.sourceUrl) && (
          <div className="ls-meta">
            {lesson.credit && <span>{t("listen.credit", { credit: lesson.credit })}</span>}
            {lesson.sourceUrl && (
              <a href={lesson.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ds-primary)" }}>
                {t("listen.openSource")} <Icon name="externalLink" size="sm" />
              </a>
            )}
          </div>
        )}
      </header>

      {lesson.videoId ? (
        <div className="ds-card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="ls-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${lesson.videoId}?rel=0`}
              title={lesson.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{t("listen.youtubeNote")}</span>
        </div>
      ) : (
        <div className="ds-card ls-player">
          <audio ref={audioRef} src={src} preload="metadata" />
          <PlayerControls audio={audio} fallbackDuration={lesson.durationSec} />
          {audio.error && <div style={{ color: "var(--ds-danger)", fontSize: "var(--text-sm)" }}>{t("listen.err.audio")}</div>}
        </div>
      )}

      {hasText ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div role="tablist" aria-label={t("listen.mode")} className="ls-seg">
            {(["listen", "dictation"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
                <Icon name={m === "listen" ? "headphones" : "keyboard"} size="sm" />
                {t(`listen.mode.${m}`)}
              </button>
            ))}
          </div>
          {mode === "listen" && (
            <button type="button" className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => setHidden((h) => !h)} aria-pressed={hidden}>
              <Icon name={hidden ? "eye" : "eyeOff"} />
              <span>{hidden ? t("listen.transcript.show") : t("listen.transcript.hide")}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="ds-card" style={{ padding: 18, color: "var(--ds-text-muted)" }}>
          {t("listen.noTranscript")}
        </div>
      )}

      {hasText && mode === "listen" && (
        <>
          {lesson.phrases.length > 0 && (
            <div className="ds-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>{t("listen.phrases.title")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {lesson.phrases.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="ls-chip"
                    onClick={() => setPhrase({ text: p, context: lesson.segments.find((s) => s.text.toLowerCase().includes(p.toLowerCase()))?.text ?? "" })}
                    aria-label={t("listen.phrases.save", { text: p })}
                  >
                    <Icon name="bookmark" size="sm" />
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {phrase && <SaveBar key={phrase.text} pick={phrase} lessonId={lesson.id} onClose={() => setPhrase(null)} />}
          <div className="ds-card" style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: "0 6px", fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{hidden ? t("listen.transcript.hiddenNote") : t("listen.save.hint")}</p>
            <Transcript lesson={lesson} audio={lesson.videoId ? null : audio} hidden={hidden} />
          </div>
        </>
      )}
      {hasText && mode === "dictation" && <Dictation lesson={lesson} audio={lesson.videoId ? null : audio} />}
    </>
  );
}
