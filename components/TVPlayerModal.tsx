"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import YouTube, { YouTubeProps } from "react-youtube";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  Maximize,
  MessageSquare,
  Mic,
  Minimize,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Send,
  Sparkles,
  Star,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { VideoItem, NoteItem, VideoRating, PlayerCommand } from "@/lib/types";
import { formatTimestamp } from "@/lib/youtube";
import { getVoiceLang } from "@/lib/voiceLang";
import { useTVBackHandler } from "@/hooks/useTVRemoteNavigation";

interface TVPlayerModalProps {
  video: VideoItem;
  onClose: () => void;
  onUpdateRating: (videoId: string, rating: VideoRating) => Promise<void>;
  onToggleArchive: (videoId: string, isArchived: boolean) => Promise<void>;
  onAddNote: (videoId: string, content: string, timestamp?: number) => Promise<void>;
  onUpdateProgress?: (videoId: string, progress: number, position: number, duration?: number) => void;
  isVoiceListening?: boolean;
  playerCommand?: PlayerCommand | null;
  /** A note dictated through the voice assistant ("take note ..."). */
  externalNote?: { text: string; id: number } | null;
}

const SEEK_STEP_SEC = 10;
const CONTROLS_HIDE_MS = 3500;
const TOAST_MS = 3000;
const PROGRESS_SAVE_MS = 15000;
/** Keeps the 16:9 player short enough that the title and action row fit on one screen. */
const PLAYER_MAX_WIDTH = "calc((100vh - 20rem) * 16 / 9)";
const QUICK_NOTES = ["⭐ Key takeaway", "📌 Review later", "💡 Important concept", "❓ Question to research", "🎯 Core summary"];

/** Ignores the value a prop had on mount, so stale one-shot commands from a previous video never replay. */
function useFreshId(id: number | undefined) {
  const initial = useRef(id);
  return id !== undefined && id !== initial.current ? id : undefined;
}

function StarRating({
  value,
  onSelect,
  size = "lg",
}: {
  value: number;
  onSelect: (star: number) => void;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "w-12 h-12" : "w-11 h-11";
  const icon = size === "lg" ? "w-7 h-7" : "w-6 h-6";
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = value >= star;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onSelect(star)}
            data-tv-nav="true"
            aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
            aria-pressed={value === star}
            className={`${box} flex items-center justify-center rounded-full transition-colors ${
              filled ? "text-amber-400 hover:bg-amber-400/15" : "text-[#8a8a8a] hover:text-white hover:bg-white/10"
            }`}
          >
            <Star className={`${icon} ${filled ? "fill-amber-400" : ""}`} />
          </button>
        );
      })}
    </div>
  );
}

