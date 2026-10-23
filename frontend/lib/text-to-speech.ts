// Browser-native TTS for "listen to the reference sentence" — no backend
// call needed, works entirely client-side via SpeechSynthesis.
export function speakEnglish(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
