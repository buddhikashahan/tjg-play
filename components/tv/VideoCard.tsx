"use client";

import React from "react";
import { BookmarkCheck, Flame, MessageSquare, Play, Star } from "lucide-react";
import { VideoItem } from "@/lib/types";
import { formatVideoDuration } from "@/lib/youtube";
import { Avatar } from "./ui";

function ProgressBar({ percent, className = "h-1.5" }: { percent: number; className?: string }) {
  return (
    <div className={`absolute bottom-0 inset-x-0 bg-black/70 ${className}`}>
      <div className="h-full bg-[#ff0000]" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

export function VideoCard({
  video,
  index,
  onSelect,
  autoFocus,
}: {
  video: VideoItem;
  /** 1-based position, matches "play video N" voice commands. */
  index: number;
  onSelect: (video: VideoItem) => void;
  autoFocus?: boolean;
}) {
  const progress = video.watchProgress ?? 0;
  const noteCount = video.notes?.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(video)}
      data-tv-nav="true"
      data-tv-card=""
      data-video-id={video.id}
      data-tv-autofocus={autoFocus ? "" : undefined}
      className="group text-left flex flex-col rounded-2xl transition-transform duration-200 focus:scale-[1.04] focus:z-10"
    >
      <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-[#212121] ring-white transition-shadow group-focus:ring-4 group-focus:shadow-2xl group-focus:shadow-black">
        <img src={video.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />

        <span className="absolute top-2.5 left-2.5 min-w-[2.4rem] h-8 px-2 flex items-center justify-center rounded-xl bg-black/85 text-white font-mono font-black text-base border border-white/20 group-focus:bg-[#ff0000] group-focus:border-red-400 transition-colors">
          #{index}
        </span>

        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {video.isArchived && (
            <span className="h-7 px-2 bg-sky-600/95 text-white rounded-lg text-xs font-bold flex items-center gap-1">
              <BookmarkCheck className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
          {video.rating > 0 && (
            <span className="h-7 px-2 rounded-lg text-xs font-bold flex items-center gap-1 bg-black/85 border border-amber-400/40 text-amber-300">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {video.rating}
            </span>
          )}
        </div>

        {(video.duration ?? 0) > 0 && (
          <span className="absolute bottom-3 right-2.5 px-2 py-0.5 rounded-md bg-black/85 text-white text-sm font-mono font-bold">
            {formatVideoDuration(video.duration)}
          </span>
        )}

        {progress > 0 && <ProgressBar percent={progress} />}
      </div>

      <div className="flex gap-4 mt-3.5 px-0.5">
        <Avatar name={video.author} imageUrl={video.authorImageUrl} />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-white line-clamp-2 leading-snug">{video.title}</h2>
          <p className="mt-1 text-base font-medium text-[#aaaaaa] truncate">{video.author}</p>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-[#8a8a8a] font-medium">
            <span className="truncate">{video.subject}</span>
            {noteCount > 0 && (
              <span className="flex items-center gap-1 flex-shrink-0">
                &bull;
                <MessageSquare className="w-3.5 h-3.5 text-[#ff4d4d]" />
                {noteCount}
              </span>
            )}
            {progress > 0 && <span className="text-[#ff4d4d] font-semibold flex-shrink-0">&bull; {Math.round(progress)}%</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

export function ContinueWatchingCard({ video, onSelect }: { video: VideoItem; onSelect: (video: VideoItem) => void }) {
  const progress = Math.round(video.watchProgress ?? 0);

  return (
    <button
      type="button"
      onClick={() => onSelect(video)}
      data-tv-nav="true"
      data-tv-autofocus=""
      data-video-id={video.id}
      className="w-full text-left bg-gradient-to-r from-[#1c1c1c] via-[#212121] to-[#181818] border border-[#303030] hover:border-[#4a4a4a] rounded-3xl p-6 flex flex-col lg:flex-row items-center gap-7 transition-colors"
    >
      <div className="relative w-full lg:w-96 aspect-video rounded-2xl overflow-hidden bg-black flex-shrink-0">
        <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        {(video.duration ?? 0) > 0 && (
          <span className="absolute bottom-3.5 right-2.5 px-2 py-0.5 rounded-md bg-black/85 text-white text-sm font-mono font-bold">
            {formatVideoDuration(video.duration)}
          </span>
        )}
        <ProgressBar percent={progress} className="h-2" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 text-[#ff4d4d] font-black text-sm uppercase tracking-widest">
          <Flame className="w-4 h-4 fill-[#ff4d4d]" />
          Continue watching
        </div>
        <h2 className="text-2xl lg:text-3xl font-black text-white line-clamp-2 leading-tight">{video.title}</h2>
        <p className="text-lg font-semibold text-[#aaaaaa] mt-1.5">
          {video.author} &bull; {video.subject}
        </p>
        <span className="mt-5 inline-flex items-center gap-2.5 h-12 px-6 rounded-2xl bg-[#ff0000] text-white font-black text-lg">
          <Play className="w-5 h-5 fill-white" />
          Resume ({progress}%)
        </span>
      </div>
    </button>
  );
}
