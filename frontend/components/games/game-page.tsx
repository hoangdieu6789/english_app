"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { useI18n } from "@/lib/i18n";
import { gameInfo } from "@/lib/games/catalog";
import { fetchDeck, fetchLevel, gamesQuery, type GameId, type LevelDeck } from "@/lib/games-api";
import { GameFrame } from "./game-frame";
import { WordMatch } from "./word-match";
import { Meteor } from "./meteor";
import { BubblePop } from "./bubble-pop";
import { LevelClimb } from "./level-climb";
import { BroomFlight } from "./broom-flight";

/** One game's page: title, then the shared frame with the game's board. */
export function GamePage({ id }: { id: GameId }) {
  const { t } = useI18n();
  const info = gameInfo(id);
  const { data } = useQuery(gamesQuery);
  const best = data?.bests.find((b) => b.game === id)?.best;
  return (
    <AppShell width={960}>
      <div className="fade" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/games" className="game-icon-btn" aria-label={t("games.backToGames")}>
            <Icon name="back" size="md" />
          </Link>
          <span className="game-tile-icon" aria-hidden>
            <Icon name={info.icon} size="lg" />
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, font: "800 var(--text-xl)/1.2 var(--font-display)" }}>{t(info.name)}</h1>
            <p style={{ margin: 0, color: "var(--ds-text-secondary)", fontSize: "var(--text-sm)" }}>{t(info.desc)}</p>
          </div>
        </div>
        <GameFrame game={id} howTo={info.howTo} best={best} myWords={data?.myWords} load={(deck) => (id === "level-climb" || !deck ? fetchLevel() : fetchDeck(deck))}>
          {(deck) =>
            id === "word-match" ? (
              <WordMatch deck={deck} />
            ) : id === "meteor" ? (
              <Meteor deck={deck} />
            ) : id === "bubble-pop" ? (
              <BubblePop deck={deck} />
            ) : id === "broom-flight" ? (
              <BroomFlight deck={deck} />
            ) : (
              <LevelClimb deck={deck as LevelDeck} />
            )
          }
        </GameFrame>
      </div>
    </AppShell>
  );
}
