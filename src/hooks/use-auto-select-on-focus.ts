import { useCallback } from "react";

/**
 * Returns an onFocus handler that selects the entire input value.
 * Safe with keyboard nav (Tab), mouse click, and touch. Does not
 * interfere with arrow keys, Ctrl+A/C/V, or undo/redo.
 *
 * Uses requestAnimationFrame so the selection lands after the browser's
 * default click-caret placement (otherwise the click deselects the range).
 */
export function useAutoSelectOnFocus<T extends HTMLInputElement | HTMLTextAreaElement>() {
  return useCallback((e: React.FocusEvent<T>) => {
    const el = e.currentTarget;
    // `select()` on <input type="number"> is a no-op in some engines;
    // setSelectionRange works reliably for text-like inputs.
    requestAnimationFrame(() => {
      try {
        if (typeof (el as HTMLInputElement).setSelectionRange === "function" && el.type !== "number") {
          (el as HTMLInputElement).setSelectionRange(0, el.value.length);
        } else {
          el.select();
        }
      } catch {
        el.select?.();
      }
    });
  }, []);
}
