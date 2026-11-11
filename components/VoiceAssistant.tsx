"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Radio } from "lucide-react";
import { AICommandResponse } from "@/lib/types";
import { VoiceLang, VOICE_LANG_LABELS, getVoiceLang, setVoiceLang } from "@/lib/voiceLang";

interface VoiceAssistantProps {
  onCommand: (command: AICommandResponse) => void;
  onListeningStateChange?: (isListening: boolean) => void;
  availableSubjects?: string[];
  availableAuthors?: string[];
  availableTags?: string[];
  currentVideoTitle?: string;
  isPlaying?: boolean;
  /** Hide the control pill (e.g. while the player is open) and show only status bubbles. */
  compact?: boolean;
}

/** Interim speech is sent after this much silence if the browser hasn't finalised it yet. */
const INTERIM_SILENCE_MS = 1100;
/** The same phrase arriving again within this window (interim then final) is ignored. */
const DUPLICATE_WINDOW_MS = 2500;
const STATUS_CLEAR_MS = 3500;

let sharedAudioContext: AudioContext | null = null;

// Short Web Audio chimes for tactile feedback at TV distance.
function playSoundCue(type: "start" | "success" | "error") {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    sharedAudioContext ??= new AudioContextClass();
    const ctx = sharedAudioContext;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    const length = type === "start" ? 0.2 : type === "success" ? 0.35 : 0.25;
    if (type === "start") {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    } else if (type === "success") {
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
    } else {
      osc.frequency.setValueAtTime(220, now);
    }
    gain.gain.setValueAtTime(type === "success" ? 0.15 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    osc.start(now);
    osc.stop(now + length);
  } catch {
    // Audio may be blocked before the first user gesture.
  }
}

