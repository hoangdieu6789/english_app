"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, errorFrom } from "@/lib/http";
import { goalsQuery, type Goals } from "@/lib/review-api";

export type FeedbackLang = "vi" | "en";

// The server keeps the setting (users.feedback_lang); a copy in localStorage lets a submit
// send it without waiting for a request.
const KEY = "speakup.feedbackLang";

export function getFeedbackLang(): FeedbackLang {
  if (typeof window === "undefined") return "vi";
  return window.localStorage.getItem(KEY) === "en" ? "en" : "vi";
}

/** The language of the AI feedback and a setter that saves it on the server. */
export function useFeedbackLang(): [FeedbackLang, (lang: FeedbackLang) => Promise<void>] {
  const queryClient = useQueryClient();
  const goals = useQuery(goalsQuery);
  const lang: FeedbackLang = goals.data?.feedbackLang === "en" ? "en" : goals.data ? "vi" : getFeedbackLang();

  useEffect(() => {
    if (goals.data) window.localStorage.setItem(KEY, goals.data.feedbackLang === "en" ? "en" : "vi");
  }, [goals.data]);

  async function setLang(next: FeedbackLang) {
    const res = await apiFetch("/settings/feedback-lang", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: next }),
    });
    if (!res.ok) throw await errorFrom(res, "Không lưu được cài đặt.");
    window.localStorage.setItem(KEY, next);
    queryClient.setQueryData<Goals>(["goals"], (g) => (g ? { ...g, feedbackLang: next } : g));
  }
  return [lang, setLang];
}

/** Two-button switch: AI feedback in Vietnamese or English. */
export function FeedbackLangSwitch() {
  const [lang, setLang] = useFeedbackLang();
  const btn = (value: FeedbackLang, label: string) => (
    <button
      key={value}
      onClick={() => value !== lang && setLang(value).catch(() => undefined)}
      aria-pressed={lang === value}
      style={{
        border: "none",
        cursor: "pointer",
        padding: "5px 12px",
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 99,
        background: lang === value ? "var(--ds-primary)" : "transparent",
        color: lang === value ? "#fff" : "var(--ds-text-secondary)",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ds-text-muted)" }}>
      <span>Nhận xét của AI bằng</span>
      <div style={{ display: "inline-flex", padding: 3, borderRadius: 99, background: "var(--ds-surface-muted)" }}>
        {btn("vi", "Tiếng Việt")}
        {btn("en", "English")}
      </div>
    </div>
  );
}