export function TVPlayerModal({
  video,
  onClose,
  onUpdateRating,
  onToggleArchive,
  onAddNote,
  onUpdateProgress,
  isVoiceListening = false,
  playerCommand,
  externalNote,
}: TVPlayerModalProps) {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [time, setTime] = useState({ current: 0, duration: video.duration || 0 });

  const [rating, setRating] = useState<VideoRating>(video.rating);
  const [isArchived, setIsArchived] = useState(video.isArchived);
  const [notes, setNotes] = useState<NoteItem[]>(video.notes || []);
  const [toast, setToast] = useState("");

  const [noteDialog, setNoteDialog] = useState<{ timestamp: number } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [isDictating, setIsDictating] = useState(false);
  const [dictationStatus, setDictationStatus] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const playerRef = useRef<any>(null);
  const playPauseRef = useRef<HTMLButtonElement>(null);
  const addNoteRef = useRef<HTMLButtonElement>(null);
  const noteDialogRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duckedVolumeRef = useRef<number | null>(null);
  const wasPlayingBeforeNoteRef = useRef(false);
  const lastSavedAtRef = useRef(0);

  // Mirrors for use inside long-lived listeners.
  const stateRef = useRef({ isPlaying, isEnded, isArchived, noteDialog, time });
  stateRef.current = { isPlaying, isEnded, isArchived, noteDialog, time };
  const callbacksRef = useRef({ onUpdateProgress, onAddNote, onUpdateRating, onToggleArchive });
  callbacksRef.current = { onUpdateProgress, onAddNote, onUpdateRating, onToggleArchive };

  // Keep local copies in sync when the library refreshes in the background.
  useEffect(() => {
    setRating(video.rating);
    setIsArchived(video.isArchived);
    setNotes(video.notes || []);
  }, [video.rating, video.isArchived, video.notes]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (stateRef.current.isPlaying) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    if (isPlaying) showControls();
    else setControlsVisible(true);
  }, [isPlaying, showControls]);

  // ---------------------------------------------------------------------------
  // Player actions
  // ---------------------------------------------------------------------------

  const withPlayer = useCallback((action: (player: any) => void) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      action(player);
    } catch (err) {
      console.warn("YouTube player command failed:", err);
    }
  }, []);

  const saveProgress = useCallback(
    (current: number, duration: number) => {
      if (!duration || current <= 0) return;
      const progress = Math.min(100, Math.round((current / duration) * 100));
      callbacksRef.current.onUpdateProgress?.(video.id, progress, Math.floor(current), Math.floor(duration));
      lastSavedAtRef.current = Date.now();
    },
    [video.id]
  );

  const play = useCallback(() => {
    withPlayer((p) => {
      if (stateRef.current.isEnded) {
        setIsEnded(false);
        p.seekTo(0, true);
      }
      p.playVideo();
    });
    setIsPlaying(true);
  }, [withPlayer]);

  const pause = useCallback(() => {
    withPlayer((p) => p.pauseVideo());
    setIsPlaying(false);
  }, [withPlayer]);

  const togglePlay = useCallback(() => {
    if (stateRef.current.isPlaying) pause();
    else play();
  }, [play, pause]);

  const seekTo = useCallback(
    (seconds: number) => {
      withPlayer((p) => {
        const duration = p.getDuration() || 0;
        const target = Math.max(0, duration ? Math.min(seconds, duration - 1) : seconds);
        p.seekTo(target, true);
        setTime({ current: target, duration });
        if (stateRef.current.isEnded) {
          setIsEnded(false);
          p.playVideo();
        }
      });
      showControls();
    },
    [withPlayer, showControls]
  );

  const seekBy = useCallback(
    (delta: number) => {
      withPlayer((p) => seekTo((p.getCurrentTime() || 0) + delta));
    },
    [withPlayer, seekTo]
  );

  const setMuted = useCallback(
    (mute: boolean) => {
      withPlayer((p) => (mute ? p.mute() : p.unMute()));
      setIsMuted(mute);
      showToast(mute ? "Muted" : "Sound on");
    },
    [withPlayer, showToast]
  );

  const applyRating = useCallback(
    (value: VideoRating) => {
      setRating(value);
      callbacksRef.current.onUpdateRating(video.id, value);
      showToast(value > 0 ? `Rated ${value} star${value > 1 ? "s" : ""} ${"★".repeat(value)}` : "Rating removed");
    },
    [video.id, showToast]
  );

  const toggleArchive = useCallback(() => {
    const next = !stateRef.current.isArchived;
    setIsArchived(next);
    callbacksRef.current.onToggleArchive(video.id, next);
    showToast(next ? "Saved to library" : "Removed from library");
  }, [video.id, showToast]);

  // ---------------------------------------------------------------------------
  // Notes & dictation
  // ---------------------------------------------------------------------------

  const stopDictation = useCallback(() => {
    try {
      recognitionRef.current?.abort();
    } catch {}
    recognitionRef.current = null;
    setIsDictating(false);
  }, []);

  const startDictation = useCallback(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setDictationStatus("Voice typing isn't supported in this browser. Pick a quick note instead.");
      return;
    }
    stopDictation();

    try {
      const rec = new SpeechRecognitionClass();
      rec.lang = getVoiceLang();
      rec.interimResults = true;
      rec.continuous = true;

      rec.onstart = () => {
        setIsDictating(true);
        setDictationStatus("Listening — speak your note");
      };
      rec.onresult = (e: any) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + " ";
        setNoteText(text.trim());
      };
      rec.onerror = (e: any) => {
        if (e.error === "aborted") return;
        setDictationStatus(
          e.error === "no-speech"
            ? "Didn't hear anything. Press the mic to try again."
            : e.error === "not-allowed" || e.error === "service-not-allowed"
            ? "Microphone is blocked. Allow mic access in the browser, or pick a quick note."
            : e.error === "audio-capture"
            ? "No microphone found. Check the remote's USB receiver."
            : `Microphone error: ${e.error}`
        );
      };
      rec.onend = () => {
        setIsDictating(false);
        if (recognitionRef.current === rec) recognitionRef.current = null;
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.warn("Note dictation failed to start:", err);
      setDictationStatus("Couldn't access the microphone.");
    }
  }, [stopDictation]);

  const openNoteDialog = useCallback(() => {
    let timestamp = 0;
    withPlayer((p) => {
      timestamp = Math.floor(p.getCurrentTime() || 0);
    });
    wasPlayingBeforeNoteRef.current = stateRef.current.isPlaying;
    pause();
    window.dispatchEvent(new CustomEvent("tv-pause-voice-assistant"));
    setNoteText("");
    setDictationStatus("");
    setNoteDialog({ timestamp });
    setTimeout(startDictation, 150);
  }, [withPlayer, pause, startDictation]);

  const closeNoteDialog = useCallback(
    (resumePlayback = true) => {
      stopDictation();
      setNoteDialog(null);
      setNoteText("");
      window.dispatchEvent(new CustomEvent("tv-resume-voice-assistant"));
      if (resumePlayback && wasPlayingBeforeNoteRef.current) play();
      requestAnimationFrame(() => addNoteRef.current?.focus({ preventScroll: true }));
    },
    [stopDictation, play]
  );

  const saveNote = useCallback(
    async (text: string, timestamp: number) => {
      const content = text.trim();
      if (!content) return;
      stopDictation();
      setSavingNote(true);
      try {
        await callbacksRef.current.onAddNote(video.id, content, timestamp);
        setNotes((prev) => [
          { id: `local-${Date.now()}`, videoId: video.id, content, videoTimestamp: timestamp, createdAt: new Date().toISOString() },
          ...prev,
        ]);
        showToast(`Note saved at ${formatTimestamp(timestamp)}`);
        if (stateRef.current.noteDialog) closeNoteDialog();
      } catch (err) {
        console.error("Saving note failed:", err);
        showToast("Couldn't save the note. Try again.");
      } finally {
        setSavingNote(false);
      }
    },
    [video.id, stopDictation, showToast, closeNoteDialog]
  );

  // Move focus into the note dialog when it opens.
  useEffect(() => {
    if (!noteDialog) return;
    requestAnimationFrame(() => {
      noteDialogRef.current?.querySelector<HTMLElement>("[data-tv-autofocus]")?.focus({ preventScroll: true });
    });
  }, [noteDialog]);

  // ---------------------------------------------------------------------------
  // YouTube events & polling
  // ---------------------------------------------------------------------------

  const onPlayerReady: YouTubeProps["onReady"] = (event) => {
    const player = event.target;
    playerRef.current = player;
    try {
      // Keep the iframe out of focus order; remote keys must stay with the app.
      player.getIframe?.()?.setAttribute("tabindex", "-1");
      if (video.lastPosition && video.lastPosition > 10 && (video.watchProgress ?? 0) < 95) {
        player.seekTo(video.lastPosition, true);
        showToast(`Resuming from ${formatTimestamp(video.lastPosition)}`);
      }
      player.playVideo();
      setIsMuted(Boolean(player.isMuted?.()));
    } catch {}
    setIsReady(true);
  };

  const onPlayerStateChange: YouTubeProps["onStateChange"] = (event) => {
    // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (event.data === 0) {
      setIsEnded(true);
      setIsPlaying(false);
      const duration = Math.floor(event.target.getDuration() || 0);
      callbacksRef.current.onUpdateProgress?.(video.id, 100, duration, duration);
    } else if (event.data === 1) {
      setIsEnded(false);
      setIsPlaying(true);
    } else if (event.data === 2) {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const current = player.getCurrentTime() || 0;
        const duration = player.getDuration() || 0;
        setTime((prev) =>
          Math.abs(prev.current - current) >= 0.25 || prev.duration !== duration ? { current, duration } : prev
        );
        if (stateRef.current.isPlaying && Date.now() - lastSavedAtRef.current >= PROGRESS_SAVE_MS) {
          saveProgress(current, duration);
        }
      } catch {}
    }, 500);

    return () => {
      clearInterval(interval);
      // Save the exact position on close so "Continue watching" resumes precisely.
      const { time: last, isEnded: ended } = stateRef.current;
      if (!ended) saveProgress(last.current, last.duration);
    };
  }, [saveProgress]);

  // If a click ever lands inside the YouTube iframe, pull focus back so the remote keeps working.
  useEffect(() => {
    const handleBlur = () => {
      setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME") {
          playPauseRef.current?.focus({ preventScroll: true });
        }
      }, 0);
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  // Focus the play button when the player opens.
  useEffect(() => {
    requestAnimationFrame(() => playPauseRef.current?.focus({ preventScroll: true }));
  }, []);

  // Clean up timers / microphone on close.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      try {
        recognitionRef.current?.abort();
      } catch {}
      if (stateRef.current.noteDialog) window.dispatchEvent(new CustomEvent("tv-resume-voice-assistant"));
    };
  }, []);

  // Lower the video volume while the voice assistant listens.
  useEffect(() => {
    withPlayer((p) => {
      if (isVoiceListening) {
        const volume = p.getVolume();
        if (duckedVolumeRef.current === null && volume > 15) {
          duckedVolumeRef.current = volume;
          p.setVolume(10);
        }
      } else if (duckedVolumeRef.current !== null) {
        p.setVolume(duckedVolumeRef.current);
        duckedVolumeRef.current = null;
      }
    });
  }, [isVoiceListening, withPlayer]);

  // ---------------------------------------------------------------------------
  // Remote & voice input
  // ---------------------------------------------------------------------------

  useTVBackHandler(() => {
    if (stateRef.current.noteDialog) closeNoteDialog();
    else if (isExpanded) setIsExpanded(false);
    else onClose();
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      showControls();
      if (stateRef.current.noteDialog) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const handled = (() => {
        switch (e.key) {
          case "k":
          case "K":
          case "MediaPlayPause":
            togglePlay();
            return true;
          case "MediaPlay":
            play();
            return true;
          case "MediaPause":
          case "MediaStop":
            pause();
            return true;
          case "j":
          case "J":
          case "MediaRewind":
          case "MediaTrackPrevious":
            seekBy(-SEEK_STEP_SEC);
            return true;
          case "l":
          case "L":
          case "MediaFastForward":
          case "MediaTrackNext":
            seekBy(SEEK_STEP_SEC);
            return true;
          case "m":
          case "M":
            setMuted(!playerRef.current?.isMuted?.());
            return true;
          case "f":
          case "F":
            setIsExpanded((prev) => !prev);
            return true;
          case "s":
          case "S":
          case "a":
          case "A":
            toggleArchive();
            return true;
          case "n":
          case "N":
            openNoteDialog();
            return true;
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
            applyRating(Number(e.key));
            return true;
          default:
            return false;
        }
      })();
      if (handled) e.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showControls, togglePlay, play, pause, seekBy, setMuted, toggleArchive, openNoteDialog, applyRating]);

  const freshCommandId = useFreshId(playerCommand?.id);
  useEffect(() => {
    if (freshCommandId === undefined || !playerCommand) return;
    switch (playerCommand.action) {
      case "play":
        play();
        break;
      case "pause":
      case "stop":
        pause();
        break;
      case "toggle":
        togglePlay();
        break;
      case "forward":
        seekBy(15);
        break;
      case "rewind":
        seekBy(-15);
        break;
      case "mute":
        setMuted(true);
        break;
      case "unmute":
        setMuted(false);
        break;
      case "fullscreen":
        setIsExpanded((prev) => !prev);
        break;
      case "exit_fullscreen":
        setIsExpanded(false);
        break;
    }
    // Only react to new commands, not to callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshCommandId]);

  const freshNoteId = useFreshId(externalNote?.id);
  useEffect(() => {
    if (freshNoteId === undefined || !externalNote?.text) return;
    let timestamp = 0;
    withPlayer((p) => {
      timestamp = Math.floor(p.getCurrentTime() || 0);
    });
    saveNote(externalNote.text, timestamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshNoteId]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const progressPct = time.duration > 0 ? Math.min(100, (time.current / time.duration) * 100) : 0;
  const controlsShown = controlsVisible || !isPlaying;

  return (
    <div data-tv-layer="" className="fixed inset-0 z-50 bg-[#0f0f0f] flex flex-col overflow-hidden text-white animate-fade-in">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-6 px-8 py-4 border-b border-[#272727]">
        <button
          type="button"
          onClick={onClose}
          data-tv-nav="true"
          className="flex items-center gap-3 h-12 px-6 rounded-full bg-[#272727] hover:bg-[#3a3a3a] text-lg font-semibold transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="w-9 h-6 bg-[#ff0000] rounded-lg flex items-center justify-center">
            <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
          </div>
          <span className="text-xl font-bold tracking-tight">TSJ Play</span>
        </div>

        <div className="flex items-center gap-3 min-w-[12rem] justify-end">
          {isArchived && (
            <span className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-500/15 text-sky-300 border border-sky-500/40 rounded-full text-sm font-semibold">
              <BookmarkCheck className="w-4 h-4" /> Saved
            </span>
          )}
          {rating > 0 && (
            <span className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold bg-amber-500/15 text-amber-300 border border-amber-400/40">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              {rating} / 5
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Player column */}
        <div data-tv-scroll className="flex-1 overflow-y-auto scrollbar-none px-8 py-6">
          <div
            data-tv-layer={isExpanded ? "" : undefined}
            onMouseMove={showControls}
            className={
              isExpanded
                ? "fixed inset-0 z-[60] bg-black"
                : "relative mx-auto w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-[#272727]"
            }
            style={isExpanded ? undefined : { maxWidth: PLAYER_MAX_WIDTH }}
          >
            <YouTube
              videoId={video.youtubeId}
              opts={{
                width: "100%",
                height: "100%",
                playerVars: {
                  autoplay: 1,
                  controls: 0,
                  disablekb: 1,
                  fs: 0,
                  rel: 0,
                  iv_load_policy: 3,
                  playsinline: 1,
                },
              }}
              onReady={onPlayerReady}
              onStateChange={onPlayerStateChange}
              className="absolute inset-0"
              iframeClassName="w-full h-full"
            />

            {/* Click shield: keeps the iframe from taking focus or opening youtube.com. */}
            <div
              className="absolute inset-0 z-10 cursor-pointer"
              onClick={togglePlay}
              onDoubleClick={() => setIsExpanded((prev) => !prev)}
              aria-hidden="true"
            />

            {!isReady && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="w-14 h-14 rounded-full border-4 border-white/20 border-t-white animate-spin" />
              </div>
            )}

            {isReady && !isPlaying && !isEnded && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="w-24 h-24 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                  <Play className="w-12 h-12 fill-white text-white ml-1.5" />
                </div>
              </div>
            )}

            {/* Controls */}
            <div
              className={`absolute inset-x-0 bottom-0 z-20 px-6 pb-5 pt-20 bg-gradient-to-t from-black via-black/60 to-transparent transition-opacity duration-300 ${
                controlsShown ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              <div
                className="group relative h-6 flex items-center cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  seekTo(((e.clientX - rect.left) / rect.width) * time.duration);
                }}
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(time.duration)}
                aria-valuenow={Math.round(time.current)}
              >
                <div className="w-full h-1.5 group-hover:h-2.5 bg-white/25 rounded-full overflow-hidden transition-all">
                  <div className="h-full bg-[#ff0000]" style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => seekBy(-SEEK_STEP_SEC)}
                    data-tv-nav="true"
                    aria-label={`Back ${SEEK_STEP_SEC} seconds`}
                    className="w-14 h-14 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors"
                  >
                    <RotateCcw className="w-7 h-7" />
                  </button>
                  <button
                    ref={playPauseRef}
                    type="button"
                    onClick={togglePlay}
                    data-tv-nav="true"
                    data-tv-autofocus=""
                    aria-label={isPlaying ? "Pause" : "Play"}
                    className="w-16 h-16 rounded-full flex items-center justify-center bg-white text-black hover:bg-white/90 transition-colors"
                  >
                    {isPlaying ? <Pause className="w-8 h-8 fill-black" /> : <Play className="w-8 h-8 fill-black ml-1" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => seekBy(SEEK_STEP_SEC)}
                    data-tv-nav="true"
                    aria-label={`Forward ${SEEK_STEP_SEC} seconds`}
                    className="w-14 h-14 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors"
                  >
                    <RotateCw className="w-7 h-7" />
                  </button>
                  <span className="ml-3 font-mono text-lg font-semibold tabular-nums text-white/90">
                    {formatTimestamp(time.current)} / {formatTimestamp(time.duration)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMuted(!isMuted)}
                    data-tv-nav="true"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                    className="w-14 h-14 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-7 h-7" /> : <Volume2 className="w-7 h-7" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExpanded((prev) => !prev)}
                    data-tv-nav="true"
                    aria-label={isExpanded ? "Exit full screen" : "Full screen"}
                    className="w-14 h-14 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors"
                  >
                    {isExpanded ? <Minimize className="w-7 h-7" /> : <Maximize className="w-7 h-7" />}
                  </button>
                </div>
              </div>
            </div>

            {/* End screen (replaces YouTube's suggested-videos grid) */}
            {isEnded && (
              <div className="absolute inset-0 z-30 bg-[#0f0f0f]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <span className="text-xs uppercase tracking-widest font-bold text-[#aaaaaa]">Finished</span>
                <h2 className="text-2xl font-black mt-1 max-w-2xl line-clamp-2">{video.title}</h2>
                <p className="text-base text-[#aaaaaa] mt-1">{video.author}</p>

                <div className="mt-5 px-5 py-3 rounded-2xl bg-[#1c1c1c] border border-[#303030] flex flex-col items-center gap-1">
                  <span className="text-sm font-semibold text-[#aaaaaa]">How was it?</span>
                  <StarRating value={rating} onSelect={(star) => applyRating(rating === star ? 0 : star)} size="md" />
                </div>

                <div className="mt-6 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={play}
                    data-tv-nav="true"
                    autoFocus
                    className="flex items-center gap-2.5 h-14 px-7 rounded-full bg-[#ff0000] hover:bg-red-600 font-bold text-lg transition-colors"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Watch again
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    data-tv-nav="true"
                    className="flex items-center gap-2.5 h-14 px-7 rounded-full bg-[#272727] hover:bg-[#3a3a3a] font-bold text-lg transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Back to library
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Title & actions */}
          <div className="mx-auto w-full" style={{ maxWidth: PLAYER_MAX_WIDTH }}>
            <h1 className="mt-5 text-2xl lg:text-3xl font-black leading-tight line-clamp-2">{video.title}</h1>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 pb-4">
              <div className="flex items-center gap-4 min-w-0">
                {video.authorImageUrl ? (
                  <img
                    src={video.authorImageUrl}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover border border-[#303030] flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center font-black text-xl flex-shrink-0">
                    {video.author ? video.author.charAt(0).toUpperCase() : "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xl font-bold truncate">{video.author}</p>
                  <p className="text-sm text-[#aaaaaa] font-medium truncate">{video.subject}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-[#272727] rounded-full px-2 py-1">
                  <StarRating value={rating} onSelect={(star) => applyRating(rating === star ? 0 : star)} />
                </div>

                <button
                  type="button"
                  onClick={toggleArchive}
                  data-tv-nav="true"
                  aria-pressed={isArchived}
                  className={`flex items-center gap-2 h-14 px-6 rounded-full text-base font-bold transition-colors ${
                    isArchived ? "bg-sky-600 hover:bg-sky-500" : "bg-[#272727] hover:bg-[#3a3a3a]"
                  }`}
                >
                  {isArchived ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                  {isArchived ? "Saved" : "Save"}
                </button>

                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("tv-toggle-mic"))}
                  data-tv-nav="true"
                  className={`flex items-center gap-2 h-14 px-6 rounded-full text-base font-bold transition-colors ${
                    isVoiceListening ? "bg-[#ff0000]" : "bg-[#272727] hover:bg-[#3a3a3a]"
                  }`}
                >
                  <Mic className={`w-5 h-5 ${isVoiceListening ? "animate-pulse" : "text-[#ff4d4d]"}`} />
                  {isVoiceListening ? "Listening..." : "Voice"}
                </button>

                <button
                  ref={addNoteRef}
                  type="button"
                  onClick={openNoteDialog}
                  data-tv-nav="true"
                  className="flex items-center gap-2 h-14 px-6 rounded-full text-base font-bold bg-[#ff0000] hover:bg-red-600 transition-colors"
                >
                  <MessageSquare className="w-5 h-5" />
                  Add note
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Notes sidebar */}
        <aside aria-label="Notes" className="w-96 xl:w-[420px] border-l border-[#272727] flex flex-col overflow-hidden flex-shrink-0">
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#272727]">
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-bold">Notes</span>
              <span className="text-sm font-semibold text-[#aaaaaa] bg-[#272727] px-2.5 py-0.5 rounded-full">{notes.length}</span>
            </div>
            <button
              type="button"
              onClick={openNoteDialog}
              data-tv-nav="true"
              className="flex items-center gap-1.5 h-10 px-4 bg-[#272727] hover:bg-[#3a3a3a] text-sm font-semibold rounded-full transition-colors"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>

          <div data-tv-scroll className="flex-1 overflow-y-auto scrollbar-none px-6 py-4 space-y-3">
            {notes.length === 0 ? (
              <div className="text-center py-16 text-[#aaaaaa]">
                <MessageSquare className="w-14 h-14 mx-auto mb-3 opacity-20 text-white" />
                <p className="text-lg font-medium text-white">No notes yet</p>
                <p className="text-sm text-[#8a8a8a] mt-1.5">Press N, or say &ldquo;take note&rdquo; followed by your note.</p>
              </div>
            ) : (
              notes.map((note) => {
                const hasTimestamp = note.videoTimestamp !== undefined && note.videoTimestamp !== null;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => hasTimestamp && seekTo(note.videoTimestamp as number)}
                    data-tv-nav="true"
                    disabled={!hasTimestamp}
                    className="w-full text-left bg-[#181818] border border-[#272727] hover:border-[#4a4a4a] rounded-2xl p-4 transition-colors disabled:cursor-default"
                  >
                    <div className="flex items-center justify-between mb-2">
                      {hasTimestamp ? (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-500/15 text-sky-300 font-mono font-bold rounded-lg text-sm">
                          <Clock className="w-3.5 h-3.5" />
                          {formatTimestamp(note.videoTimestamp)}
                        </span>
                      ) : (
                        <span className="text-xs text-[#8a8a8a]">General note</span>
                      )}
                      <span className="text-xs text-[#8a8a8a]">{new Date(note.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-base text-[#f1f1f1] font-medium leading-relaxed">{note.content}</p>
                  </button>
                );
              })
            )}
          </div>

          <div className="px-6 py-4 border-t border-[#272727] text-sm text-[#9a9a9a] leading-relaxed">
            <p className="font-semibold text-[#cfcfcf] mb-1">Remote shortcuts</p>
            <p>
              <kbd>K</kbd> play/pause · <kbd>J</kbd>/<kbd>L</kbd> ±10s · <kbd>F</kbd> full screen · <kbd>1</kbd>–<kbd>5</kbd> rate ·{" "}
              <kbd>S</kbd> save · <kbd>N</kbd> note · <kbd>V</kbd> voice
            </p>
          </div>
        </aside>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[80] pointer-events-none animate-fade-in">
          <div className="bg-[#181818]/95 border border-white/25 backdrop-blur-xl px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span className="text-lg font-bold tracking-wide">{toast}</span>
          </div>
        </div>
      )}

      {/* Note dialog */}
      {noteDialog && (
        <div
          ref={noteDialogRef}
          data-tv-layer=""
          role="dialog"
          aria-modal="true"
          aria-label="Add note"
          className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
        >
          <div className="bg-[#212121] border border-[#303030] rounded-3xl p-7 max-w-2xl w-full shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#303030]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#ff0000] flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Note at {formatTimestamp(noteDialog.timestamp)}</h3>
                  <p className="text-sm text-[#aaaaaa]">Speak, type, or pick a quick note</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => closeNoteDialog()}
                data-tv-nav="true"
                aria-label="Close"
                className="w-12 h-12 rounded-full bg-[#303030] hover:bg-[#3f3f3f] flex items-center justify-center transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              {QUICK_NOTES.map((preset, index) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => saveNote(preset, noteDialog.timestamp)}
                  data-tv-nav="true"
                  data-tv-autofocus={index === 0 ? "" : undefined}
                  className="h-12 px-4 rounded-xl bg-[#2c2c2c] hover:bg-[#3f3f3f] text-base font-semibold transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-4 p-4 rounded-2xl bg-[#181818] border border-[#303030]">
              <button
                type="button"
                onClick={() => (isDictating ? stopDictation() : startDictation())}
                data-tv-nav="true"
                aria-label={isDictating ? "Stop voice typing" : "Start voice typing"}
                className={`relative w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                  isDictating ? "bg-[#ff0000]" : "bg-[#303030] hover:bg-[#3f3f3f]"
                }`}
              >
                {isDictating && <span className="absolute inset-0 rounded-full bg-[#ff0000] animate-ping opacity-40" />}
                <Mic className="w-6 h-6 relative" />
              </button>
              <div className="min-w-0">
                <p className="text-base font-bold">{isDictating ? "Listening..." : "Voice typing off"}</p>
                <p className="text-sm text-[#aaaaaa] truncate">
                  {dictationStatus || "Press the mic and speak — your words appear below."}
                </p>
              </div>
            </div>

            <textarea
              rows={3}
              placeholder="Your note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="mt-4 w-full bg-[#181818] border border-[#303030] focus:border-white rounded-2xl p-4 text-lg outline-none resize-none placeholder-[#717171]"
            />

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => closeNoteDialog()}
                data-tv-nav="true"
                className="h-12 px-6 rounded-xl bg-[#303030] hover:bg-[#3f3f3f] text-base font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveNote(noteText, noteDialog.timestamp)}
                disabled={!noteText.trim() || savingNote}
                data-tv-nav="true"
                className="h-12 px-7 rounded-xl bg-[#ff0000] hover:bg-red-600 disabled:bg-[#303030] disabled:text-[#717171] text-base font-bold flex items-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4" />
                {savingNote ? "Saving..." : "Save note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
