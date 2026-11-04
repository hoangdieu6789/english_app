"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { GoalRing } from "@/components/charts/progress-ring";
import { Sparkline } from "@/components/charts/sparkline";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { progressQuery, type ProgressSummary } from "@/lib/progress-api";
import { reviewQuery } from "@/lib/review-api";
import { scoreColor } from "@/lib/score-color";
import { speakEnglish } from "@/lib/text-to-speech";

// Everything here comes from the learner's own attempts (GET /api/progress/summary).

const DAILY_GOAL_ATTEMPTS = 10; // daily goal: answers recorded (shadowing or IELTS)

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

function greeting(hour: number): MessageKey {
  if (hour < 11) return "dashboard.greeting.morning";
  if (hour < 14) return "dashboard.greeting.noon";
  if (hour < 18) return "dashboard.greeting.afternoon";
  return "dashboard.greeting.evening";
}

function formatDuration(secs: number, t: T): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? t("dashboard.duration.minSec", { m, s }) : t("dashboard.duration.sec", { s });
}

function formatBand(b: number): string {
  return (Math.round(b * 2) / 2).toFixed(1);
}

// Day and month of a YYYY-MM-DD date in the UI locale (e.g. 03/11 in Vietnamese, 11/03 in US English).
function shortDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

// Monday of the current week as YYYY-MM-DD (local), to find "this week" in the summary.
function thisMonday(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StatTile({ icon, bg, fg, label, value, note, href }: { icon: string; bg: string; fg: string; label: string; value: string; note: string; href?: string }) {
  const body = (
    <>
      <span style={{ width: 44, height: 44, flex: "none", borderRadius: 12, background: bg, color: fg, display: "grid", placeItems: "center", fontSize: "var(--text-lg)" }}>
        <i className={icon} aria-hidden />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)" }}>{label}</span>
        <span style={{ font: "700 var(--text-xl)/1.3 var(--font-display)", color: "var(--ds-text)" }}>{value}</span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{note}</span>
      </span>
      {href && <i className="pi pi-angle-right" aria-hidden style={{ color: "var(--ds-text-muted)" }} />}
    </>
  );
  const style = { padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, height: "100%" } as const;
  return href ? (
    <Link href={href} className="ds-card" style={{ ...style, color: "inherit" }}>
      {body}
    </Link>
  ) : (
    <div className="ds-card" style={style}>
      {body}
    </div>
  );
}

