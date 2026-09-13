"use client";

/**
 * 21st.dev Agent Chat (serafimcloud / Agent Elements)
 * Registry: https://21st.dev/r/serafimcloud/agent-chat
 * Shell primitives used by Claw: message list + empty-state layout.
 */
import { memo, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { AiMessageBubble } from "@/components/ui/message-bubble";

export type ChatStatus = "ready" | "streaming" | "submitted" | "idle";

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "error"; title?: string; message: string };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
};

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
      <div className="mx-auto flex max-w-[720px] flex-col gap-5">
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            {m.parts.map((part, i) => {
              if (part.type === "error") {
                return <ErrorBubble key={i} title={part.title} message={part.message} />;
              }
              return <AiMessageBubble key={i} role={m.role} content={part.text} />;
            })}
          </div>
        ))}
        {footer}
      </div>
    </div>
  );
}

export const AgentChat = memo(function AgentChat({
  messages,
  children,
  className,
}: {
  messages: AgentMessage[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <MessageList messages={messages} />
      {children}
    </div>
  );
});

export default AgentChat;
