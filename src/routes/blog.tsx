import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Calendar, Clock, Tag } from "lucide-react";
import { listPublishedPosts, type BlogPostSummary } from "@/lib/api/blog.functions";
import { RouteErrorPanel } from "@/components/route-error";

const postsQueryOptions = queryOptions({
  queryKey: ["blog", "published"],
  queryFn: () => listPublishedPosts({ data: { limit: 50 } }),
});

export const Route = createFileRoute("/blog")({
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQueryOptions),
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Blog — SohojPharma" },
      {
        name: "description",
        content:
          "Insights, updates and stories from the SohojPharma team — pharmacy management, compliance, and growth.",
      },
      { property: "og:title", content: "SohojPharma Blog" },
      { property: "og:description", content: "Insights and updates from SohojPharma." },
    ],
  }),
  component: BlogIndex,
});

function fmtDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function BlogIndex() {
  const { data: posts } = useSuspenseQuery(postsQueryOptions);
  const [featured, ...rest] = posts;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight">
            SohojPharma
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              Home
            </Link>
            <Link to="/blog" className="font-semibold text-foreground">
              Blog
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-12">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Blog</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Pharmacy operations, compliance, growth and product updates from the SohojPharma team.
        </p>
      </section>

      {posts.length === 0 ? (
        <div className="mx-auto max-w-6xl px-6 py-24 text-center text-muted-foreground">
          No posts published yet. Check back soon.
        </div>
      ) : (
        <>
          {featured && <FeaturedCard post={featured} />}
          <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 pt-8 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function FeaturedCard({ post }: { post: BlogPostSummary }) {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-10">
      <Link
        to="/blog/$slug"
        params={{ slug: post.slug }}
        className="group grid gap-6 overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:shadow-lg md:grid-cols-2"
      >
        <div className="aspect-[16/10] overflow-hidden bg-muted md:aspect-auto">
          {post.cover_image ? (
            <img
              src={post.cover_image}
              alt={post.title}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/20 to-primary/5 text-6xl font-bold text-primary/40">
              {post.title.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="flex flex-col justify-center p-8">
          {post.category && (
            <span className="mb-3 inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {post.category}
            </span>
          )}
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{post.title}</h2>
          {post.excerpt && (
            <p className="mt-3 line-clamp-3 text-muted-foreground">{post.excerpt}</p>
          )}
          <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> {fmtDate(post.published_at)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> {post.reading_minutes} min read
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}

function PostCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:shadow-md"
    >
      <div className="aspect-[16/10] overflow-hidden bg-muted">
        {post.cover_image ? (
          <img
            src={post.cover_image}
            alt={post.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/15 to-primary/5 text-4xl font-bold text-primary/40">
            {post.title.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        {post.category && (
          <span className="mb-2 inline-flex w-fit text-xs font-semibold uppercase tracking-wide text-primary">
            {post.category}
          </span>
        )}
        <h3 className="text-lg font-semibold leading-snug">{post.title}</h3>
        {post.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</p>
        )}
        <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {fmtDate(post.published_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {post.reading_minutes}m
          </span>
          {post.tags.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3 w-3" /> {post.tags[0]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
