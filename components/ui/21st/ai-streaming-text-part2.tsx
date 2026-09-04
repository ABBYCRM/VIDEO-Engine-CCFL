"use client";

import { AiStreamingText } from "@/components/ui/streaming-text";

export default function StreamingTextDemo() {
  return (
    <div className="flex min-h-[240px] w-full items-center justify-center p-8">
      <div className="max-w-md text-base leading-relaxed text-foreground">
        <AiStreamingText
          text="This text will stream in character by character, just like an AI response typing out its answer in real time..."
          speed={30}
          showCursor
          onComplete={() => console.log("Done!")}
        />
      </div>
    </div>
  );
}