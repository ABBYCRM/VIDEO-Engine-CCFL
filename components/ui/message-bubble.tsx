"use client";

/**
 * 21st.dev AI Message Bubble (elements-) + Agent Chat bubbles (serafimcloud)
 * Registries:
 *   https://21st.dev/r/elements-/message-bubble
 *   https://21st.dev/r/serafimcloud/agent-chat
 * Grok Bot treatment: user = right pill, assistant = flush left prose.
 */
import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeUserVisibleMessage } from "@/lib/claw/user-visible";

export type MessageRole = "user" | "assistant";

export type AiMessageBubbleProps = {
  role: MessageRole;
  content?: string;
  timestamp?: Date;
  isStreaming?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function AiMessageBubble({
  role,
  content = "",
  timestamp,
  isStreaming = false,
  className,
  children,
}: AiMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";
  const text = isUser ? content : sanitizeUserVisibleMessage(content);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <div
      data-slot="ai-message-bubble"
      role="article"
      aria-label={isUser ? "Your message" : "AI response"}
      className={cn("group flex w-full", isUser ? "justify-end" : "justify-start", className)}
    >
      <div className={cn("relative max-w-[80%]", !isUser && "max-w-[90%]")}>
        <div
          className={cn(
            "whitespace-pre-wrap break-words text-[15px] leading-relaxed",
            isUser
              ? "rounded-2xl bg-neutral-100 px-3.5 py-2 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
              : "text-neutral-800 dark:text-neutral-200",
          )}
        >
          <div aria-live={isStreaming ? "polite" : undefined}>
            {children ?? text}
            {isStreaming && (
              <span className="ml-1 inline-block h-3.5 w-[2px] animate-pulse bg-current" />
            )}
          </div>
        </div>
        {timestamp && (
          <time className="mt-1 block text-[10px] uppercase tracking-wider text-neutral-400">
            {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </time>
        )}
        {!isStreaming && text && (
          <button
            type="button"
            className={cn(
              "mt-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-200",
              isUser && "ml-auto",
            )}
            onClick={() => void handleCopy()}
            aria-label="Copy message"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default AiMessageBubble;
