"use client";

import { AiMessageBubble } from "@/components/ui/message-bubble";

export default function Default() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 text-foreground">
      <div className="flex w-full max-w-md flex-col gap-6">
        <AiMessageBubble
          role="user"
          content="What's the difference between let and const in JavaScript?"
          timestamp={new Date()}
        />
        <AiMessageBubble
          role="assistant"
          provider="anthropic"
          content={`Both declare block-scoped variables.

- "let" can be reassigned later.
- "const" can't be reassigned after it's set.

Reach for const by default, and use let only when you actually need to reassign.`}
          timestamp={new Date()}
        />
      </div>
    </div>
  );
}