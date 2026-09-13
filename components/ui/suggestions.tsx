"use client";

/**
 * 21st.dev Suggestions (serafimcloud / Agent Elements)
 * Registry: https://21st.dev/r/serafimcloud/suggestions
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SuggestionItem = {
  id: string;
  label: string;
  value?: string;
  icon?: ReactNode;
  className?: string;
};

export type SuggestionsProps = {
  items: SuggestionItem[];
  onSelect: (item: SuggestionItem) => void;
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
};

export function Suggestions({
  items,
  onSelect,
  disabled,
  className,
  itemClassName,
}: SuggestionsProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(item)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-200 bg-transparent px-3 text-[13px] text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
            itemClassName,
            item.className,
          )}
        >
          {item.icon && <span className="inline-flex shrink-0">{item.icon}</span>}
          <span className="max-w-[220px] truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export default Suggestions;
