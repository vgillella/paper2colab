"use client";

import { useEffect, useState } from "react";

export interface ProgressMessage {
  id: string;
  text: string;
  status: "done" | "active" | "pending";
}

interface ProgressFeedProps {
  messages: ProgressMessage[];
  isDone: boolean;
}

// Typewriter hook — reveals text char by char for the active message
function useTypewriter(text: string, active: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState(active ? "" : text);

  useEffect(() => {
    if (!active) {
      setDisplayed(text);
      return;
    }
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, active, speed]);

  return displayed;
}

function MessageRow({ msg }: { msg: ProgressMessage }) {
  const isActive = msg.status === "active";
  const isDone = msg.status === "done";
  const displayed = useTypewriter(msg.text, isActive);

  return (
    <div
      data-testid={
        isActive
          ? "progress-message-active"
          : isDone
          ? "progress-message-done"
          : "progress-message-pending"
      }
      className={[
        "flex items-start gap-3 transition-opacity duration-300",
        isDone ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      {/* Left glyph */}
      <span className="font-mono text-xs mt-0.5 w-4 shrink-0 select-none">
        {isDone ? (
          <span className="text-primary">✓</span>
        ) : isActive ? (
          <span className="text-primary animate-pulse">▶</span>
        ) : (
          <span className="text-muted-foreground/40">·</span>
        )}
      </span>

      {/* Message text */}
      <span
        data-testid="progress-message"
        className={[
          "font-mono text-sm leading-relaxed",
          isActive ? "text-foreground" : isDone ? "text-muted-foreground" : "text-muted-foreground/40",
        ].join(" ")}
      >
        {displayed}
        {isActive && (
          <span className="cursor-blink inline-block w-[2px] h-[1em] bg-primary ml-[2px] align-middle" />
        )}
      </span>
    </div>
  );
}

export function ProgressFeed({ messages, isDone }: ProgressFeedProps) {
  return (
    <div
      data-testid="progress-feed"
      className="w-full space-y-2.5 py-4 px-4 border border-border bg-card"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
        {isDone ? (
          <>
            <span
              data-testid="progress-checkmark"
              className="text-primary font-mono text-sm"
            >
              ✓
            </span>
            <span className="text-xs font-mono uppercase tracking-widest text-primary">
              Complete
            </span>
          </>
        ) : (
          <>
            <span
              data-testid="progress-indicator"
              className="w-2 h-2 bg-primary rounded-full animate-pulse shrink-0"
            />
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Processing
            </span>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-2">
        {messages.map((msg) => (
          <MessageRow key={msg.id} msg={msg} />
        ))}
      </div>
    </div>
  );
}