export function VoiceAssistant({
  onCommand,
  onListeningStateChange,
  availableSubjects = [],
  availableAuthors = [],
  availableTags = [],
  currentVideoTitle,
  isPlaying,
  compact = false,
}: VoiceAssistantProps) {
  const [isSupported, setIsSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [lang, setLang] = useState<VoiceLang>("en-US");
  const [transcript, setTranscript] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const recognitionRef = useRef<any>(null);
  const isRunningRef = useRef(false);
  const handsFreeRef = useRef(false);
  const langRef = useRef<VoiceLang>("en-US");
  const pausedForNoteRef = useRef(false);
  const speakingRef = useRef(false);
  const interimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHandledRef = useRef({ text: "", at: 0 });

  // Latest props in refs so the recognizer is created exactly once.
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;
  const onListeningRef = useRef(onListeningStateChange);
  onListeningRef.current = onListeningStateChange;
  const contextRef = useRef({ availableSubjects, availableAuthors, availableTags, currentVideoTitle, isPlaying });
  contextRef.current = { availableSubjects, availableAuthors, availableTags, currentVideoTitle, isPlaying };

  const setListening = useCallback((value: boolean) => {
    setIsListening(value);
    onListeningRef.current?.(value);
  }, []);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage("");
      setTranscript("");
    }, STATUS_CLEAR_MS);
  }, []);

  const startRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || isRunningRef.current || pausedForNoteRef.current) return;
    try {
      rec.lang = langRef.current;
      // Push-to-talk listens for one phrase; hands-free keeps the session open.
      rec.continuous = handsFreeRef.current;
      rec.start();
      isRunningRef.current = true;
    } catch (err) {
      console.warn("Could not start speech recognition:", err);
    }
  }, []);

  const stopRecognition = useCallback((abort = false) => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      if (abort) rec.abort();
      else rec.stop();
    } catch {}
  }, []);

  // Spoken confirmation. The mic is muted while speaking so the TV never hears itself.
  const speakFeedback = useCallback(
    (text: string) => {
      if (!text || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 1.05;
        utterance.volume = 0.9;

        speakingRef.current = true;
        if (isRunningRef.current) stopRecognition(true);

        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          speakingRef.current = false;
          if (handsFreeRef.current) setTimeout(startRecognition, 300);
        };
        utterance.onend = done;
        utterance.onerror = done;
        setTimeout(done, 6000); // Chrome occasionally never fires onend
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        speakingRef.current = false;
        console.warn("Text-to-speech error:", err);
      }
    },
    [startRecognition, stopRecognition]
  );

  const processPhrase = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (text.length < 2) return;

      const now = Date.now();
      const last = lastHandledRef.current;
      if (last.text.toLowerCase() === text.toLowerCase() && now - last.at < DUPLICATE_WINDOW_MS) return;
      lastHandledRef.current = { text, at: now };

      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      if (!handsFreeRef.current) stopRecognition();

      setIsProcessing(true);
      setTranscript(text);
      try {
        const res = await fetch("/api/ai-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text, context: contextRef.current }),
        });
        const data = await res.json();
        const result: AICommandResponse | undefined = data.result;

        if (data.success && result) {
          playSoundCue(result.action === "UNKNOWN" ? "error" : "success");
          showStatus(result.feedbackMessage);
          speakFeedback(result.feedbackMessage);
          onCommandRef.current(result);
        } else {
          playSoundCue("error");
          const message = result?.feedbackMessage || data.error || "Could not process that command.";
          showStatus(message);
          speakFeedback(message);
        }
      } catch (err) {
        console.error("Voice command failed:", err);
        playSoundCue("error");
        showStatus("Network error. Please try again.");
      } finally {
        setIsProcessing(false);
      }
    },
    [showStatus, speakFeedback, stopRecognition]
  );

  // Create the recognizer once.
  useEffect(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setIsSupported(false);
      return;
    }

    const initialLang = getVoiceLang();
    langRef.current = initialLang;
    setLang(initialLang);

    const recognition = new SpeechRecognitionClass();
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isRunningRef.current = true;
      setListening(true);
      playSoundCue("start");
    };

    recognition.onresult = (event: any) => {
      if (speakingRef.current) return;

      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const segment = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += segment;
        else interimText += segment;
      }

      const live = (finalText || interimText).trim();
      if (live) setTranscript(live);

      if (finalText.trim()) {
        processPhrase(finalText);
        return;
      }

      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      if (interimText.trim()) {
        interimTimerRef.current = setTimeout(() => processPhrase(interimText), INTERIM_SILENCE_MS);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "aborted") return;
      if (event.error === "no-speech") {
        if (!handsFreeRef.current) showStatus("Didn't catch that. Press the mic and try again.");
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        handsFreeRef.current = false;
        setHandsFree(false);
        showStatus("Microphone permission denied.");
      } else if (event.error === "audio-capture") {
        showStatus("No microphone found. Check the remote's USB receiver.");
      } else if (event.error === "network") {
        showStatus("Voice service unreachable. Check the internet connection.");
      } else {
        console.warn("Speech recognition error:", event.error);
      }
    };

    recognition.onend = () => {
      isRunningRef.current = false;
      setListening(false);
      if (handsFreeRef.current && !pausedForNoteRef.current && !speakingRef.current) {
        setTimeout(startRecognition, 400);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      handsFreeRef.current = false;
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      try {
        recognition.abort();
      } catch {}
      recognitionRef.current = null;
    };
  }, [processPhrase, setListening, showStatus, startRecognition]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      showStatus("Voice control needs Google Chrome or Microsoft Edge.");
      return;
    }
    if (isRunningRef.current) {
      if (handsFreeRef.current) {
        handsFreeRef.current = false;
        setHandsFree(false);
      }
      stopRecognition();
    } else {
      setTranscript("");
      setStatusMessage("");
      startRecognition();
    }
  }, [showStatus, startRecognition, stopRecognition]);

  const toggleHandsFree = useCallback(() => {
    const next = !handsFreeRef.current;
    handsFreeRef.current = next;
    setHandsFree(next);
    if (next) {
      showStatus("Hands-free listening is on");
      // A running push-to-talk session is single-phrase; restart it in continuous mode.
      if (isRunningRef.current) stopRecognition(true);
      else startRecognition();
    } else {
      stopRecognition();
      showStatus("Hands-free listening is off");
    }
  }, [showStatus, startRecognition, stopRecognition]);

  const toggleLanguage = useCallback(() => {
    const next: VoiceLang = langRef.current === "en-US" ? "si-LK" : "en-US";
    langRef.current = next;
    setLang(next);
    setVoiceLang(next);
    showStatus(next === "si-LK" ? "සිංහල හඬ විධාන" : "English voice commands");
    // Restart so the new language applies immediately.
    if (isRunningRef.current) {
      stopRecognition(true);
      if (!handsFreeRef.current) setTimeout(startRecognition, 300);
    }
  }, [showStatus, startRecognition, stopRecognition]);

  // Global events: remote mic key, and pausing while a note is being dictated.
  useEffect(() => {
    const handlePauseForNote = () => {
      pausedForNoteRef.current = true;
      stopRecognition(true);
    };
    const handleResumeAfterNote = () => {
      pausedForNoteRef.current = false;
      if (handsFreeRef.current) setTimeout(startRecognition, 300);
    };

    window.addEventListener("tv-toggle-mic", toggleListening);
    window.addEventListener("tv-pause-voice-assistant", handlePauseForNote);
    window.addEventListener("tv-resume-voice-assistant", handleResumeAfterNote);
    return () => {
      window.removeEventListener("tv-toggle-mic", toggleListening);
      window.removeEventListener("tv-pause-voice-assistant", handlePauseForNote);
      window.removeEventListener("tv-resume-voice-assistant", handleResumeAfterNote);
    };
  }, [toggleListening, startRecognition, stopRecognition]);

  const bubbleText = transcript.trim();
  const showBubble = Boolean(bubbleText || isProcessing || statusMessage);

  return (
    <aside
      aria-label="Voice assistant"
      className="fixed bottom-6 right-8 z-[70] flex flex-col items-end gap-3 pointer-events-none"
    >
      {showBubble && (
        <div
          role="status"
          aria-live="polite"
          className="max-w-xl bg-[#181818]/95 backdrop-blur-md border border-[#303030] rounded-2xl px-5 py-3.5 shadow-2xl text-white animate-fade-in flex flex-col gap-1.5"
        >
          {bubbleText && (
            <div className="text-xl font-bold tracking-wide flex items-center gap-2.5">
              {isListening && <span className="w-2.5 h-2.5 rounded-full bg-[#ff0000] animate-pulse flex-shrink-0" />}
              <span>&ldquo;{bubbleText}&rdquo;</span>
            </div>
          )}
          {isProcessing ? (
            <div className="flex items-center gap-2 text-sm text-[#ff6b6b] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#ff0000] animate-ping" />
              Working on it...
            </div>
          ) : (
            statusMessage && <p className="text-base text-[#cfcfcf] font-medium">{statusMessage}</p>
          )}
        </div>
      )}

      {!compact && (
        <div className="pointer-events-auto flex items-center gap-2 bg-[#212121]/90 border border-[#303030] rounded-full p-2 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={toggleLanguage}
            data-tv-nav="true"
            title="Switch voice language (English / Sinhala)"
            aria-label="Switch voice language"
            className="h-12 min-w-[3.5rem] px-3 rounded-full text-base font-bold bg-[#272727] text-white hover:bg-[#3a3a3a] transition-colors"
          >
            {VOICE_LANG_LABELS[lang]}
          </button>

          <button
            type="button"
            onClick={toggleHandsFree}
            data-tv-nav="true"
            disabled={!isSupported}
            title="Hands-free: keep listening for commands"
            aria-pressed={handsFree}
            className={`h-12 flex items-center gap-2 px-4 rounded-full text-base font-bold transition-colors disabled:opacity-40 ${
              handsFree ? "bg-[#10b981] text-white" : "bg-[#272727] text-[#cfcfcf] hover:bg-[#3a3a3a] hover:text-white"
            }`}
          >
            <Radio className={`w-5 h-5 ${handsFree ? "animate-pulse" : ""}`} />
            <span>{handsFree ? "Hands-free on" : "Hands-free"}</span>
          </button>

          <button
            type="button"
            id="tv-voice-assistant-mic-btn"
            onClick={toggleListening}
            data-tv-nav="true"
            title="Push to talk (remote mic key or V)"
            aria-label={isListening ? "Stop listening" : "Start voice command"}
            className={`relative flex items-center justify-center w-16 h-16 rounded-full bg-[#ff0000] text-white shadow-2xl transition-colors hover:bg-red-500 ${
              isListening ? "shadow-red-600/50" : ""
            }`}
          >
            {isListening && (
              <span className="absolute -inset-1.5 rounded-full border-4 border-[#ff0000] animate-ping opacity-60" />
            )}
            <Mic className="w-8 h-8" />
          </button>
        </div>
      )}
    </aside>
  );
}
