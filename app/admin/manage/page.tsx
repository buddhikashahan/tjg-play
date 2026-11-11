"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Users,
  FolderTree,
  Plus,
  Search,
  Edit2,
  Trash2,
  Upload,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Tv,
  ArrowLeft,
  ExternalLink,
  X,
  Check,
  Video,
  Palette,
} from "lucide-react";
import { AuthorItem, CategoryItem } from "@/lib/types";

const COLOR_PALETTE = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Emerald", value: "#10b981" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#f43f5e" },
];

export default function ManageTaxonomyPage() {
  const [activeTab, setActiveTab] = useState<"authors" | "categories">("authors");

  // Authors State
  const [authors, setAuthors] = useState<AuthorItem[]>([]);
  const [loadingAuthors, setLoadingAuthors] = useState(true);
  const [authorSearch, setAuthorSearch] = useState("");

  // Categories State
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categorySearch, setCategorySearch] = useState("");

  // Add Author Form
  const [showAddAuthor, setShowAddAuthor] = useState(false);
  const [newAuthorName, setNewAuthorName] = useState("");
  const [newAuthorImage, setNewAuthorImage] = useState("");
  const [newAuthorBio, setNewAuthorBio] = useState("");
  const [savingAuthor, setSavingAuthor] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit Author State
  const [editingAuthor, setEditingAuthor] = useState<AuthorItem | null>(null);
  const [editAuthorName, setEditAuthorName] = useState("");
  const [editAuthorImage, setEditAuthorImage] = useState("");
  const [editAuthorBio, setEditAuthorBio] = useState("");
  const [editUpdateVideos, setEditUpdateVideos] = useState(true);
  const [savingAuthorEdit, setSavingAuthorEdit] = useState(false);

  // Delete Author State
  const [deletingAuthor, setDeletingAuthor] = useState<AuthorItem | null>(null);
  const [deleteAuthorMode, setDeleteAuthorMode] = useState<"keep" | "reassign" | "delete_videos">("keep");
  const [reassignAuthorTo, setReassignAuthorTo] = useState("");
  const [deletingAuthorProgress, setDeletingAuthorProgress] = useState(false);

  // Add Category Form
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_PALETTE[0].value);
  const [savingCategory, setSavingCategory] = useState(false);

  // Edit Category State
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryDesc, setEditCategoryDesc] = useState("");
  const [editCategoryColor, setEditCategoryColor] = useState(COLOR_PALETTE[0].value);
  const [editCategoryUpdateVideos, setEditCategoryUpdateVideos] = useState(true);
  const [savingCategoryEdit, setSavingCategoryEdit] = useState(false);

  // Delete Category State
  const [deletingCategory, setDeletingCategory] = useState<CategoryItem | null>(null);
  const [deleteCategoryMode, setDeleteCategoryMode] = useState<"keep" | "reassign" | "delete_videos">("keep");
  const [reassignCategoryTo, setReassignCategoryTo] = useState("");
  const [deletingCategoryProgress, setDeletingCategoryProgress] = useState(false);

  // Global Alerts & Syncing
  const [syncing, setSyncing] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  // Display alert and auto-hide
  const showAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  // Fetch Authors
  const fetchAuthors = async (sync = false) => {
    setLoadingAuthors(true);
    try {
      const res = await fetch(`/api/authors${sync ? "?sync=true" : ""}`);
      const data = await res.json();
      if (data.success) {
        setAuthors(data.authors || []);
      }
    } catch (e) {
      console.error("Error fetching authors:", e);
    } finally {
      setLoadingAuthors(false);
    }
  };

  // Fetch Categories
  const fetchCategories = async (sync = false) => {
    setLoadingCategories(true);
    try {
      const res = await fetch(`/api/categories${sync ? "?sync=true" : ""}`);
      const data = await res.json();
      if (data.success) {
        setCategories(data.categories || []);
      }
    } catch (e) {
      console.error("Error fetching categories:", e);
    } finally {
      setLoadingCategories(false);
    }
  };

  useEffect(() => {
    fetchAuthors();
    fetchCategories();
  }, []);

  // Sync with videos handler
  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      await Promise.all([fetchAuthors(true), fetchCategories(true)]);
      showAlert("success", "Successfully synchronized Authors and Categories with video database!");
    } catch (err) {
      showAlert("error", "Failed to sync with videos");
    } finally {
      setSyncing(false);
    }
  };

  // Upload Avatar handler
  const handleUploadAvatar = async (file: File, isEdit = false, authorName = "") => {
    try {
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("authorName", authorName || newAuthorName || "author");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success && data.url) {
        if (isEdit) {
          setEditAuthorImage(data.url);
        } else {
          setNewAuthorImage(data.url);
        }
        showAlert("success", "Author photo uploaded successfully!");
      } else {
        showAlert("error", data.error || "Failed to upload photo");
      }
    } catch (err: any) {
      showAlert("error", err.message || "Photo upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Create Author
  const handleCreateAuthor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuthorName.trim()) {
      showAlert("error", "Author name is required");
      return;
    }

    setSavingAuthor(true);
    try {
      const res = await fetch("/api/authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAuthorName.trim(),
          imageUrl: newAuthorImage.trim() || null,
          bio: newAuthorBio.trim() || null,
        }),
      });
      const data = await res.json();

      if (data.success) {
        showAlert("success", data.message || "Author created successfully");
        setNewAuthorName("");
        setNewAuthorImage("");
        setNewAuthorBio("");
        setShowAddAuthor(false);
        fetchAuthors();
      } else {
        showAlert("error", data.error || "Failed to create author");
      }
    } catch (err: any) {
      showAlert("error", err.message || "Failed to create author");
    } finally {
      setSavingAuthor(false);
    }
  };

  // Open Edit Author Modal
  const openEditAuthor = (author: AuthorItem) => {
    setEditingAuthor(author);
    setEditAuthorName(author.name);
    setEditAuthorImage(author.imageUrl || "");
    setEditAuthorBio(author.bio || "");
    setEditUpdateVideos(true);
  };

  // Save Edit Author
  const handleSaveAuthorEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAuthor || !editAuthorName.trim()) return;

    setSavingAuthorEdit(true);
    try {
      const res = await fetch("/api/authors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingAuthor.id,
          name: editAuthorName.trim(),
          imageUrl: editAuthorImage.trim() || null,
          bio: editAuthorBio.trim() || null,
          updateVideos: editUpdateVideos,
        }),
      });
      const data = await res.json();

      if (data.success) {
        showAlert("success", data.message || "Author updated");
        setEditingAuthor(null);
        fetchAuthors();
      } else {
        showAlert("error", data.error || "Failed to update author");
      }
    } catch (err: any) {
      showAlert("error", err.message || "Failed to update author");
    } finally {
      setSavingAuthorEdit(false);
    }
  };

  // Handle Delete Author
  const handleDeleteAuthor = async () => {
    if (!deletingAuthor) return;

    setDeletingAuthorProgress(true);
    try {
      const res = await fetch("/api/authors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deletingAuthor.id,
          deleteVideos: deleteAuthorMode === "delete_videos",
          reassignTo: deleteAuthorMode === "reassign" ? reassignAuthorTo : undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        showAlert("success", data.message || "Author deleted");
        setDeletingAuthor(null);
        fetchAuthors();
      } else {
        showAlert("error", data.error || "Failed to delete author");
      }
    } catch (err: any) {
      showAlert("error", err.message || "Failed to delete author");
    } finally {
      setDeletingAuthorProgress(false);
    }
  };

  // Create Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      showAlert("error", "Category name is required");
      return;
    }

    setSavingCategory(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          description: newCategoryDesc.trim() || null,
          color: newCategoryColor,
        }),
      });
      const data = await res.json();

      if (data.success) {
        showAlert("success", data.message || "Category created successfully");
        setNewCategoryName("");
        setNewCategoryDesc("");
        setNewCategoryColor(COLOR_PALETTE[0].value);
        setShowAddCategory(false);
        fetchCategories();
      } else {
        showAlert("error", data.error || "Failed to create category");
      }
    } catch (err: any) {
      showAlert("error", err.message || "Failed to create category");
    } finally {
      setSavingCategory(false);
    }
  };

  // Open Edit Category Modal
  const openEditCategory = (cat: CategoryItem) => {
    setEditingCategory(cat);
    setEditCategoryName(cat.name);
    setEditCategoryDesc(cat.description || "");
    setEditCategoryColor(cat.color || COLOR_PALETTE[0].value);
    setEditCategoryUpdateVideos(true);
  };

  // Save Edit Category
  const handleSaveCategoryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editCategoryName.trim()) return;

    setSavingCategoryEdit(true);
    try {
      const res = await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCategory.id,
          name: editCategoryName.trim(),
          description: editCategoryDesc.trim() || null,
          color: editCategoryColor,
          updateVideos: editCategoryUpdateVideos,
        }),
      });
      const data = await res.json();

      if (data.success) {
        showAlert("success", data.message || "Category updated");
        setEditingCategory(null);
        fetchCategories();
      } else {
        showAlert("error", data.error || "Failed to update category");
      }
    } catch (err: any) {
      showAlert("error", err.message || "Failed to update category");
    } finally {
      setSavingCategoryEdit(false);
    }
  };

  // Handle Delete Category
  const handleDeleteCategory = async () => {
    if (!deletingCategory) return;

    setDeletingCategoryProgress(true);
    try {
      const res = await fetch("/api/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deletingCategory.id,
          deleteVideos: deleteCategoryMode === "delete_videos",
          reassignTo: deleteCategoryMode === "reassign" ? reassignCategoryTo : undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        showAlert("success", data.message || "Category deleted");
        setDeletingCategory(null);
        fetchCategories();
      } else {
        showAlert("error", data.error || "Failed to delete category");
      }
    } catch (err: any) {
      showAlert("error", err.message || "Failed to delete category");
    } finally {
      setDeletingCategoryProgress(false);
    }
  };

  // Filtered lists
  const filteredAuthors = useMemo(() => {
    if (!authorSearch.trim()) return authors;
    const q = authorSearch.toLowerCase();
    return authors.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.bio && a.bio.toLowerCase().includes(q))
    );
  }, [authors, authorSearch]);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const q = categorySearch.toLowerCase();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [categories, categorySearch]);

  return (
    <div className="min-h-screen bg-[#0d0f12] text-slate-100 flex flex-col font-sans">
      {/* Top Banner Toast Alert */}
      {alert && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl backdrop-blur-md border text-sm font-medium animate-in fade-in slide-in-from-top-4 ${
            alert.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-200"
              : "bg-red-950/90 border-red-500/50 text-red-200"
          }`}
        >
          {alert.type === "success" ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span>{alert.message}</span>
        </div>
      )}

      {/* Admin Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#161a22]/90 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Video Library</span>
          </Link>
          <div className="h-5 w-px bg-slate-800" />
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-gradient-to-tr from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-950/50">
              <FolderTree className="w-5 h-5" />
            </span>
            <span>Authors & Categories Manager</span>
          </h1>
        </div>

        {/* Action Controls & External Links */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Scan database to import any authors or categories present in videos but missing here"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-amber-400" : ""}`} />
            <span>{syncing ? "Syncing..." : "Sync from Videos"}</span>
          </button>

          <Link
            href="/tv"
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg shadow-red-950/40 transition-all active:scale-95"
          >
            <Tv className="w-4 h-4" />
            <span>Open TV App</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2 p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab("authors")}
              className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === "authors"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-950/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Authors & Speakers</span>
              <span
                className={`ml-1 text-xs px-2 py-0.5 rounded-full ${
                  activeTab === "authors"
                    ? "bg-white/20 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {authors.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("categories")}
              className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === "categories"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <FolderTree className="w-4 h-4" />
              <span>Categories & Subjects</span>
              <span
                className={`ml-1 text-xs px-2 py-0.5 rounded-full ${
                  activeTab === "categories"
                    ? "bg-white/20 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {categories.length}
              </span>
            </button>
          </div>

          {/* Quick Add Button */}
          {activeTab === "authors" ? (
            <button
              onClick={() => setShowAddAuthor(!showAddAuthor)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950/50 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Author</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAddCategory(!showAddCategory)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Category</span>
            </button>
          )}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: AUTHORS MANAGEMENT                                                */}
        {/* ========================================================================= */}
        {activeTab === "authors" && (
          <div className="space-y-6">
            {/* Add Author Expandable Card */}
            {showAddAuthor && (
              <div className="bg-[#161a22] border border-blue-500/30 rounded-2xl p-6 shadow-xl space-y-4 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-400" />
                    <span>Create New Author / Speaker</span>
                  </h2>
                  <button
                    onClick={() => setShowAddAuthor(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateAuthor} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Author Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                        Author / Speaker Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newAuthorName}
                        onChange={(e) => setNewAuthorName(e.target.value)}
                        placeholder="e.g. Ven. Kiribathgoda Gnanananda Thero"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* Author Avatar Upload or URL */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                        Author Photo / Avatar
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center">
                          {newAuthorImage ? (
                            <img
                              src={newAuthorImage}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                              onError={(e) => ((e.currentTarget as any).src = "")}
                            />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-slate-500" />
                          )}
                        </div>

                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadAvatar(file, false);
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingAvatar}
                          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5 text-blue-400" />
                          <span>{uploadingAvatar ? "Uploading..." : "Upload Photo"}</span>
                        </button>

                        <input
                          type="url"
                          value={newAuthorImage}
                          onChange={(e) => setNewAuthorImage(e.target.value)}
                          placeholder="or paste image URL..."
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bio / Description */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Bio or Description (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={newAuthorBio}
                      onChange={(e) => setNewAuthorBio(e.target.value)}
                      placeholder="Brief details about this speaker or teacher..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddAuthor(false)}
                      className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingAuthor}
                      className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950/40 disabled:opacity-50"
                    >
                      {savingAuthor ? "Saving..." : "Save Author"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Author Search & Stats */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={authorSearch}
                  onChange={(e) => setAuthorSearch(e.target.value)}
                  placeholder="Search authors by name..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/80"
                />
                {authorSearch && (
                  <button
                    onClick={() => setAuthorSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="text-xs text-slate-400 font-medium">
                Showing <strong className="text-white">{filteredAuthors.length}</strong> of{" "}
                <strong className="text-white">{authors.length}</strong> authors
              </div>
            </div>

            {/* Authors Grid */}
            {loadingAuthors ? (
              <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                <span>Loading authors...</span>
              </div>
            ) : filteredAuthors.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 p-8 space-y-3">
                <Users className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm">
                  {authorSearch ? `No authors matching "${authorSearch}"` : "No authors found yet."}
                </p>
                <button
                  onClick={() => setShowAddAuthor(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Add Your First Author
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredAuthors.map((author) => (
                  <div
                    key={author.id}
                    className="group bg-[#161a22] border border-slate-800/90 hover:border-blue-500/50 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-blue-950/20"
                  >
                    <div className="space-y-3.5">
                      <div className="flex items-start justify-between gap-3">
                        {/* Avatar */}
                        <div className="relative">
                          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border-2 border-slate-700/80 group-hover:border-blue-500/60 transition-colors shrink-0 flex items-center justify-center shadow-md">
                            {author.imageUrl ? (
                              <img
                                src={author.imageUrl}
                                alt={author.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xl font-bold text-blue-400">
                                {author.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          {author.imageUrl && (
                            <span className="absolute -bottom-1 -right-1 p-1 bg-emerald-500 rounded-full border-2 border-[#161a22]" />
                          )}
                        </div>

                        {/* Top Badges */}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-950/60 border border-blue-800/40 text-blue-300">
                          <Video className="w-3.5 h-3.5" />
                          <span>{author.videoCount || 0} Videos</span>
                        </span>
                      </div>

                      {/* Info */}
                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-1">
                          {author.name}
                        </h3>
                        {author.bio ? (
                          <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                            {author.bio}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-600 italic mt-1">No description added</p>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <Link
                        href={`/admin?author=${encodeURIComponent(author.name)}`}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-medium hover:underline"
                        title="Filter videos in admin"
                      >
                        <span>View Videos</span>
                      </Link>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditAuthor(author)}
                          className="p-2 rounded-xl text-slate-400 hover:text-blue-400 hover:bg-blue-950/40 border border-transparent hover:border-blue-800/50 transition-all"
                          title="Edit Author"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingAuthor(author);
                            setDeleteAuthorMode("keep");
                            setReassignAuthorTo("");
                          }}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-800/50 transition-all"
                          title="Delete Author"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: CATEGORIES MANAGEMENT                                             */}
        {/* ========================================================================= */}
        {activeTab === "categories" && (
          <div className="space-y-6">
            {/* Add Category Expandable Card */}
            {showAddCategory && (
              <div className="bg-[#161a22] border border-emerald-500/30 rounded-2xl p-6 shadow-xl space-y-4 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <FolderTree className="w-5 h-5 text-emerald-400" />
                    <span>Create New Category / Subject</span>
                  </h2>
                  <button
                    onClick={() => setShowAddCategory(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateCategory} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Category Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                        Category Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="e.g. Abhidhamma, Meditation, Sutra..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Color Accent */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Accent Color</span>
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {COLOR_PALETTE.map((c) => (
                          <button
                            type="button"
                            key={c.value}
                            onClick={() => setNewCategoryColor(c.value)}
                            className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                              newCategoryColor === c.value ? "scale-110 ring-2 ring-white" : "opacity-80 hover:opacity-100"
                            }`}
                            style={{ backgroundColor: c.value }}
                          >
                            {newCategoryColor === c.value && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Description (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={newCategoryDesc}
                      onChange={(e) => setNewCategoryDesc(e.target.value)}
                      placeholder="Brief description for this category..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddCategory(false)}
                      className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingCategory}
                      className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 disabled:opacity-50"
                    >
                      {savingCategory ? "Saving..." : "Save Category"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Category Search & Stats */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Search categories..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/80"
                />
                {categorySearch && (
                  <button
                    onClick={() => setCategorySearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="text-xs text-slate-400 font-medium">
                Showing <strong className="text-white">{filteredCategories.length}</strong> of{" "}
                <strong className="text-white">{categories.length}</strong> categories
              </div>
            </div>

            {/* Categories Grid */}
            {loadingCategories ? (
              <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                <span>Loading categories...</span>
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 p-8 space-y-3">
                <FolderTree className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm">
                  {categorySearch ? `No categories matching "${categorySearch}"` : "No categories created yet."}
                </p>
                <button
                  onClick={() => setShowAddCategory(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  Add Your First Category
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCategories.map((category) => (
                  <div
                    key={category.id}
                    className="group bg-[#161a22] border border-slate-800/90 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-slate-950/40 relative overflow-hidden"
                  >
                    {/* Top colored accent bar */}
                    <div
                      className="absolute top-0 left-0 right-0 h-1.5 transition-all group-hover:h-2"
                      style={{ backgroundColor: category.color || "#10b981" }}
                    />

                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: category.color || "#10b981" }}
                        />
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800/80 border border-slate-700/60 text-slate-300">
                          <Video className="w-3.5 h-3.5 text-slate-400" />
                          <span>{category.videoCount || 0} Videos</span>
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                          {category.name}
                        </h3>
                        {category.description ? (
                          <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                            {category.description}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-600 italic mt-1">No description added</p>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <Link
                        href={`/admin?subject=${encodeURIComponent(category.name)}`}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-medium hover:underline"
                        title="Filter videos in admin"
                      >
                        <span>View Videos</span>
                      </Link>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditCategory(category)}
                          className="p-2 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-emerald-950/40 border border-transparent hover:border-emerald-800/50 transition-all"
                          title="Edit Category"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingCategory(category);
                            setDeleteCategoryMode("keep");
                            setReassignCategoryTo("");
                          }}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-800/50 transition-all"
                          title="Delete Category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL: EDIT AUTHOR                                                        */}
      {/* ========================================================================= */}
      {editingAuthor && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161a22] border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-400" />
                <span>Edit Author</span>
              </h2>
              <button
                onClick={() => setEditingAuthor(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAuthorEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Author Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editAuthorName}
                  onChange={(e) => setEditAuthorName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Author Photo / Avatar
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center">
                    {editAuthorImage ? (
                      <img
                        src={editAuthorImage}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                        onError={(e) => ((e.currentTarget as any).src = "")}
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-500" />
                    )}
                  </div>

                  <input
                    type="file"
                    ref={editFileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadAvatar(file, true, editAuthorName);
                    }}
                  />

                  <div className="space-y-2 flex-1">
                    <button
                      type="button"
                      onClick={() => editFileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-400" />
                      <span>{uploadingAvatar ? "Uploading..." : "Upload New Photo"}</span>
                    </button>
                    <input
                      type="url"
                      value={editAuthorImage}
                      onChange={(e) => setEditAuthorImage(e.target.value)}
                      placeholder="or image URL..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Bio / Details
                </label>
                <textarea
                  rows={2}
                  value={editAuthorBio}
                  onChange={(e) => setEditAuthorBio(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Cascade update checkbox */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editUpdateVideos}
                  onChange={(e) => setEditUpdateVideos(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded bg-slate-800 border-slate-700"
                />
                <span className="text-xs text-slate-300">
                  Automatically update name & avatar for all existing videos by this author
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAuthor(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAuthorEdit}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg disabled:opacity-50"
                >
                  {savingAuthorEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE AUTHOR                                                      */}
      {/* ========================================================================= */}
      {deletingAuthor && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161a22] border border-red-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                <span>Delete Author: {deletingAuthor.name}</span>
              </h2>
              <button
                onClick={() => setDeletingAuthor(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-300">
              This author currently has{" "}
              <strong className="text-white">{deletingAuthor.videoCount || 0}</strong> video(s)
              assigned. What would you like to do with them?
            </p>

            <div className="space-y-2.5">
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="delAuthorOpt"
                  checked={deleteAuthorMode === "keep"}
                  onChange={() => setDeleteAuthorMode("keep")}
                  className="w-4 h-4 text-red-500"
                />
                <span className="text-xs text-slate-300">
                  Keep videos intact (author remains labeled as &quot;{deletingAuthor.name}&quot;)
                </span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="delAuthorOpt"
                  checked={deleteAuthorMode === "reassign"}
                  onChange={() => setDeleteAuthorMode("reassign")}
                  className="w-4 h-4 text-red-500"
                />
                <span className="text-xs text-slate-300">Reassign videos to another author:</span>
              </label>

              {deleteAuthorMode === "reassign" && (
                <div className="pl-6">
                  <select
                    value={reassignAuthorTo}
                    onChange={(e) => setReassignAuthorTo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">Select replacement author...</option>
                    {authors
                      .filter((a) => a.id !== deletingAuthor.id)
                      .map((a) => (
                        <option key={a.id} value={a.name}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-3 p-3 rounded-xl bg-red-950/30 border border-red-900/40 cursor-pointer">
                <input
                  type="radio"
                  name="delAuthorOpt"
                  checked={deleteAuthorMode === "delete_videos"}
                  onChange={() => setDeleteAuthorMode("delete_videos")}
                  className="w-4 h-4 text-red-500"
                />
                <span className="text-xs text-red-300 font-medium">
                  Delete all {deletingAuthor.videoCount || 0} associated videos permanently
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingAuthor(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAuthor}
                disabled={deletingAuthorProgress}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg disabled:opacity-50"
              >
                {deletingAuthorProgress ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT CATEGORY                                                      */}
      {/* ========================================================================= */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161a22] border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-emerald-400" />
                <span>Edit Category</span>
              </h2>
              <button
                onClick={() => setEditingCategory(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategoryEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Category Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editCategoryName}
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Accent Color</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      type="button"
                      key={c.value}
                      onClick={() => setEditCategoryColor(c.value)}
                      className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                        editCategoryColor === c.value ? "scale-110 ring-2 ring-white" : "opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c.value }}
                    >
                      {editCategoryColor === c.value && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editCategoryDesc}
                  onChange={(e) => setEditCategoryDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editCategoryUpdateVideos}
                  onChange={(e) => setEditCategoryUpdateVideos(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded bg-slate-800 border-slate-700"
                />
                <span className="text-xs text-slate-300">
                  Automatically update category name for all existing videos
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCategoryEdit}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg disabled:opacity-50"
                >
                  {savingCategoryEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE CATEGORY                                                    */}
      {/* ========================================================================= */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161a22] border border-red-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                <span>Delete Category: {deletingCategory.name}</span>
              </h2>
              <button
                onClick={() => setDeletingCategory(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-300">
              This category currently has{" "}
              <strong className="text-white">{deletingCategory.videoCount || 0}</strong> video(s).
              What would you like to do?
            </p>

            <div className="space-y-2.5">
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="delCatOpt"
                  checked={deleteCategoryMode === "keep"}
                  onChange={() => setDeleteCategoryMode("keep")}
                  className="w-4 h-4 text-red-500"
                />
                <span className="text-xs text-slate-300">
                  Keep videos intact (category remains &quot;{deletingCategory.name}&quot;)
                </span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="delCatOpt"
                  checked={deleteCategoryMode === "reassign"}
                  onChange={() => setDeleteCategoryMode("reassign")}
                  className="w-4 h-4 text-red-500"
                />
                <span className="text-xs text-slate-300">Reassign videos to another category:</span>
              </label>

              {deleteCategoryMode === "reassign" && (
                <div className="pl-6">
                  <select
                    value={reassignCategoryTo}
                    onChange={(e) => setReassignCategoryTo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">Select replacement category...</option>
                    {categories
                      .filter((c) => c.id !== deletingCategory.id)
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-3 p-3 rounded-xl bg-red-950/30 border border-red-900/40 cursor-pointer">
                <input
                  type="radio"
                  name="delCatOpt"
                  checked={deleteCategoryMode === "delete_videos"}
                  onChange={() => setDeleteCategoryMode("delete_videos")}
                  className="w-4 h-4 text-red-500"
                />
                <span className="text-xs text-red-300 font-medium">
                  Delete all {deletingCategory.videoCount || 0} associated videos permanently
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCategory}
                disabled={deletingCategoryProgress}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg disabled:opacity-50"
              >
                {deletingCategoryProgress ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

