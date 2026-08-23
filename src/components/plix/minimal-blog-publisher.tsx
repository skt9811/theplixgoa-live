import { useRef, useState } from "react";
import { toast } from "sonner";
import { TriangleAlert as AlertTriangle, CalendarClock, CircleCheck as CheckCircle2, Clock, Image as ImageIcon, Loader as Loader2, Pencil, Save, Send, Trash2, Upload, X } from "lucide-react";
import {
  saveBlogPost,
  deleteBlogPost,
  slugify,
  autoFormatContent,
  estimateReadingTime,
  fetchAllBlogsAdmin,
  type BlogPost,
} from "@/lib/blog";

const CATEGORIES = ["Nightlife", "Travel Tips", "Local Guides", "Villas", "Luxury Stays", "Food & Dining"];

function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function isScheduled(publishedAt: string): boolean {
  return new Date(publishedAt).getTime() > Date.now();
}

export function MinimalBlogPublisher() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Nightlife");
  const [coverImage, setCoverImage] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [content, setContent] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadPosts() {
    const data = await fetchAllBlogsAdmin();
    setPosts(data);
    setLoaded(true);
  }

  if (!loaded) {
    void loadPosts();
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setCategory("Nightlife");
    setCoverImage("");
    setPublishDate("");
    setContent("");
    setShowUrlInput(false);
    setUrlInput("");
  }

  function startEdit(post: BlogPost) {
    setEditingId(post.id);
    setTitle(post.title);
    setCategory(post.category);
    setCoverImage(post.cover_image);
    setPublishDate(toDatetimeLocal(post.published_at));
    setContent(post.content);
    setShowUrlInput(false);
    setUrlInput("");
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCoverImage(reader.result as string);
      setShowUrlInput(false);
      toast.success("Image uploaded");
    };
    reader.onerror = () => toast.error("Failed to read image");
    reader.readAsDataURL(file);
  }

  function applyUrl() {
    if (!urlInput.trim()) return;
    setCoverImage(urlInput.trim());
    setShowUrlInput(false);
    setUrlInput("");
    toast.success("Image URL set");
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setPublishing(true);

    const formattedContent = autoFormatContent(content);
    const excerpt = content.replace(/<[^>]*>/g, "").slice(0, 140);
    const publishedAt = publishDate
      ? new Date(publishDate).toISOString()
      : new Date().toISOString();

    const { error } = await saveBlogPost({
      id: editingId ?? undefined,
      title: title.trim(),
      slug: slugify(title),
      category,
      cover_image: coverImage,
      excerpt,
      content: formattedContent,
      author: "Plix Hospitality",
      published_at: publishedAt,
    });

    setPublishing(false);

    if (error) {
      toast.error(editingId ? "Failed to update" : "Failed to publish");
      return;
    }

    const isSched = new Date(publishedAt).getTime() > Date.now();
    toast.success(editingId ? "Blog post updated" : isSched ? "Blog post scheduled" : "Blog post published");
    resetForm();
    void loadPosts();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteBlogPost(deleteTarget.id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Blog post deleted");
    setDeleteTarget(null);
    void loadPosts();
  }

  const wordCount = content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  const readingTime = estimateReadingTime(content);

  return (
    <div className="grid gap-5">
      {/* Publisher form */}
      <form onSubmit={publish} className="w-full max-w-full overflow-x-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            {editingId ? "Edit Blog Post" : "New Blog Post"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-white/50 hover:text-white"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title"
            className="w-full rounded-lg border border-white/15 bg-white/10 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-bronze/50"
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/10 px-3.5 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-navy">{c}</option>
              ))}
            </select>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                <CalendarClock className="size-3.5" />
                Publish Date & Time
              </label>
              <input
                type="datetime-local"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50 [color-scheme:dark]"
              />
              <p className="mt-1 text-[10px] text-white/40">
                {publishDate && new Date(publishDate) > new Date()
                  ? "Will be scheduled (hidden until publish date)"
                  : "Leave empty to publish immediately"}
              </p>
            </div>
          </div>

          {/* Dual Image Upload Component */}
          <div className="w-full overflow-x-hidden rounded-xl border border-white/15 bg-white/[0.06] p-4">
            <label className="text-xs font-medium text-white/70">Cover Image</label>

            {coverImage ? (
              <div className="relative mt-2">
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="h-32 w-full rounded-lg object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                />
                <button
                  type="button"
                  onClick={() => { setCoverImage(""); setShowUrlInput(false); }}
                  className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white transition-colors hover:bg-red-600"
                >
                  <X className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 w-full rounded-lg border border-white/15 py-2 text-xs font-medium text-white/70 hover:bg-white/10"
                >
                  Replace Image
                </button>
              </div>
            ) : (
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/25 bg-white/[0.03] py-6 text-sm text-white/50 transition-colors hover:border-bronze/50 hover:text-white/70"
                >
                  <Upload className="size-4" />
                  Upload from device
                </button>
                {showUrlInput ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="w-full flex-1 rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-bronze/50"
                    />
                    <button
                      type="button"
                      onClick={applyUrl}
                      className="shrink-0 rounded-lg bg-white/15 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/25"
                    >
                      Set
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(true)}
                    className="flex items-center justify-center gap-1.5 text-xs text-white/40 hover:text-white/60"
                  >
                    <ImageIcon className="size-3" />
                    Or paste an image URL
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Content textarea with reading time */}
          <div className="w-full">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-white/70">Content (HTML supported)</label>
              {wordCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-white/40">
                  <Clock className="size-3" />
                  {readingTime} min read · {wordCount} words
                </span>
              )}
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={7}
              placeholder="Write your post content here. HTML tags like <p>, <h2>, <strong> are supported. Raw text will be auto-wrapped in styled paragraphs."
              className="w-full rounded-lg border border-white/15 bg-white/10 px-3.5 py-3 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-bronze/50"
              required
            />
          </div>

          <button
            type="submit"
            disabled={publishing}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-bronze px-5 py-3.5 text-sm font-semibold text-bronze-foreground transition-transform active:scale-95 disabled:opacity-40"
          >
            {publishing ? <Loader2 className="size-4 animate-spin" /> : editingId ? <Save className="size-4" /> : <Send className="size-4" />}
            {editingId ? "Update Blog Post" : "Publish Post"}
          </button>
        </div>
      </form>

      {/* Existing posts with status badges */}
      <div className="w-full max-w-full overflow-x-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-base font-semibold text-white">All Posts</h2>
        <div className="mt-3 grid gap-2">
          {posts.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/40">No posts yet</p>
          ) : (
            posts.map((post) => {
              const scheduled = isScheduled(post.published_at);
              return (
                <div
                  key={post.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-white/20"
                >
                  {post.cover_image ? (
                    <img
                      src={post.cover_image}
                      alt=""
                      className="size-11 shrink-0 rounded-lg object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[10px] text-white/40">
                      N/A
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{post.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-white/40">
                      <span>{post.category}</span>
                      <span>·</span>
                      <span>{estimateReadingTime(post.content)} min read</span>
                      {scheduled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                          <Clock className="size-2.5" />
                          Scheduled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          <CheckCircle2 className="size-2.5" />
                          Live
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => startEdit(post)}
                      className="rounded-lg border border-white/15 p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(post)}
                      className="rounded-lg border border-red-500/30 p-2 text-red-400 transition-colors hover:bg-red-500/10"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-navy p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-red-500/15">
                <AlertTriangle className="size-6 text-red-400" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-white">Delete this post?</h3>
              <p className="mt-1.5 text-sm text-white/60">
                "{deleteTarget.title}" will be permanently removed.
              </p>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-full border border-white/20 py-3 text-sm font-medium text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDelete()}
                className="flex-1 rounded-full bg-red-600 py-3 text-sm font-semibold text-white transition-transform active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
