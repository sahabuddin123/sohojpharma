UPDATE public.landing_cms
SET
  content_en = jsonb_set(
    content_en,
    '{highlights,items}',
    COALESCE((
      SELECT jsonb_agg(
        CASE WHEN item ? 'image' THEN item ELSE item || jsonb_build_object('image','') END
      )
      FROM jsonb_array_elements(content_en->'highlights'->'items') item
    ), content_en->'highlights'->'items')
  ),
  content_bn = jsonb_set(
    content_bn,
    '{highlights,items}',
    COALESCE((
      SELECT jsonb_agg(
        CASE WHEN item ? 'image' THEN item ELSE item || jsonb_build_object('image','') END
      )
      FROM jsonb_array_elements(content_bn->'highlights'->'items') item
    ), content_bn->'highlights'->'items')
  ),
  updated_at = now()
WHERE content_en ? 'highlights' OR content_bn ? 'highlights';