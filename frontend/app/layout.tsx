import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Inter, Be_Vietnam_Pro } from "next/font/google";
import "primeicons/primeicons.css";
import "./globals.css";
import { ReactQueryProvider } from "@/lib/react-query-provider";
import { I18nProvider } from "@/lib/i18n";
import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from "@/lib/i18n/languages";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
});

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin", "vietnamese"],
});

const META: Record<Lang, Metadata> = {
  vi: {
    title: "SpeakUp — Luyện nói tiếng Anh và IELTS Speaking",
    description: "Chấm phát âm, chấm IELTS Speaking theo tiêu chí và ôn từ vựng theo band.",
  },
  en: {
    title: "SpeakUp — English speaking and IELTS Speaking practice",
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
    <html lang={lang} className={`${inter.variable} ${beVietnamPro.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <I18nProvider initialLang={lang}>
          <ReactQueryProvider>{children}</ReactQueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
