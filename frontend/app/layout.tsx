import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Almendra, Baloo_2, Nunito } from "next/font/google";
import "primeicons/primeicons.css";
import "./globals.css";
import { ReactQueryProvider } from "@/lib/react-query-provider";
import { I18nProvider } from "@/lib/i18n";
import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from "@/lib/i18n/languages";
import { bootScript } from "@/lib/theme/boot";
import { ThemeSync } from "@/components/theme-sync";

// Same family as the David Studio hub (Nunito body). Headings use Baloo 2 instead of the
// hub's Fredoka, which has no Vietnamese letters. Almendra: logo word only.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "vietnamese"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin", "vietnamese"],
});

const almendra = Almendra({
  variable: "--font-almendra",
  weight: ["700"],
  subsets: ["latin"],
});

const META: Record<Lang, Metadata> = {
  vi: {
    title: "Boltspeak — Nói có lửa, chấm có tâm",
    description: "Chấm phát âm, chấm IELTS Speaking theo tiêu chí và ôn từ vựng theo band.",
  },
  en: {
    title: "Boltspeak — Speak with a spark",
    description: "Pronunciation scoring, IELTS Speaking scored by the band descriptors, and vocabulary by band.",
  },
};

// The saved choice (cookie), else the first supported language the browser asks for.
async function cookieLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(v)) return v;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return DEFAULT_LANG;
}

export async function generateMetadata(): Promise<Metadata> {
  return META[await cookieLang()];
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await cookieLang();
  return (
    // suppressHydrationWarning: the boot script adds class="dark" before React hydrates.
    <html lang={lang} className={`${nunito.variable} ${baloo.variable} ${almendra.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Sets the theme before the first paint (no flash of the wrong theme). */}
        <script dangerouslySetInnerHTML={{ __html: bootScript() }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        <I18nProvider initialLang={lang}>
          <ReactQueryProvider>{children}</ReactQueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
