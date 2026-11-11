"use client";

import React from "react";

const AVATAR_GRADIENTS = [
  "from-red-600 to-rose-700",
  "from-blue-600 to-indigo-700",
  "from-purple-600 to-violet-700",
  "from-emerald-600 to-teal-700",
  "from-amber-600 to-orange-700",
  "from-cyan-600 to-blue-700",
];

function gradientFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export function Avatar({
  name,
  imageUrl,
  className = "w-12 h-12 text-lg",
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`${className} rounded-full object-cover flex-shrink-0 border border-[#303030]`}
      />
    );
  }
  return (
    <div
      className={`${className} rounded-full bg-gradient-to-br ${gradientFor(name)} flex items-center justify-center text-white font-black flex-shrink-0`}
    >
      {name ? name.charAt(0).toUpperCase() : "?"}
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tv-nav="true"
      aria-pressed={active}
      className={`flex items-center gap-2 h-12 px-5 rounded-xl text-lg font-semibold whitespace-nowrap transition-colors ${
        active ? "bg-white text-black" : "bg-[#272727] text-white hover:bg-[#3a3a3a]"
      }`}
    >
      {children}
    </button>
  );
}
