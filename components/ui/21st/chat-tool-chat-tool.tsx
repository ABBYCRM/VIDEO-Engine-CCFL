import ChatTool from "@/components/ui/chat-tool";
import type { ToolUIPart } from "ai";

const toolPart = {
  type: "tool-getWeather",
  toolCallId: "call_1",
  state: "output-available",
  input: { city: "San Francisco", unit: "celsius" },
  output: { temperature: 18, condition: "Partly cloudy" },
} as ToolUIPart;

export default function ChatToolDemo() {
  return (
    <div className="w-full max-w-md mx-auto p-6">
      <ChatTool toolMessagePart={toolPart} />
    </div>
  );
}