"use client";

import { useState } from "react";
import { ApiKeyInput } from "@/components/api-key-input";
import { PdfUploadZone } from "@/components/pdf-upload-zone";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const canSubmit = apiKey.trim().length > 0 && pdfFile !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Will be wired to generation API in Task 7
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        {/* Grid logo mark */}
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
        {/* Status indicator */}
        <div className="ml-auto flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
          <span className="text-[11px] font-mono text-muted-foreground">ready</span>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Panel */}
        <div className="w-full max-w-lg">
          {/* Top label */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-mono text-muted-foreground tracking-widest uppercase">
              generate notebook
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* API Key */}
            <ApiKeyInput value={apiKey} onChange={setApiKey} />

            {/* PDF Upload */}
            <PdfUploadZone file={pdfFile} onFileChange={setPdfFile} />

            {/* Submit */}
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
          </form>

          {/* Bottom hint */}
          <p className="mt-4 text-center text-[11px] font-mono text-muted-foreground/50">
            Processing takes 60–90 seconds · powered by OpenAI
          </p>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-border px-6 py-3 flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground/40">
          v1.0.0-alpha
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/40">
          paper2colab
        </span>
      </footer>
    </div>
  );
}
