/**
 * Sanitizes free-text user search terms before interpolating into PostgREST `.or(...)`
 * filter strings (`col.ilike.%${term}%`) so delimiters like `,`, `(`, `)`, `*` cannot
 * break out of the filter predicate or inject arbitrary filter clauses.
 */
export function sanitizePostgrestSearch(input: unknown, maxLen = 100): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[,()[\]{}"'\\*;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
