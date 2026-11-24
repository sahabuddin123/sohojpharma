-- Blog module
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  excerpt text,
  content text NOT NULL DEFAULT '',
  cover_image text,
  category text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  language text NOT NULL DEFAULT 'bn',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  seo_title text,
  seo_description text,
  reading_minutes int NOT NULL DEFAULT 3,
  view_count int NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read published posts
CREATE POLICY "Public can read published blog posts"
  ON public.blog_posts FOR SELECT
  USING (status = 'published');

-- App admins can read everything
CREATE POLICY "App admins can read all blog posts"
  ON public.blog_posts FOR SELECT
  TO authenticated
  USING (public.is_app_admin(auth.uid()));

-- App admins can write
CREATE POLICY "App admins can insert blog posts"
  ON public.blog_posts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "App admins can update blog posts"
  ON public.blog_posts FOR UPDATE
  TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "App admins can delete blog posts"
  ON public.blog_posts FOR DELETE
  TO authenticated
  USING (public.is_app_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published_at
  ON public.blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON public.blog_posts (category);

CREATE OR REPLACE FUNCTION public.tg_blog_posts_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_blog_posts_updated_at();

-- Increment view counter (public/anon)
CREATE OR REPLACE FUNCTION public.increment_blog_view(_slug text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.blog_posts
     SET view_count = view_count + 1
   WHERE slug = _slug AND status = 'published';
$$;

REVOKE ALL ON FUNCTION public.increment_blog_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_blog_view(text) TO anon, authenticated;