function AccuracyTrend({ p, onDetails }: { p: ProgressSummary; onDetails: () => void }) {
  const { t, locale } = useI18n();
  const weeks = p.weeks; // only weeks with practice, oldest first
  const current = weeks.find((w) => w.start === thisMonday());
  const prev = [...weeks].reverse().find((w) => w.start !== thisMonday());
  const delta = current && prev ? current.accuracy - prev.accuracy : null;

  let note = t("dashboard.trend.none");
  if (weeks.length === 1) note = t("dashboard.trend.needTwo");
  if (weeks.length >= 2) {
    const first = weeks[0].accuracy;
    const last = weeks[weeks.length - 1].accuracy;
    note = last > first + 2 ? t("dashboard.trend.up") : last < first - 2 ? t("dashboard.trend.down") : t("dashboard.trend.stable");
  }

  return (
    <div className="ds-card" style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{t("dashboard.trend.title")}</div>
        <a href="#" className="ds-tap" onClick={(e) => { e.preventDefault(); onDetails(); }} style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
          {t("dashboard.details")} <i className="pi pi-angle-right" style={{ fontSize: "var(--text-xs)" }} />
        </a>
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginBottom: 10 }}>{note}</div>
      {weeks.length >= 2 && <Sparkline data={weeks.map((w) => w.accuracy)} />}
      <div style={{ display: "flex", gap: 20, marginTop: 14 }}>
        <div>
          <div style={{ font: "700 var(--text-xl)/1.3 var(--font-display)", color: current ? scoreColor(current.accuracy) : undefined }}>
            {current ? Math.round(current.accuracy) : "—"}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("dashboard.trend.thisWeek")}</div>
        </div>
        {delta != null && prev && (
          <div>
            <div style={{ font: "700 var(--text-xl)/1.3 var(--font-display)", color: delta >= 0 ? "var(--ds-success)" : "var(--ds-danger)" }}>
              {delta >= 0 ? "+" : ""}
              {Math.round(delta)}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("dashboard.trend.vsWeek", { date: shortDate(prev.start, locale) })}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: p, isError, error } = useQuery(progressQuery);
  const review = useQuery(reviewQuery);

  if (!p) {
    return (
      <AppShell>
        <div style={{ maxWidth: 1120, margin: "0 auto", fontSize: "var(--text-sm)", color: isError ? "var(--ds-danger)" : "var(--ds-text-muted)" }}>
          {isError ? t("dashboard.loadFailed", { error: error.message }) : t("common.loading")}
        </div>
      </AppShell>
    );
  }

  const done = p.attemptsToday;
  const goalPct = Math.min(100, Math.round((done / DAILY_GOAL_ATTEMPTS) * 100));
  const left = Math.max(0, DAILY_GOAL_ATTEMPTS - done);

  return (
    <AppShell>
      <div className="fade" style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <section className="dash-hero" aria-label={t("dashboard.hero.today")}>
          <div className="dash-hero-text">
            <div className="ds-eyebrow" style={{ color: "var(--ds-hero-text-muted)" }}>{t(greeting(new Date().getHours()))}</div>
            <h2 className="dash-hero-title">{left === 0 ? t("dashboard.hero.goalReached") : t("dashboard.hero.ready")}</h2>
          </div>
          <div className="dash-hero-cta">
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--ds-hero-text-muted)", lineHeight: 1.5 }}>
              {left === 0 ? (
                <>
                  {t("dashboard.hero.doneBefore")}
                  <b style={{ color: "var(--ds-hero-text)" }}>{t("dashboard.hero.doneCount", { n: done })}</b>
                  {t("dashboard.hero.doneAfter")}
                </>
              ) : (
                <>
                  {t("dashboard.hero.leftBefore")}
                  <b style={{ color: "var(--ds-hero-text)" }}>{t("dashboard.hero.leftCount", { n: left })}</b>
                  {t("dashboard.hero.leftAfter", { goal: DAILY_GOAL_ATTEMPTS })}
                </>
              )}
            </p>
            <button
              onClick={() => router.push("/practice")}
              className="ds-btn"
              style={{ marginTop: 16, background: "var(--ds-surface)", color: "var(--ds-primary)", borderColor: "var(--ds-surface)", boxShadow: "0 4px 0 var(--ds-primary-edge)" }}
            >
              <i className="pi pi-microphone" aria-hidden />
              <span>{t("dashboard.hero.start")}</span>
            </button>
          </div>
          <div className="dash-hero-ring">
            <GoalRing pct={goalPct} />
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
              <div>
                <div className="dash-ring-value">
                  {done}/{DAILY_GOAL_ATTEMPTS}
                </div>
                <div className="dash-ring-label" style={{ fontSize: "var(--text-xs)", color: "var(--ds-hero-text-muted)" }}>
                  {t("dashboard.hero.today")}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="dash-stats">
          <StatTile
            icon="pi pi-comments"
            bg="var(--ds-primary-50)"
            fg="var(--ds-primary)"
            label={t("dashboard.stat.speakTime")}
            value={formatDuration(p.speakingSecondsToday, t)}
            note={t("dashboard.stat.fromRecorded", { n: done })}
          />
          <StatTile
            icon="pi pi-star"
            bg="var(--ds-success-bg)"
            fg="var(--ds-success)"
            label={t("dashboard.stat.band30")}
            value={p.last30Days.banded ? formatBand(p.last30Days.band) : "—"}
            note={p.last30Days.banded ? t("dashboard.stat.bandedCount", { n: p.last30Days.banded }) : t("dashboard.stat.noBand")}
          />
          <StatTile
            icon="pi pi-book"
            bg="var(--ds-warning-bg)"
            fg="var(--ds-warning)"
            label={t("dashboard.stat.review")}
            value={review.data ? String(review.data.dueCount) : "—"}
            note={t("dashboard.stat.reviewNote")}
            href="/review"
          />
        </div>

        <div className="dash-cards">
          <div className="ds-card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ font: "700 var(--text-base)/1.3 var(--font-display)" }}>{t("dashboard.weak.title")}</div>
              <a href="#" className="ds-tap" onClick={(e) => { e.preventDefault(); router.push("/practice"); }} style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                {t("dashboard.weak.practice")} <i className="pi pi-angle-right" style={{ fontSize: "var(--text-xs)" }} />
              </a>
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", marginBottom: 8 }}>{t("dashboard.weak.subtitle")}</div>
            {p.weakWords.length ? (
              p.weakWords.map((w) => (
                <div key={w.word} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--ds-border-subtle)" }}>
                  <button
                    onClick={() => speakEnglish(w.word)}
                    title={t("dashboard.weak.listen")}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      border: "none",
                      cursor: "pointer",
                      background: "var(--ds-surface-muted)",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--ds-text-secondary)",
                    }}
                  >
                    <i className="pi pi-volume-up" style={{ fontSize: "var(--text-sm)" }} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: "var(--text-sm)" }}>{w.word}</div>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>{t("dashboard.weak.times", { n: w.times })}</span>
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 99,
                      background: "var(--ds-surface-subtle)",
                      color: scoreColor(w.score),
                      minWidth: 44,
                      textAlign: "center",
                    }}
                  >
                    {Math.round(w.score)}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: "var(--text-sm)", color: "var(--ds-text-muted)", padding: "8px 0" }}>
                {p.attempts ? t("dashboard.weak.allGood") : t("dashboard.noAttempts")}
              </div>
            )}
          </div>

          <AccuracyTrend p={p} onDetails={() => router.push("/progress")} />
        </div>
      </div>
    </AppShell>
  );
}
