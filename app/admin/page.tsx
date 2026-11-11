"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Sparkles,
  Plus,
  Tv,
  Trash2,
  Bookmark,
  BookmarkCheck,
  Star,
  Search,
  MessageSquare,
  Clock,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  X,
  Upload,
  Image as ImageIcon,
  Flame,
  FolderTree,
} from "lucide-react";
import { VideoItem, VideoRating, AuthorItem, CategoryItem } from "@/lib/types";
import { uploadAuthorAvatar, isFirebaseConfigured } from "@/lib/firebase";
import { formatTimestamp } from "@/lib/youtube";
import { SearchableSelect, SearchableOption } from "@/components/SearchableSelect";

export default function AdminDashboardPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [dbAuthors, setDbAuthors] = useState<AuthorItem[]>([]);
  const [dbCategories, setDbCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // New Video Form State
  const [urlInput, setUrlInput] = useState("");
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [metaError, setMetaError] = useState("");
  const [metaSuccess, setMetaSuccess] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newAuthorImageUrl, setNewAuthorImageUrl] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newThumbnail, setNewThumbnail] = useState("");
  const [newYoutubeId, setNewYoutubeId] = useState("");
  const [newDuration, setNewDuration] = useState<number>(0);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newRating, setNewRating] = useState<VideoRating>(0);
  const [tagInput, setTagInput] = useState("");
  const [savingVideo, setSavingVideo] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Author image modal state for existing authors
  const [editingAuthorForVideo, setEditingAuthorForVideo] = useState<VideoItem | null>(null);

  // Filter state for table
  const [filterRating, setFilterRating] = useState("all");
  const [filterArchived, setFilterArchived] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterAuthor, setFilterAuthor] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");

  // Notes Modal state
  const [selectedVideoForNotes, setSelectedVideoForNotes] = useState<VideoItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const authorModalFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch all videos, authors, and categories
  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const [vRes, aRes, cRes] = await Promise.all([
        fetch("/api/videos"),
        fetch("/api/authors"),
        fetch("/api/categories"),
      ]);

      const [vData, aData, cData] = await Promise.all([
        vRes.json(),
        aRes.json().catch(() => ({ success: false })),
        cRes.json().catch(() => ({ success: false })),
      ]);

      if (vData.success) {
        setVideos(vData.videos);
      }
      if (aData.success && aData.authors) {
        setDbAuthors(aData.authors);
      }
      if (cData.success && cData.categories) {
        setDbCategories(cData.categories);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Handle YouTube URL auto-fetch + Gemini classification
  const handleAutoFetch = async () => {
    if (!urlInput.trim()) {
      setMetaError("Please enter a YouTube video URL or ID.");
      return;
    }

    setFetchingMeta(true);
    setMetaError("");
    setMetaSuccess("");

    try {
      const res = await fetch("/api/youtube-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch video details");
      }

      const meta = data.metadata;
      setNewYoutubeId(meta.youtubeId);
      setNewTitle(meta.title);
      setNewThumbnail(meta.thumbnailUrl);
      if (meta.duration) {
        setNewDuration(meta.duration);
      } else {
        setNewDuration(0);
      }

      // Set Author: prioritize Gemini's intelligent canonical match or clean name
      const chosenAuthor = (meta.suggestedAuthor || meta.author || "Unknown Author").trim();
      setNewAuthor(chosenAuthor);

      // Set Author Avatar Image
      if (meta.suggestedAuthorImageUrl) {
        setNewAuthorImageUrl(meta.suggestedAuthorImageUrl);
      } else {
        const matched = dbAuthors.find(
          (a) => a.name.toLowerCase() === chosenAuthor.toLowerCase()
        );
        if (matched?.imageUrl) {
          setNewAuthorImageUrl(matched.imageUrl);
        } else {
          const existing = videos.find(
            (v) => v.author.toLowerCase() === chosenAuthor.toLowerCase() && v.authorImageUrl
          );
          if (existing?.authorImageUrl) {
            setNewAuthorImageUrl(existing.authorImageUrl);
          } else {
            setNewAuthorImageUrl("");
          }
        }
      }

      // Set Category: Gemini's match from existing categories or suggested new category
      setNewSubject(meta.suggestedSubject || "General");
      setNewTags(meta.suggestedTags || ["video"]);

      // Informative user feedback
      let feedback = `Classified: Category "${meta.suggestedSubject}"`;
      if (meta.isExistingCategory) {
        feedback += ` (Matched existing category)`;
      } else {
        feedback += ` (New category)`;
      }
      if (meta.isExistingAuthor) {
        feedback += ` • Author: "${chosenAuthor}" (Matched existing author in library)`;
      } else {
        feedback += ` • Author: "${chosenAuthor}"`;
      }
      setMetaSuccess(feedback);
    } catch (err: any) {
      console.error(err);
      setMetaError(err.message || "Failed to fetch metadata. Check URL.");
    } finally {
      setFetchingMeta(false);
    }
  };

  // Upload author image file (to Firebase Storage or local fallback)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetAuthor?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setMetaError("");

    try {
      const authorToUse = targetAuthor || newAuthor || "author";
      const uploadedUrl = await uploadAuthorAvatar(file, authorToUse);

      if (targetAuthor && editingAuthorForVideo) {
        await fetch(`/api/videos/${editingAuthorForVideo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authorImageUrl: uploadedUrl }),
        });
        setEditingAuthorForVideo(null);
        fetchVideos();
      } else {
        setNewAuthorImageUrl(uploadedUrl);
      }

      setMetaSuccess("Author image uploaded.");
    } catch (err: any) {
      console.error(err);
      setMetaError(err.message || "Failed to upload author image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddTag = () => {
    const clean = tagInput.trim().toLowerCase();
    if (clean && !newTags.includes(clean)) {
      setNewTags([...newTags, clean]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setNewTags(newTags.filter((t) => t !== tagToRemove));
  };

  // Save Video
  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYoutubeId || !newTitle) {
      setMetaError("Video ID and Title are required.");
      return;
    }

    if (!newAuthor.trim()) {
      setMetaError("Please specify or select an author.");
      return;
    }

    if (!newSubject.trim()) {
      setMetaError("Please specify or select a category.");
      return;
    }

    setSavingVideo(true);
    setMetaError("");

    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: `https://www.youtube.com/watch?v=${newYoutubeId}`,
          youtubeId: newYoutubeId,
          title: newTitle,
          thumbnailUrl: newThumbnail,
          author: newAuthor.trim(),
          authorImageUrl: newAuthorImageUrl || null,
          subject: newSubject.trim(),
          tags: newTags,
          rating: newRating,
          duration: newDuration,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to save video");
      }

      setUrlInput("");
      setNewYoutubeId("");
      setNewTitle("");
      setNewAuthor("");
      setNewAuthorImageUrl("");
      setNewSubject("");
      setNewThumbnail("");
      setNewDuration(0);
      setNewTags([]);
      setNewRating(0);
      setMetaSuccess("Video successfully added to the TV library!");
      fetchVideos();
    } catch (err: any) {
      setMetaError(err.message || "Failed to save video.");
    } finally {
      setSavingVideo(false);
    }
  };

  const handleDeleteVideo = async (id: string) => {
    if (!confirm("Are you sure you want to remove this video from the TV library?")) return;
    try {
      const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setVideos((prev) => prev.filter((v) => v.id !== id));
      }
    } catch (err) {
      alert("Failed to delete video");
    }
  };

  const handleToggleArchive = async (video: VideoItem) => {
    const nextVal = !video.isArchived;
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: nextVal }),
      });
      const data = await res.json();
      if (data.success) {
        setVideos((prev) =>
          prev.map((v) => (v.id === video.id ? { ...v, isArchived: nextVal } : v))
        );
      }
    } catch (err) {
      alert("Failed to update archive status");
    }
  };

  const handleUpdateVideoRating = async (video: VideoItem, rating: VideoRating) => {
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      const data = await res.json();
      if (data.success) {
        setVideos((prev) =>
          prev.map((v) => (v.id === video.id ? { ...v, rating } : v))
        );
      }
    } catch (err) {
      alert("Failed to update rating");
    }
  };

  // Build searchable author options with image and video count (merged with DB Authors)
  const authorOptions: SearchableOption[] = useMemo(() => {
    const map = new Map<string, { image?: string | null; count: number }>();

    // First populate from registered dbAuthors
    dbAuthors.forEach((a) => {
      if (!a.name) return;
      const key = a.name.trim();
      map.set(key, { image: a.imageUrl || null, count: a.videoCount || 0 });
    });

    // Merge/count from actual videos
    videos.forEach((v) => {
      if (!v.author) return;
      const key = v.author.trim();
      const existing = map.get(key);
      if (existing) {
        if (!existing.image && v.authorImageUrl) existing.image = v.authorImageUrl;
      } else {
        map.set(key, { image: v.authorImageUrl || null, count: 1 });
      }
    });

    return Array.from(map.entries()).map(([authorName, data]) => ({
      label: authorName,
      value: authorName,
      image: data.image,
      subtitle: `${data.count} video${data.count === 1 ? "" : "s"} in library`,
    }));
  }, [videos, dbAuthors]);

  // Build searchable category options strictly from dbCategories and existing video subjects
  const subjectOptions: SearchableOption[] = useMemo(() => {
    const map = new Map<string, number>();

    // Register strictly from dbCategories (from categories page)
    dbCategories.forEach((c) => {
      if (!c.name) return;
      map.set(c.name.trim(), c.videoCount || 0);
    });

    // Also include any subjects found on existing videos
    videos.forEach((v) => {
      if (!v.subject) return;
      const key = v.subject.trim();
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map.entries()).map(([sub, count]) => ({
      label: sub,
      value: sub,
      subtitle: `${count} video${count === 1 ? "" : "s"} in library`,
    }));
  }, [videos, dbCategories]);

  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      if (filterRating !== "all" && v.rating !== Number(filterRating)) return false;
      if (filterArchived === "archived" && !v.isArchived) return false;
      if (filterArchived === "unarchived" && v.isArchived) return false;
      if (filterSubject !== "all" && v.subject !== filterSubject) return false;
      if (filterAuthor !== "all" && v.author !== filterAuthor) return false;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const matchesTitle = v.title.toLowerCase().includes(q);
        const matchesAuthor = v.author.toLowerCase().includes(q);
        const matchesSubject = v.subject.toLowerCase().includes(q);
        if (!matchesTitle && !matchesAuthor && !matchesSubject) return false;
      }
      return true;
    });
  }, [videos, filterRating, filterArchived, filterSubject, filterAuthor, filterSearch]);

  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    dbCategories.forEach((c) => set.add(c.name));
    videos.forEach((v) => {
      if (v.subject) set.add(v.subject);
    });
    return Array.from(set).sort();
  }, [videos, dbCategories]);

  const uniqueAuthors = useMemo(() => {
    const set = new Set<string>();
    dbAuthors.forEach((a) => set.add(a.name));
    videos.forEach((v) => {
      if (v.author) set.add(v.author);
    });
    return Array.from(set).sort();
  }, [videos, dbAuthors]);

  // Stats
  const stats = useMemo(() => {
    const total = videos.length;
    const archived = videos.filter((v) => v.isArchived).length;
    const fiveStars = videos.filter((v) => v.rating === 5).length;
    const fourPlusStars = videos.filter((v) => v.rating >= 4).length;
    const rated = videos.filter((v) => v.rating > 0).length;
    const notesCount = videos.reduce((acc, v) => acc + (v.notes?.length || 0), 0);
    return { total, archived, fiveStars, fourPlusStars, rated, notesCount };
  }, [videos]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-red-600 selection:text-white font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-8 py-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-10 rounded-xl bg-[#ff0000] flex items-center justify-center text-white font-black text-xl shadow-md">
            TV
          </div>
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              Admin &amp; Library Manager
              {isFirebaseConfigured && (
                <span className="text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-400" /> Firebase Storage
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400">Add videos, then search, select, or create authors &amp; categories</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/manage"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm border border-slate-700 hover:border-slate-600 transition-all shadow-md active:scale-95"
          >
            <FolderTree className="w-4 h-4 text-emerald-400" />
            <span>Manage Authors &amp; Categories</span>
          </Link>

          <Link
            href="/tv"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff0000] hover:bg-red-600 text-white font-bold text-base transition-all shadow-md shadow-red-600/20 active:scale-95"
          >
            <Tv className="w-5 h-5" />
            <span>Launch TV View (/tv)</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-8 space-y-8">
        {/* Statistics Row */}
        <section className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Total Videos</span>
            <p className="text-3xl font-black text-white mt-1">{stats.total}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <span className="text-xs uppercase font-bold text-sky-400 tracking-wider">Saved Archive</span>
            <p className="text-3xl font-black text-sky-400 mt-1">{stats.archived}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <span className="text-xs uppercase font-bold text-amber-400 tracking-wider">⭐ 5 Stars</span>
            <p className="text-3xl font-black text-amber-400 mt-1">{stats.fiveStars}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider">🌟 Top Rated (4+★)</span>
            <p className="text-3xl font-black text-emerald-400 mt-1">{stats.fourPlusStars}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <span className="text-xs uppercase font-bold text-blue-400 tracking-wider">✨ Total Rated</span>
            <p className="text-3xl font-black text-blue-400 mt-1">{stats.rated}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <span className="text-xs uppercase font-bold text-purple-400 tracking-wider">Viewer Notes</span>
            <p className="text-3xl font-black text-purple-400 mt-1">{stats.notesCount}</p>
          </div>
        </section>

        {/* Smart Video Addition Card */}
        <section className="bg-slate-900/95 border-2 border-slate-800 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#ff0000]/20 text-[#ff0000] border border-[#ff0000]/40">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">Smart Video &amp; Author Ingestion</h2>
                <p className="text-sm text-slate-400">
                  Paste a link and Gemini suggests the author, category and tags &bull; edit anything before saving
                </p>
              </div>
            </div>
          </div>

          {/* URL Input */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Paste YouTube URL or Video ID (e.g., https://www.youtube.com/watch?v=LXb3EKWsInQ)"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAutoFetch();
                  }
                }}
                className="w-full bg-slate-950 border-2 border-slate-700 focus:border-red-500 rounded-2xl px-5 py-4 text-white text-lg placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={handleAutoFetch}
              disabled={fetchingMeta}
              className="px-8 py-4 rounded-2xl bg-[#ff0000] hover:bg-red-600 disabled:bg-slate-800 text-white font-black text-lg transition-all flex items-center justify-center gap-3 shadow-lg shadow-red-600/20 whitespace-nowrap"
            >
              <Sparkles className={`w-5 h-5 ${fetchingMeta ? "animate-spin" : ""}`} />
              <span>{fetchingMeta ? "Analyzing with Gemini..." : "Auto-Fetch & Classify"}</span>
            </button>
          </div>

          {metaError && (
            <div className="mt-4 p-4 rounded-xl bg-rose-950/60 border border-rose-500 text-rose-300 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{metaError}</span>
            </div>
          )}

          {metaSuccess && (
            <div className="mt-4 p-4 rounded-xl bg-emerald-950/60 border border-emerald-500 text-emerald-300 text-sm flex items-center gap-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>{metaSuccess}</span>
            </div>
          )}

          {/* Pre-fill / Editable Form */}
          {newYoutubeId && (
            <form onSubmit={handleSaveVideo} className="mt-8 pt-6 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
              {/* Preview Thumbnail */}
              <div className="flex flex-col gap-4">
                <span className="text-xs uppercase font-bold text-slate-400">Video Preview</span>
                <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-700 bg-black">
                  <img
                    src={newThumbnail}
                    alt={newTitle}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/80 rounded font-mono text-xs text-white">
                    ID: {newYoutubeId}
                  </div>
                </div>

                {/* Author Avatar Upload Card */}
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                  <span className="text-xs uppercase font-bold text-slate-400 block">
                    Author Image / Avatar (Firebase Storage)
                  </span>

                  <div className="flex items-center gap-3">
                    {newAuthorImageUrl ? (
                      <img
                        src={newAuthorImageUrl}
                        alt="Author Preview"
                        className="w-16 h-16 rounded-full object-cover border border-slate-700 shadow-md"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                        <ImageIcon className="w-8 h-8 opacity-40" />
                      </div>
                    )}

                    <div className="flex-1 space-y-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingImage ? "Uploading..." : "Upload Author Image"}</span>
                      </button>
                      <p className="text-[10px] text-slate-500">Auto-loads if existing author selected</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editable Details with Searchable Dropdowns */}
              <div className="md:col-span-2 space-y-5">
                <div>
                  <label className="block text-xs uppercase font-bold text-slate-400 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-base font-semibold focus:border-red-500 outline-none"
                  />
                </div>

                {/* Searchable Dropdowns for Author and Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Searchable Author Dropdown */}
                  <SearchableSelect
                    label="Author / Channel"
                    value={newAuthor}
                    onChange={(val) => setNewAuthor(val)}
                    onSelectOption={(opt) => {
                      setNewAuthor(opt.value);
                      if (opt.image) {
                        setNewAuthorImageUrl(opt.image);
                      }
                    }}
                    options={authorOptions}
                    placeholder="Search existing or type new author..."
                    allowCustom={true}
                    required={true}
                    helperText="Pick from library or type to create new author"
                  />

                  {/* Searchable Category / Subject Dropdown */}
                  <SearchableSelect
                    label="Subject / Category"
                    value={newSubject}
                    onChange={(val) => setNewSubject(val)}
                    onSelectOption={(opt) => setNewSubject(opt.value)}
                    options={subjectOptions}
                    placeholder="Search existing or type new category..."
                    allowCustom={true}
                    required={true}
                    helperText="Pick from library or type to create new category"
                  />
                </div>

                {/* 5-Star Rating Selector */}
                <div>
                  <label className="block text-xs uppercase font-bold text-slate-400 mb-1">
                    Star Rating (1 - 5 Stars)
                  </label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setNewRating(newRating === star ? 0 : star)}
                        title={`${star} Star${star > 1 ? "s" : ""}`}
                        className={`p-1 rounded-lg transition-transform hover:scale-125 outline-none ${
                          newRating >= star ? "text-amber-400" : "text-slate-600 hover:text-slate-400"
                        }`}
                      >
                        <Star className={`w-6 h-6 ${newRating >= star ? "fill-amber-400" : ""}`} />
                      </button>
                    ))}
                    <span className="text-sm font-bold text-slate-300 ml-2">
                      {newRating > 0 ? `${newRating} / 5 Stars` : "Unrated"}
                    </span>
                    {newRating > 0 && (
                      <button
                        type="button"
                        onClick={() => setNewRating(0)}
                        className="text-xs text-slate-500 hover:text-red-400 underline ml-auto"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Tags Management */}
                <div>
                  <label className="block text-xs uppercase font-bold text-slate-400 mb-1">
                    Tags (Gemini AI Suggested)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {newTags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 font-semibold"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-rose-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add tag and press Enter"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:border-red-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold text-slate-200"
                    >
                      Add Tag
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingVideo}
                    className="px-8 py-3.5 rounded-xl bg-[#ff0000] hover:bg-red-600 text-white font-black text-lg transition-all shadow-lg flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    <span>{savingVideo ? "Saving Video..." : "Save to TV Library"}</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>

        {/* Video Library & User Feedback Table */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-2xl font-black text-white">TV Video Library &amp; Author Management</h2>
              <p className="text-sm text-slate-400">
                Filter by professional rating tiers, upload author images, or inspect TV viewer notes
              </p>
            </div>

            <div className="relative min-w-[280px]">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search title, author, category..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:border-red-500 outline-none"
              />
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterRating}
              onChange={(e) => setFilterRating(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:border-red-500 outline-none"
            >
              <option value="all">All Star Ratings</option>
              <option value="5">⭐⭐⭐⭐⭐ 5 Stars</option>
              <option value="4">⭐⭐⭐⭐ 4 Stars</option>
              <option value="3">⭐⭐⭐ 3 Stars</option>
              <option value="2">⭐⭐ 2 Stars</option>
              <option value="1">⭐ 1 Star</option>
              <option value="0">⚪ Unrated</option>
            </select>

            <select
              value={filterArchived}
              onChange={(e) => setFilterArchived(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:border-red-500 outline-none"
            >
              <option value="all">All Archive Status</option>
              <option value="archived">📁 Saved to Archive</option>
              <option value="unarchived">Unarchived</option>
            </select>

            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:border-red-500 outline-none"
            >
              <option value="all">All Categories</option>
              {uniqueSubjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={filterAuthor}
              onChange={(e) => setFilterAuthor(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:border-red-500 outline-none"
            >
              <option value="all">All Authors</option>
              {uniqueAuthors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            {(filterRating !== "all" ||
              filterArchived !== "all" ||
              filterSubject !== "all" ||
              filterAuthor !== "all" ||
              filterSearch) && (
              <button
                type="button"
                onClick={() => {
                  setFilterRating("all");
                  setFilterArchived("all");
                  setFilterSubject("all");
                  setFilterAuthor("all");
                  setFilterSearch("");
                }}
                className="text-xs text-[#ff0000] hover:underline px-2 py-1 font-semibold"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Videos Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-xs font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Video</th>
                  <th className="px-6 py-4">Author &amp; Avatar</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Star Rating</th>
                  <th className="px-6 py-4">Archive</th>
                  <th className="px-6 py-4">Notes</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredVideos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No matching videos found.
                    </td>
                  </tr>
                ) : (
                  filteredVideos.map((video) => (
                    <tr key={video.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            className="w-16 h-10 object-cover rounded-lg bg-black flex-shrink-0"
                          />
                          <div className="max-w-xs">
                            <span className="font-bold text-white block line-clamp-1">
                              {video.title}
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              {video.youtubeId}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {video.authorImageUrl ? (
                            <img
                              src={video.authorImageUrl}
                              alt={video.author}
                              className="w-9 h-9 rounded-full object-cover border border-slate-700"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white">
                              {video.author.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <span className="text-white font-medium block text-xs">
                              {video.author}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAuthorForVideo(video);
                                setTimeout(() => authorModalFileInputRef.current?.click(), 100);
                              }}
                              className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                            >
                              <Upload className="w-2.5 h-2.5" />
                              <span>{video.authorImageUrl ? "Change image" : "Upload avatar"}</span>
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-[#212121] text-slate-200 border border-slate-700 rounded-md text-xs font-semibold">
                          {video.subject}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1" title={video.rating > 0 ? `${video.rating} Stars` : "Unrated"}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleUpdateVideoRating(video, video.rating === star ? 0 : star)}
                              title={`Rate ${star} star${star > 1 ? "s" : ""}`}
                              className={`p-0.5 transition-transform hover:scale-125 outline-none ${
                                video.rating >= star ? "text-amber-400" : "text-slate-700 hover:text-slate-400"
                              }`}
                            >
                              <Star className={`w-4 h-4 ${video.rating >= star ? "fill-amber-400" : ""}`} />
                            </button>
                          ))}
                          <span className="text-xs font-semibold text-slate-400 ml-1.5">
                            {video.rating > 0 ? `${video.rating}★` : "—"}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(video)}
                          title="Click to toggle archive"
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                            video.isArchived
                              ? "bg-sky-500/20 text-sky-400 border border-sky-400/40"
                              : "bg-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          {video.isArchived ? (
                            <>
                              <BookmarkCheck className="w-4 h-4" /> Saved
                            </>
                          ) : (
                            <>
                              <Bookmark className="w-4 h-4" /> Save
                            </>
                          )}
                        </button>
                      </td>

                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedVideoForNotes(video)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                        >
                          <MessageSquare className="w-4 h-4 text-[#ff0000]" />
                          <span>{video.notes?.length || 0} notes</span>
                        </button>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={video.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open on YouTube"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>

                          <button
                            type="button"
                            onClick={() => handleDeleteVideo(video.id)}
                            title="Delete Video"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Hidden File Input for Author Image editing */}
      <input
        ref={authorModalFileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileUpload(e, editingAuthorForVideo?.author)}
        className="hidden"
      />

      {/* Notes Modal for Administrator Inspection */}
      {selectedVideoForNotes && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in font-sans">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 max-w-2xl w-full shadow-2xl text-white flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#ff0000]/20 text-[#ff0000]">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black">{selectedVideoForNotes.title}</h3>
                  <p className="text-xs text-slate-400">
                    Viewer Voice &amp; Remote Notes ({selectedVideoForNotes.notes?.length || 0})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVideoForNotes(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1">
              {!selectedVideoForNotes.notes || selectedVideoForNotes.notes.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No notes have been added by the TV user for this video yet.
                </div>
              ) : (
                selectedVideoForNotes.notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-4 bg-slate-950 border border-slate-800 rounded-2xl"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      {note.videoTimestamp !== undefined && note.videoTimestamp !== null ? (
                        <span className="flex items-center gap-1 text-[#38bdf8] font-mono font-bold bg-[#0284c7]/10 px-2 py-0.5 rounded">
                          <Clock className="w-3.5 h-3.5" />
                          {formatTimestamp(note.videoTimestamp)}
                        </span>
                      ) : (
                        <span className="text-slate-500">General Note</span>
                      )}

                      <span className="text-slate-500">
                        {new Date(note.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-base text-slate-100 font-medium">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
