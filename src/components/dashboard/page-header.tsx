import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-lg font-bold leading-tight tracking-tight text-foreground sm:truncate sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:mt-1 sm:line-clamp-none sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 scrollbar-hide sm:mx-0 sm:shrink-0 sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
