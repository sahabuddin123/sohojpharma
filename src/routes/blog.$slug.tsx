import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, Eye } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { getPublishedPost } from "@/lib/api/blog.functions";
import { RouteErrorPanel } from "@/components/route-error";

const postQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["blog", "post", slug],
    queryFn: () => getPublishedPost({ data: { slug } }),
  });

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ context, params }) => {
    const post = await context.queryClient.ensureQueryData(postQueryOptions(params.slug));
    if (!post) throw notFound();
  },
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold">Post not found</h1>
      <p className="mt-2 text-muted-foreground">This article may have been removed or unpublished.</p>
      <Link to="/blog" className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        Back to blog
      </Link>
    </div>
  ),
  head: ({ loaderData: _loaderData, params }) => {
    return {
      meta: [
        { title: `${params.slug} — SohojPharma Blog` },
      ],
    };
  },
  component: BlogPostPage,
});

function fmtDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function BlogPostPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(postQueryOptions(slug));
  if (!data) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight">
            SohojPharma
          </Link>
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All posts
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12">
        {data.category && (
          <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {data.category}
          </span>
        )}
        <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">{data.title}</h1>
        {data.excerpt && (
          <p className="mt-4 text-lg text-muted-foreground">{data.excerpt}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {data.author_name && <span>By {data.author_name}</span>}
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-4 w-4" /> {fmtDate(data.published_at)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {data.reading_minutes} min read
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-4 w-4" /> {data.view_count} views
          </span>
        </div>

        {data.cover_image && (
          <img
            src={data.cover_image}
            alt={data.title}
            className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover"
          />
        )}

        <div
          className="prose prose-neutral mt-10 max-w-none dark:prose-invert prose-headings:scroll-mt-24 prose-img:rounded-xl"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.content) }}
        />

        {data.tags.length > 0 && (
          <div className="mt-12 flex flex-wrap gap-2 border-t pt-8">
            {data.tags.map((t) => (
              <span key={t} className="rounded-full bg-muted px-3 py-1 text-xs">
                #{t}
              </span>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
