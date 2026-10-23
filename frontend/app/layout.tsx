import type { Metadata } from "next";
import { Inter, Be_Vietnam_Pro } from "next/font/google";
import "primeicons/primeicons.css";
import "./globals.css";
import { ReactQueryProvider } from "@/lib/react-query-provider";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
});

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "SpeakUp — Luyện nghe & nói tiếng Anh",
  description: "Chấm phát âm, phát hiện gap từ vựng và theo dõi tiến độ học tiếng Anh.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${inter.variable} ${beVietnamPro.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
    </html>
  );
}
