import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800/80 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:truncate sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400 sm:line-clamp-none sm:text-[13px]">
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
