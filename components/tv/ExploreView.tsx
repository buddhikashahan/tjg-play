"use client";

import React from "react";
import { ArrowRight, Layers, Users } from "lucide-react";
import { Avatar } from "./ui";

export interface DirectoryEntry {
  name: string;
  image?: string | null;
  videoCount: number;
}

const plural = (count: number) => `${count} video${count === 1 ? "" : "s"}`;

function SectionHeader({ icon: Icon, tint, title, subtitle }: { icon: React.ElementType; tint: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-[#272727] mb-6">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tint}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-white">{title}</h2>
        <p className="text-base text-[#aaaaaa]">{subtitle}</p>
      </div>
    </div>
  );
}

export function ExploreView({
  authors,
  subjects,
  onSelectAuthor,
  onSelectSubject,
}: {
  authors: DirectoryEntry[];
  subjects: DirectoryEntry[];
  onSelectAuthor: (name: string) => void;
  onSelectSubject: (name: string) => void;
}) {
  return (
    <main data-tv-scroll className="flex-1 px-10 py-8 overflow-y-auto scrollbar-none space-y-12 pb-32">
      <section>
        <SectionHeader
          icon={Users}
          tint="bg-[#ff0000]/20 text-[#ff4d4d]"
          title="Speakers & Channels"
          subtitle="Choose a speaker to see their videos"
        />
        {authors.length === 0 ? (
          <p className="text-lg text-[#8a8a8a]">No speakers yet. Add videos from the Admin page.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
            {authors.map((author, i) => (
              <button
                key={author.name}
                type="button"
                onClick={() => onSelectAuthor(author.name)}
                data-tv-nav="true"
                data-tv-autofocus={i === 0 ? "" : undefined}
                className="p-6 rounded-3xl bg-[#181818] border border-[#272727] hover:border-[#4a4a4a] flex flex-col items-center text-center transition-colors"
              >
                <Avatar name={author.name} imageUrl={author.image} className="w-24 h-24 text-3xl" />
                <h3 className="text-xl font-bold text-white mt-4 line-clamp-2">{author.name}</h3>
                <p className="text-base text-[#aaaaaa] mt-1 font-medium">{plural(author.videoCount)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          icon={Layers}
          tint="bg-purple-500/20 text-purple-400"
          title="Categories"
          subtitle="Browse the library by topic"
        />
        {subjects.length === 0 ? (
          <p className="text-lg text-[#8a8a8a]">No categories yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {subjects.map((subject) => (
              <button
                key={subject.name}
                type="button"
                onClick={() => onSelectSubject(subject.name)}
                data-tv-nav="true"
                className="group p-6 rounded-3xl bg-[#181818] border border-[#272727] hover:border-[#4a4a4a] flex items-center justify-between gap-4 text-left transition-colors"
              >
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold text-white line-clamp-2">{subject.name}</h3>
                  <p className="text-base text-[#aaaaaa] mt-1 font-medium">{plural(subject.videoCount)}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[#272727] group-focus:bg-white group-focus:text-black flex items-center justify-center flex-shrink-0 transition-colors">
                  <ArrowRight className="w-6 h-6" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
