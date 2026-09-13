"use client";

/**
 * 21st.dev Agent Chat (serafimcloud / Agent Elements)
 * Registry: https://21st.dev/r/serafimcloud/agent-chat
 * Drop-in shell: scrollable thread + bottom composer, empty centered composer.
 */
import { memo, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { AIMessage } from "@/components/ui/ai-message";
import { sanitizeUserVisibleMessage } from "@/lib/claw/user-visible";

export type ChatStatus = "ready" | "streaming" | "submitted" | "idle";

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "error"; title?: string; message: string };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
};

export const CHAT_COLUMN = "max-w-[640px]";

function ErrorBubble({
  title = "Something went wrong",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="flex justify-start">
      <div className="rounded-[8px] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm">
        <div className="font-medium text-neutral-900 dark:text-neutral-100">{title}</div>
        <div className="mt-0.5 text-neutral-500 dark:text-neutral-400">{message}</div>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  className,
  footer,
  scrollRef,
}: {
  messages: AgentMessage[];
  className?: string;
  footer?: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-6", className)}>
      <div className={cn("mx-auto flex w-full flex-col gap-5", CHAT_COLUMN)}>
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            {m.parts.map((part, i) => {
              if (part.type === "error") {
                return <ErrorBubble key={i} title={part.title} message={part.message} />;
              }
              const text = m.role === "assistant" ? sanitizeUserVisibleMessage(part.text) : part.text;
              return (
                <AIMessage
                  key={i}
                  from={m.role}
                  bubble={m.role === "user"}
                  copyText={text}
                >
                  {text}
                </AIMessage>
              );
            })}
          </div>
        ))}
        {footer}
      </div>
    </div>
  );
}

export type AgentChatProps = {
  messages: AgentMessage[];
  composer?: ReactNode;
  emptyHeader?: ReactNode;
  footer?: ReactNode;
  emptyStatePosition?: "default" | "center";
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
};

export const AgentChat = memo(function AgentChat({
  messages,
  composer,
  emptyHeader,
  footer,
  emptyStatePosition = "center",
  scrollRef,
  className,
}: AgentChatProps) {
  const isEmpty = messages.length === 0;
  const isCenteredEmpty = isEmpty && emptyStatePosition === "center";

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {isCenteredEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
          <div className={cn("w-full", CHAT_COLUMN)}>
            {emptyHeader}
            {composer}
          </div>
        </div>
      ) : (
        <>
          <MessageList messages={messages} scrollRef={scrollRef} footer={footer} />
          {composer ? (
            <div className="shrink-0 px-4 pb-4 pt-2">
              <div className={cn("mx-auto w-full", CHAT_COLUMN)}>{composer}</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
});

export default AgentChat;
