import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  X,
  Upload,
  Image as ImageIcon,
  ExternalLink,
  Save,
  ArrowLeft,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RouteErrorPanel } from "@/components/route-error";
import { BlogRichEditor } from "@/components/admin/blog-rich-editor";
import { supabase } from "@/integrations/supabase/client";

import {
  adminListPosts,
  adminGetPost,
  adminUpsertPost,
  adminDeletePost,
  type BlogPost,
  type BlogPostSummary,
} from "@/lib/api/blog.functions";

export const Route = createFileRoute("/admin/blog")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Blog Manager — Super Admin" }] }),
  component: BlogManagerPage,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

type FormState = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image: string;
  category: string;
  tagsCsv: string;
  language: "bn" | "en";
  status: "draft" | "published";
  author_name: string;
  seo_title: string;
  seo_description: string;
  reading_minutes: number;
};

const emptyForm: FormState = {
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  cover_image: "",
  category: "",
  tagsCsv: "",
  language: "bn",
  status: "draft",
  author_name: "",
  seo_title: "",
  seo_description: "",
  reading_minutes: 3,
};

function toForm(p: BlogPost): FormState {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt ?? "",
    content: p.content ?? "",
    cover_image: p.cover_image ?? "",
    category: p.category ?? "",
    tagsCsv: p.tags.join(", "),
    language: (p.language as "bn" | "en") ?? "bn",
    status: p.status,
    author_name: p.author_name ?? "",
    seo_title: p.seo_title ?? "",
    seo_description: p.seo_description ?? "",
    reading_minutes: p.reading_minutes ?? 3,
  };
}

function BlogManagerPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const listQ = useQuery({
    queryKey: ["admin", "blog", "list"],
    queryFn: () => adminListPosts(),
  });

  const filtered = useMemo(() => {
    const rows = listQ.data ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q),
    );
  }, [listQ.data, search]);

  async function openNew() {
    setEditing({ ...emptyForm });
  }

  async function openEdit(row: BlogPostSummary) {
    const full = await adminGetPost({ data: { id: row.id } });
    if (!full) {
      toast.error("Post not found");
      return;
    }
    setEditing(toForm(full));
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const slug = (editing.slug || slugify(editing.title)).trim();
    if (!/^[a-z0-9-]+$/i.test(slug)) {
      toast.error("Slug can contain only letters, numbers and dashes");
      return;
    }
    setSaving(true);
    try {
      await adminUpsertPost({
        data: {
          id: editing.id,
          slug,
          title: editing.title.trim(),
          excerpt: editing.excerpt.trim() || null,
          content: editing.content,
          cover_image: editing.cover_image || null,
          category: editing.category.trim() || null,
          tags: editing.tagsCsv
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          language: editing.language,
          status: editing.status,
          author_name: editing.author_name.trim() || null,
          seo_title: editing.seo_title.trim() || null,
          seo_description: editing.seo_description.trim() || null,
          reading_minutes: Number(editing.reading_minutes) || 3,
        },
      });
      toast.success(editing.id ? "Post updated" : "Post created");
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "blog", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["blog"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await adminDeletePost({ data: { id: deleteId } });
      toast.success("Post deleted");
      setDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "blog", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["blog"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell variant="admin">
      <PageHeader
        title="Blog Manager"
        description="Create, edit and publish blog posts on the public site."
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> New post
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search posts…"
                className="pl-9"
              />
            </div>
            <a
              href="/blog"
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" /> View public blog
            </a>
          </div>

          {listQ.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No posts yet. Click "New post" to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Lang</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Views</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.title}</div>
                        <div className="text-xs text-muted-foreground">/{row.slug}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={row.status === "published" ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 uppercase text-xs">{row.language}</td>
                      <td className="px-3 py-2">{row.category ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{row.view_count}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(row.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(row.id)}
                          className="text-rose-600 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EditorDialog
          form={editing}
          setForm={setEditing}
          saving={saving}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CoverUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handle(file: File) {
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `cover/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("blog-images")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      const data = { publicUrl: `/api/public/media/blog-images/${path}` };
      onChange(data.publicUrl);
      toast.success("Cover uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="relative h-28 w-44 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 grid place-items-center bg-background/80">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <Input
            value={value}
            placeholder="https://… or upload"
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handle(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface EditorProps {
  form: FormState;
  setForm: (f: FormState | null) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}

function EditorDialog({ form, setForm, saving, onSave, onClose }: EditorProps) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm({ ...form, [k]: v });

  // Auto-fill slug from title for new posts
  useEffect(() => {
    if (!form.id && form.title && !form.slug) {
      setForm({ ...form, slug: slugify(form.title) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {form.id ? "Edit post" : "New post"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-5 md:col-span-2">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Article title" />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="my-article-slug" />
            </div>
            <div>
              <Label>Excerpt</Label>
              <Textarea value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} rows={2} placeholder="Short summary shown on the listing." />
            </div>
            <div>
              <Label>Content</Label>
              <BlogRichEditor value={form.content} onChange={(html) => set("content", html)} />
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as "draft" | "published")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={form.language} onValueChange={(v) => set("language", v as "bn" | "en")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bn">বাংলা</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cover image</Label>
              <CoverUploader value={form.cover_image} onChange={(v) => set("cover_image", v)} />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Updates" />
            </div>
            <div>
              <Label>Tags (comma separated)</Label>
              <Input value={form.tagsCsv} onChange={(e) => set("tagsCsv", e.target.value)} placeholder="pharmacy, pos, growth" />
            </div>
            <div>
              <Label>Author name</Label>
              <Input value={form.author_name} onChange={(e) => set("author_name", e.target.value)} placeholder="Team SohojPharma" />
            </div>
            <div>
              <Label>Reading time (min)</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={form.reading_minutes}
                onChange={(e) => set("reading_minutes", Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
              <Label className="text-xs uppercase tracking-wide">SEO</Label>
              <Input value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} placeholder="SEO title" />
              <Textarea
                value={form.seo_description}
                onChange={(e) => set("seo_description", e.target.value)}
                rows={2}
                placeholder="SEO description (max 160 chars)"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
