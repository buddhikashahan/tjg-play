"use client";

import React from "react";
import Link from "next/link";
import { Bookmark, Clock, Compass, Home, Mic, Play, RefreshCw, Search, Settings, Star } from "lucide-react";

export type NavItem = "voice" | "search" | "home" | "explore" | "history" | "library" | "ratings";

const NAV_ITEMS: Array<{ id: Exclude<NavItem, "voice">; label: string; icon: React.ElementType }> = [
  { id: "search", label: "Search", icon: Search },
  { id: "home", label: "Home", icon: Home },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "history", label: "History", icon: Clock },
  { id: "library", label: "Saved", icon: Bookmark },
  { id: "ratings", label: "Ratings", icon: Star },
];

const railButton =
  "flex flex-col items-center justify-center gap-1 w-20 h-[4.5rem] rounded-2xl transition-colors";

export function NavRail({
  active,
  isListening,
  isRefreshing,
  onSelect,
  onRefresh,
}: {
  active: NavItem;
  isListening: boolean;
  isRefreshing: boolean;
  onSelect: (item: NavItem) => void;
  onRefresh: () => void;
}) {
  return (
    <aside
      aria-label="Main navigation"
      className="w-28 bg-[#0f0f0f] border-r border-[#272727] flex flex-col items-center py-6 justify-between z-30 flex-shrink-0"
    >
      <div className="flex flex-col items-center w-full gap-6">
        <div className="flex flex-col items-center" aria-hidden="true">
          <div className="w-14 h-10 bg-[#ff0000] rounded-2xl flex items-center justify-center shadow-lg shadow-red-600/30">
            <Play className="w-6 h-6 fill-white text-white ml-0.5" />
          </div>
          <span className="text-[11px] font-black tracking-widest text-white mt-1.5 uppercase">TSJ Play</span>
        </div>

        <nav className="flex flex-col items-center gap-2 w-full">
          <button
            type="button"
            onClick={() => onSelect("voice")}
            data-tv-nav="true"
            aria-label="Voice command"
            className={`${railButton} ${
              isListening ? "bg-[#ff0000] text-white animate-pulse" : "text-[#aaaaaa] hover:text-white hover:bg-[#272727]"
            }`}
          >
            <Mic className="w-7 h-7" />
            <span className="text-xs font-semibold">Voice</span>
          </button>

          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                data-tv-nav="true"
                aria-current={isActive ? "page" : undefined}
                className={`${railButton} ${
                  isActive ? "bg-[#272727] text-white" : "text-[#aaaaaa] hover:text-white hover:bg-[#272727]"
                }`}
              >
                <Icon className={`w-7 h-7 ${isActive && id === "ratings" ? "fill-amber-400 text-amber-400" : ""}`} />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col items-center gap-2 w-full">
        <button
          type="button"
          onClick={onRefresh}
          data-tv-nav="true"
          className={`${railButton} h-16 text-[#aaaaaa] hover:text-white hover:bg-[#272727]`}
        >
          <RefreshCw className={`w-6 h-6 ${isRefreshing ? "animate-spin text-white" : ""}`} />
          <span className="text-[11px] font-semibold">Refresh</span>
        </button>
        <Link
          href="/admin"
          data-tv-nav="true"
          className={`${railButton} h-16 text-[#aaaaaa] hover:text-white hover:bg-[#272727]`}
        >
          <Settings className="w-6 h-6" />
          <span className="text-[11px] font-semibold">Admin</span>
        </Link>
      </div>
    </aside>
  );
}
