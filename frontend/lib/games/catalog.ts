import type { IconName } from "@/components/icon";
import type { MessageKey } from "@/lib/i18n";
import type { GameId } from "@/lib/games-api";

// The games that are built (docs/tickets/GAME-001-vocab-games-plan.md). A game is listed here
// only when it can be played.
export type GameInfo = {
  id: GameId;
  icon: IconName;
  name: MessageKey;
  desc: MessageKey;
  skill: MessageKey;
  howTo: MessageKey[];
};

export const GAMES: GameInfo[] = [
  {
    id: "level-climb",
    icon: "gameClimb",
    name: "games.climb.name",
    desc: "games.climb.desc",
    skill: "games.skill.level",
    howTo: ["games.climb.how1", "games.climb.how2", "games.climb.how3"],
  },
  {
    id: "broom-flight",
    icon: "gameBroom",
    name: "games.broom.name",
    desc: "games.broom.desc",
    skill: "games.skill.flight",
    howTo: ["games.broom.how1", "games.broom.how2", "games.broom.how3"],
  },
  {
    id: "word-match",
    icon: "gameMatch",
    name: "games.match.name",
    desc: "games.match.desc",
    skill: "games.skill.recall",
    howTo: ["games.match.how1", "games.match.how2", "games.match.how3"],
  },
  {
    id: "meteor",
    icon: "gameMeteor",
    name: "games.meteor.name",
    desc: "games.meteor.desc",
    skill: "games.skill.speed",
    howTo: ["games.meteor.how1", "games.meteor.how2", "games.meteor.how3"],
  },
  {
    id: "bubble-pop",
    icon: "gameBubble",
    name: "games.bubble.name",
    desc: "games.bubble.desc",
    skill: "games.skill.speed",
    howTo: ["games.bubble.how1", "games.bubble.how2", "games.bubble.how3"],
  },
];

export function gameInfo(id: GameId): GameInfo {
  return GAMES.find((g) => g.id === id)!;
}
