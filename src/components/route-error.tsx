import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";

export function RouteErrorPanel({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  return (
    <div className="m-6 rounded-2xl border bg-card p-6 text-sm">
      <p className="text-base font-semibold text-rose-600">Something went wrong</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => { reset(); router.invalidate(); }}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Retry
        </button>
        <button
          onClick={() => router.history.back()}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          Go back
        </button>
      </div>
    </div>
  );
}

export function RouteNotFoundPanel({ label = "Record" }: { label?: string }) {
  const router = useRouter();
  return (
    <div className="m-6 rounded-2xl border bg-card p-6 text-sm">
      <p className="text-base font-semibold">{label} not found</p>
      <p className="mt-1 text-muted-foreground">It may have been deleted or you don't have access.</p>
      <button
        onClick={() => router.history.back()}
        className="mt-3 rounded-md border px-3 py-1.5 text-xs"
      >
        Go back
      </button>
    </div>
  );
}
