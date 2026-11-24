import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, onClick, ...props }, ref) => {
    const isNumeric = type === "number";

    const handleFocus = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        onFocus?.(e);
        if (!isNumeric || e.defaultPrevented) return;
        const el = e.currentTarget;
        // Defer so the browser's default click-caret placement doesn't clear the range.
        requestAnimationFrame(() => {
          try { el.select(); } catch { /* noop */ }
        });
      },
      [isNumeric, onFocus],
    );

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLInputElement>) => {
        onClick?.(e);
        if (!isNumeric || e.defaultPrevented) return;
        const el = e.currentTarget;
        // If focus was already on the field (no selection), select all on click too.
        if (el === document.activeElement && (el.selectionStart === el.selectionEnd || el.type === "number")) {
          requestAnimationFrame(() => { try { el.select(); } catch { /* noop */ } });
        }
      },
      [isNumeric, onClick],
    );

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onFocus={handleFocus}
        onClick={handleClick}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
