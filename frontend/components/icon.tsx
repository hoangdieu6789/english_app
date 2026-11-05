import {
  ArrowBigUp,
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Broom,
  Castle,
  ChartLine,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleStop,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Gamepad2,
  Globe,
  Headphones,
  History,
  House,
  Keyboard,
  Lamp,
  Lightbulb,
  Link2,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Mic,
  Monitor,
  Moon,
  NotebookPen,
  Pause,
  PenLine,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScrollText,
  Search,
  Settings,
  Snail,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Target,
  Timer,
  Trash2,
  Trophy,
  Upload,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
  ZapOff,
  type LucideIcon,
} from "lucide-react";

/**
 * Every icon in the app, by meaning (one meaning = one icon). Lucide (MIT), line icons with the
 * same stroke everywhere. The Boltwise logo (components/brand.tsx) is the only filled mark.
 * Rules: chevronRight = go to another page (links, list rows); next = continue in a flow (buttons).
 */
export const ICONS = {
  // pages
  home: House,
  practice: Mic,
  history: History,
  review: NotebookPen,
  headphones: Headphones,
  notebook: NotebookPen,
  bookmark: BookmarkPlus,
  keyboard: Keyboard,
  eye: Eye,
  eyeOff: EyeOff,
  upload: Upload,
  link: Link2,
  externalLink: ExternalLink,
  trash: Trash2,
  rewind: RotateCcw,
  forward: RotateCw,
  search: Search,
  check: Check,
  pen: PenLine,
  progress: ChartLine,
  games: Gamepad2,
  settings: Settings,
  // account and theme
  user: User,
  logout: LogOut,
  language: Globe,
  system: Monitor,
  light: Sun,
  dark: Moon,
  sun: Sunrise,
  // navigation
  next: ArrowRight,
  back: ArrowLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  close: X,
  show: Zap,
  hide: ZapOff,
  capsLock: ArrowBigUp,
  // actions and states
  record: Mic,
  stop: CircleStop,
  listen: Volume2,
  mute: VolumeX,
  listenSlow: Snail,
  play: Play,
  pause: Pause,
  refresh: RefreshCw,
  loading: LoaderCircle,
  ai: Sparkles,
  tip: Lightbulb,
  timer: Timer,
  done: CircleCheck,
  // stats
  streak: Zap,
  speakTime: MessageCircle,
  band: Star,
  accuracy: Target,
  best: Trophy,
  // games
  gameMatch: ScrollText,
  gameMeteor: Flame,
  gameBubble: Lamp,
  gameClimb: Castle,
  gameBroom: Broom,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** sm = next to text (buttons, links, labels); md = nav, top bar, icon buttons; lg = big actions, stat tiles. */
export const ICON_SIZES = { sm: 16, md: 20, lg: 24 } as const;
export type IconSize = keyof typeof ICON_SIZES;

export function Icon({
  name,
  size = "sm",
  spin = false,
  label,
  style,
}: {
  name: IconName;
  size?: IconSize;
  spin?: boolean;
  /** Only for an icon that carries meaning on its own; otherwise it is hidden from screen readers. */
  label?: string;
  style?: React.CSSProperties;
}) {
  const C = ICONS[name];
  return (
    <C
      size={ICON_SIZES[size]}
      strokeWidth={1.75}
      absoluteStrokeWidth
      className={spin ? "ds-icon ds-spin" : "ds-icon"}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      style={style}
    />
  );
}

export type IconTone = "primary" | "success" | "warning" | "info" | "danger";

/** The one tile style for stat icons: 44px, tinted background, colored line icon. */
export function IconTile({ name, tone = "primary" }: { name: IconName; tone?: IconTone }) {
  return (
    <span
      style={{
        width: 44,
        height: 44,
        flex: "none",
        borderRadius: "var(--ds-radius-lg)",
        background: tone === "primary" ? "var(--ds-primary-50)" : `var(--ds-${tone}-bg)`,
        color: `var(--ds-${tone})`,
        display: "grid",
        placeItems: "center",
      }}
    >
      <Icon name={name} size="lg" />
    </span>
  );
}
