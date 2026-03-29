"use client";

import { useState, useRef, useCallback } from "react";
import { ApiKeyInput } from "@/components/api-key-input";
import { PdfUploadZone } from "@/components/pdf-upload-zone";
import { ArxivUrlInput } from "@/components/arxiv-url-input";
import { ProgressFeed, ProgressMessage } from "@/components/progress-feed";
import { ResultActions } from "@/components/result-actions";

// ── Types ──────────────────────────────────────────────────────────────────
type AppState = "idle" | "processing" | "done" | "error";
type Mode = "pdf" | "arxiv";

interface Result {
  notebookJson: string;
  filename: string;
  colabUrl: string | null;
  title: string;
}

// ── SSE event shapes from the server ──────────────────────────────────────
interface SseProgressEvent { type: "progress"; message: string }
interface SseTokenEvent { type: "token"; delta: string }
interface SseDoneEvent { type: "done"; notebookJson: string; filename: string; colabUrl: string | null; title: string }
interface SseErrorEvent { type: "error"; message: string }
type SseEvent = SseProgressEvent | SseTokenEvent | SseDoneEvent | SseErrorEvent;

let msgCounter = 0;
function mkMsg(text: string, status: ProgressMessage["status"]): ProgressMessage {
  return { id: String(++msgCounter), text, status };
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Home() {
  const [mode, setMode] = useState<Mode>("pdf");
  const [apiKey, setApiKey] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [arxivUrl, setArxivUrl] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ProgressMessage[]>([]);
  const [tokenCharCount, setTokenCharCount] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canSubmit =
    mode === "pdf"
      ? apiKey.trim().length > 0 && pdfFile !== null && appState === "idle"
      : apiKey.trim().length > 0 && arxivUrl.trim().length > 0 && appState === "idle";

  const pushMessage = useCallback((text: string, status: ProgressMessage["status"] = "active") => {
    setMessages(prev => {
      // Mark the previous active message as done
      const updated = prev.map(m => m.status === "active" ? { ...m, status: "done" as const } : m);
      return [...updated, mkMsg(text, status)];
    });
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    msgCounter = 0;
    setMessages([mkMsg("Starting...", "active")]);
    setAppState("processing");
    setTokenCharCount(0);
    setResult(null);
    setErrorMsg(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      let response: Response;

      if (mode === "pdf") {
        const formData = new FormData();
        formData.append("apiKey", apiKey.trim());
        formData.append("pdf", pdfFile!);

        response = await fetch("/api/generate", {
          method: "POST",
          body: formData,
          signal: abort.signal,
        });
      } else {
        response = await fetch("/api/generate-arxiv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arxivUrl: arxivUrl.trim(), apiKey: apiKey.trim() }),
          signal: abort.signal,
        });
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error ?? `Server error ${response.status}`);
      }

      // Read the SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const chunk of lines) {
          const dataLine = chunk.trim();
          if (!dataLine.startsWith("data:")) continue;
          const jsonStr = dataLine.slice(5).trim();
          if (!jsonStr) continue;

          let event: SseEvent;
          try {
            event = JSON.parse(jsonStr) as SseEvent;
          } catch {
            continue;
          }

          if (event.type === "progress") {
            pushMessage(event.message);
          } else if (event.type === "token") {
            setTokenCharCount((n) => n + event.delta.length);
          } else if (event.type === "done") {
            setMessages(prev =>
              prev.map(m => m.status === "active" ? { ...m, status: "done" as const } : m)
            );
            setResult({
              notebookJson: event.notebookJson,
              filename: event.filename,
              colabUrl: event.colabUrl,
              title: event.title,
            });
            setAppState("done");
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unexpected error";
      setErrorMsg(msg);
      setMessages(prev =>
        prev.map(m => m.status === "active" ? { ...m, status: "done" as const } : m)
      );
      setAppState("error");
    }
  }, [apiKey, pdfFile, arxivUrl, mode, canSubmit, pushMessage]);

  const handleReset = () => {
    abortRef.current?.abort();
    setAppState("idle");
    setMessages([]);
    setResult(null);
    setErrorMsg(null);
    setPdfFile(null);
    setArxivUrl("");
  };

  const isProcessing = appState === "processing";
  const isDone = appState === "done";
  const isError = appState === "error";

  return (
    <div className="min-h-screen flex flex-col animate-in fade-in duration-500">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <div className="grid grid-cols-3 gap-[3px] opacity-80">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={[
                "w-[6px] h-[6px]",
                [0, 4, 8].includes(i) ? "bg-primary" : "bg-muted-foreground/30",
              ].join(" ")}
            />
          ))}
        </div>
        <div>
          <h1
            data-testid="app-title"
            className="text-base font-mono font-bold tracking-tight text-foreground"
          >
            Paper2Colab
          </h1>
          <p
            data-testid="app-tagline"
            className="text-[11px] font-mono text-muted-foreground tracking-wide"
          >
            research paper → colab tutorial
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {/* Vizuara logo */}
          <div className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Vizuara">
              {/* Outer hexagon */}
              <polygon points="18,2 32,10 32,26 18,34 4,26 4,10" stroke="currentColor" strokeWidth="2" fill="none" className="text-primary" />
              {/* Inner triangle — data/chart motif */}
              <polygon points="18,10 26,24 10,24" fill="currentColor" className="text-primary" opacity="0.85" />
              {/* Center dot */}
              <circle cx="18" cy="18" r="2.5" fill="currentColor" className="text-background" />
            </svg>
            <span className="text-[11px] font-mono font-semibold tracking-widest text-muted-foreground uppercase">
              Vizuara
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className={[
              "w-1.5 h-1.5 rounded-full",
              isProcessing ? "bg-primary animate-pulse" : isDone ? "bg-green-500" : isError ? "bg-red-500" : "bg-muted-foreground/40",
            ].join(" ")} />
            <span className="text-[11px] font-mono text-muted-foreground">
              {isProcessing ? "processing" : isDone ? "complete" : isError ? "error" : "ready"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg space-y-6">

          {/* Input form — shown when idle */}
          {appState === "idle" && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-mono text-muted-foreground tracking-widest uppercase">
                  generate notebook
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Mode switcher */}
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="mode-pdf"
                  onClick={() => setMode("pdf")}
                  className={[
                    "flex-1 py-2 px-4 font-mono text-xs tracking-widest uppercase",
                    "border transition-all duration-150 outline-none",
                    mode === "pdf"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:border-primary/40",
                  ].join(" ")}
                >
                  PDF Upload
                </button>
                <button
                  type="button"
                  data-testid="mode-arxiv"
                  onClick={() => setMode("arxiv")}
                  className={[
                    "flex-1 py-2 px-4 font-mono text-xs tracking-widest uppercase",
                    "border transition-all duration-150 outline-none",
                    mode === "arxiv"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:border-primary/40",
                  ].join(" ")}
                >
                  arXiv URL
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <ApiKeyInput value={apiKey} onChange={setApiKey} />

                {mode === "pdf" ? (
                  <PdfUploadZone file={pdfFile} onFileChange={setPdfFile} />
                ) : (
                  <ArxivUrlInput value={arxivUrl} onChange={setArxivUrl} />
                )}

                <button
                  data-testid="submit-button"
                  type="submit"
                  disabled={!canSubmit}
                  className={[
                    "w-full py-3 px-6 font-mono text-sm font-medium tracking-wide",
                    "border transition-all duration-150 outline-none",
                    canSubmit
                      ? [
                          "bg-primary text-primary-foreground border-primary",
                          "hover:bg-primary/90 hover:shadow-[0_0_16px_rgba(0,212,255,0.25)]",
                          "focus-visible:shadow-[0_0_0_2px_rgba(0,212,255,0.4)]",
                        ].join(" ")
                      : "bg-secondary text-muted-foreground border-border cursor-not-allowed opacity-50",
                  ].join(" ")}
                >
                  {canSubmit ? "Generate Notebook →" : "Generate Notebook"}
                </button>

                <p
                  data-testid="gist-disclosure"
                  className="text-center text-[11px] font-mono text-muted-foreground/60"
                >
                  Your notebook will be uploaded as an unlisted GitHub Gist to enable the Open in Colab link.
                </p>
              </form>

              <p className="text-center text-[11px] font-mono text-muted-foreground/50">
                Processing takes 60–90 seconds · powered by OpenAI
              </p>
            </>
          )}

          {/* Progress feed — shown while processing or on error */}
          {(isProcessing || isError || isDone) && messages.length > 0 && (
            <div data-testid="progress-feed-wrapper">
              <ProgressFeed messages={messages} isDone={isDone} tokenCharCount={tokenCharCount} />
            </div>
          )}

          {/* Error state */}
          {isError && errorMsg && (
            <div
              data-testid="error-display"
              className="border border-destructive/50 bg-destructive/10 p-4 space-y-3"
            >
              <p className="text-xs font-mono uppercase tracking-widest text-destructive">Error</p>
              <p className="text-sm font-mono text-foreground/80">{errorMsg}</p>
              <button
                data-testid="retry-button"
                onClick={handleReset}
                className="text-xs font-mono text-primary hover:underline"
              >
                ← Try again
              </button>
            </div>
          )}

          {/* Result actions — shown when done */}
          {isDone && result && (
            <>
              <ResultActions
                notebookJson={result.notebookJson}
                filename={result.filename}
                colabUrl={result.colabUrl}
                title={result.title}
              />
              <button
                data-testid="generate-another-button"
                onClick={handleReset}
                className="w-full py-2 font-mono text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                ← Generate another notebook
              </button>
            </>
          )}
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-border px-6 py-3 flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground/40">v1.0.0-alpha</span>
        <span className="text-[10px] font-mono text-muted-foreground/40">paper2colab</span>
      </footer>
    </div>
  );
}
