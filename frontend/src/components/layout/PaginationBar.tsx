"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
  );

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <span className="text-xs text-muted-foreground">
        Showing {start} to {end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="flex size-8 items-center justify-center rounded-md border border-surface-border hover:bg-surface-3 disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        {pageNumbers.map((p, i) => {
          const prev = pageNumbers[i - 1];
          const showEllipsis = prev !== undefined && p - prev > 1;
          return (
            <span key={p} className="flex items-center gap-1">
              {showEllipsis && <span className="px-1 text-xs text-muted-foreground">…</span>}
              <button
                onClick={() => onPageChange(p)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md border text-sm",
                  p === page
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-surface-border hover:bg-surface-3"
                )}
              >
                {p}
              </button>
            </span>
          );
        })}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="flex size-8 items-center justify-center rounded-md border border-surface-border hover:bg-surface-3 disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
