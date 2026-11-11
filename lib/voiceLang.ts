export type VoiceLang = "en-US" | "si-LK";

const STORAGE_KEY = "tsj-voice-lang";

export const VOICE_LANG_LABELS: Record<VoiceLang, string> = {
  "en-US": "EN",
  "si-LK": "සිං",
};

/** Speech recognition language shared by the voice assistant and note dictation. */
export function getVoiceLang(): VoiceLang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "si-LK" ? "si-LK" : "en-US";
  } catch {
    return "en-US";
  }
}

export function setVoiceLang(lang: VoiceLang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}
