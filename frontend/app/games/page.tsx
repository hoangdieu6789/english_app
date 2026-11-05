"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { useI18n } from "@/lib/i18n";
import { GAMES } from "@/lib/games/catalog";
import { gamesQuery } from "@/lib/games-api";

// Games hub: the vocab level (Level Climb) and one card per game that is built.
export default function GamesPage() {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery(gamesQuery);
  return (
    <AppShell>
      <div className="fade" style={{ display: "grid", gap: 20 }}>
        <div className="ds-card game-level-card">
          <span className="game-tile-icon" aria-hidden>
            <Icon name="gameClimb" size="lg" />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="ds-eyebrow" style={{ color: "var(--ds-text-muted)" }}>
              {t("games.hub.levelTitle")}
            </div>
            {isLoading ? (
              <div>{t("common.loading")}</div>
            ) : data && data.level > 0 ? (
              <>
                <div style={{ font: "800 var(--text-2xl)/1.2 var(--font-display)" }}>{t("games.climb.level", { n: data.level, total: data.levels })}</div>
                <div className="game-ladder-track" aria-hidden style={{ margin: "6px 0" }}>
                  <span style={{ width: `${(data.level / data.levels) * 100}%` }} />
                </div>
                <div style={{ color: "var(--ds-text-secondary)" }}>{t("games.hub.levelBand", { band: data.levelBand.toFixed(1) })}</div>
              </>
            ) : (
              <div style={{ color: "var(--ds-text-secondary)" }}>{t("games.hub.noLevel")}</div>
            )}
          </div>
          <Link href="/games/level-climb" className="ds-btn">
            {t(data && data.level > 0 ? "games.hub.climbOn" : "games.hub.findLevel")} <Icon name="next" size="sm" />
          </Link>
        </div>

        {error && (
          <p role="alert" style={{ margin: 0, color: "var(--ds-danger)" }}>
            {error.message}
          </p>
        )}

        <div>
          <h2 style={{ margin: "0 0 4px", font: "800 var(--text-xl)/1.2 var(--font-display)" }}>{t("games.hub.title")}</h2>
          <p style={{ margin: 0, color: "var(--ds-text-secondary)" }}>{t("games.hub.subtitle", { n: data?.myWords ?? 0 })}</p>
        </div>
        <div className="game-grid">
          {GAMES.map((g) => {
            const best = data?.bests.find((b) => b.game === g.id);
            return (
              <Link key={g.id} href={`/games/${g.id}`} className="ds-card game-card">
                <span className="game-tile-icon" aria-hidden>
                  <Icon name={g.icon} size="lg" />
                </span>
                <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <span style={{ font: "800 var(--text-lg)/1.2 var(--font-display)", color: "var(--ds-text)" }}>{t(g.name)}</span>
                  <span style={{ color: "var(--ds-text-secondary)", fontSize: "var(--text-sm)" }}>{t(g.desc)}</span>
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: "var(--text-xs)", color: "var(--ds-text-muted)" }}>
                    <span className="game-chip">{t(g.skill)}</span>
                    {best && best.plays > 0 && (
                      <span className="game-chip">
                        <Icon name="best" size="sm" /> {g.id === "level-climb" ? t("games.hub.plays", { n: best.plays }) : t("games.end.best", { n: best.best })}
                      </span>
                    )}
                  </span>
                </span>
                <Icon name="chevronRight" size="md" style={{ marginLeft: "auto", color: "var(--ds-text-muted)", flex: "none" }} />
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
