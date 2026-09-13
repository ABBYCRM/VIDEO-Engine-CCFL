"use client";

/**
 * 21st.dev AI Suggested Actions (elements-)
 * Registry: https://21st.dev/r/elements-/suggested-actions
 */
import { cn } from "@/lib/utils";

export type Suggestion = {
  label: string;
  prompt: string;
};

export type AiSuggestedActionsProps = {
  suggestions: Suggestion[];
  onSelect?: (prompt: string, suggestion: Suggestion) => void;
  className?: string;
};

export function AiSuggestedActions({
  suggestions,
  onSelect,
  className,
}: AiSuggestedActionsProps) {
  return (
    <div
      data-slot="ai-suggested-actions"
      className={cn("grid gap-2 sm:grid-cols-2", className)}
    >
      {suggestions.map((suggestion, index) => (
        <button
          type="button"
          key={`${suggestion.label}-${index}`}
          onClick={() => onSelect?.(suggestion.prompt, suggestion)}
          className="rounded-xl border border-neutral-200 bg-white p-3 text-left text-[13px] text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}

export default AiSuggestedActions;
