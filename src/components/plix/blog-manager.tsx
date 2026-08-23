import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, Loader as Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { blogsQuery, saveBlogPost, deleteBlogPost, slugify, type BlogPost } from "@/lib/blog";

const CATEGORIES = ["Nightlife", "Travel Tips", "Local Guides", "Villas", "Luxury Stays", "Food & Dining"];

type FormState = {
  id: string | null;
  title: string;
  slug: string;
  category: string;
  cover_image: string;
  excerpt: string;
  content: string;
  author: string;
};

const emptyForm: FormState = {
  id: null,
  title: "",
  slug: "",
  category: "Local Guides",
  cover_image: "",
  excerpt: "",
  content: "",
  author: "Plix Hospitality",
};

export function BlogManager() {
  const queryClient = useQueryClient();
  const { data: blogs = [], isLoading } = useQuery(blogsQuery);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [slugManual, setSlugManual] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const { error } = await saveBlogPost({
        id: data.id ?? undefined,
        title: data.title,
        slug: data.slug,
        category: data.category,
        cover_image: data.cover_image,
        excerpt: data.excerpt,
        content: data.content,
        author: data.author || "Plix Hospitality",
        published_at: new Date().toISOString(),
      });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogs"] });
      toast.success(showForm && form.id ? "Blog post updated" : "Blog post published");
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteBlogPost(id);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogs"] });
      toast.success("Blog post deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function resetForm() {
    setForm(emptyForm);
    setSlugManual(false);
    setShowForm(false);
  }

  function startEdit(post: BlogPost) {
    setForm({
      id: post.id,
      title: post.title,
      slug: post.slug,
      category: post.category,
      cover_image: post.cover_image,
      excerpt: post.excerpt,
      content: post.content,
      author: post.author,
    });
    setSlugManual(true);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.slug.trim() || !form.content.trim()) {
      toast.error("Title, slug, and content are required");
      return;
    }
    saveMutation.mutate(form);
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold text-navy">Manage Blog Posts</h2>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-emerald px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
          >
            <Plus className="size-4" />
            Create New Blog Post
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setForm((f) => ({
                    ...f,
                    title,
                    slug: slugManual ? f.slug : slugify(title),
                  }));
                }}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="Enter blog title"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">
                Slug (URL)
                <button
                  type="button"
                  onClick={() => {
                    setSlugManual((m) => !m);
                    if (slugManual) {
                      setForm((f) => ({ ...f, slug: slugify(f.title) }));
                    }
                  }}
                  className="ml-2 text-xs text-primary hover:underline"
                >
                  {slugManual ? "Auto-generate" : "Edit manually"}
                </button>
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="auto-generated-from-title"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Author</label>
              <input
                type="text"
                value={form.author}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="Plix Hospitality"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Cover Image URL</label>
            <input
              type="url"
              value={form.cover_image}
              onChange={(e) => setForm((f) => ({ ...f, cover_image: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="https://example.com/image.jpg"
            />
            {form.cover_image && (
              <img
                src={form.cover_image}
                alt="Cover preview"
                className="mt-2 h-32 w-full rounded-lg object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Excerpt / Summary</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
              rows={2}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="A short summary shown on the blog listing page"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">
              Content (HTML supported)
            </label>
            <div className="mb-2 flex flex-wrap gap-1">
              {[
                { label: "H2", tag: "h2" },
                { label: "H3", tag: "h3" },
                { label: "Bold", tag: "strong" },
                { label: "Paragraph", tag: "p" },
              ].map((b) => (
                <button
                  key={b.tag}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, content: f.content + `<${b.tag}></${b.tag}>` }))}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
                >
                  {b.label}
                </button>
              ))}
            </div>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={12}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Write your blog content here. Use HTML tags like <p>, <h2>, <strong> for formatting."
              required
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-emerald px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {form.id ? "Update Post" : "Publish Post"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground/80 hover:bg-accent"
            >
              <X className="size-4" />
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {blogs.length === 0 && !showForm && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No blog posts yet. Click "Create New Blog Post" to get started.
            </p>
          )}
          {blogs.map((post) => (
            <div
              key={post.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/30"
            >
              {post.cover_image ? (
                <img
                  src={post.cover_image}
                  alt=""
                  className="size-16 shrink-0 rounded-lg object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <FileText className="size-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-navy">{post.title}</h3>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {post.category} · /blog/{post.slug}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => startEdit(post)}
                  className="rounded-lg border border-border p-2 text-foreground/70 transition-colors hover:bg-accent"
                  title="Edit"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${post.title}"? This cannot be undone.`)) {
                      deleteMutation.mutate(post.id);
                    }
                  }}
                  className="rounded-lg border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
