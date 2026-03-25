"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ProgressFeed, ProgressMessage } from "@/components/progress-feed";

const DEMO_MESSAGES: ProgressMessage[] = [
  { id: "1", text: "Extracting PDF text...", status: "done" },
  { id: "2", text: "Analyzing paper structure...", status: "done" },
  { id: "3", text: "Generating algorithm cells...", status: "active" },
  { id: "4", text: "Assembling notebook...", status: "pending" },
  { id: "5", text: "Done.", status: "pending" },
];

const DONE_MESSAGES: ProgressMessage[] = DEMO_MESSAGES.map((m) => ({
  ...m,
  status: "done" as const,
}));

function TestProgressInner() {
  const params = useSearchParams();
  const isDone = params.get("done") === "true";
  const messages = isDone ? DONE_MESSAGES : DEMO_MESSAGES;

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-lg">
        <ProgressFeed messages={messages} isDone={isDone} />
      </div>
    </div>
  );
}

export default function TestProgressPage() {
  return (
    <Suspense>
      <TestProgressInner />
    </Suspense>
  );
}
