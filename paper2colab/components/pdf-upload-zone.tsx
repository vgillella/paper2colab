"use client";

import { useRef, useState, useCallback } from "react";

interface PdfUploadZoneProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export function PdfUploadZone({ file, onFileChange }: PdfUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (f: File | null) => {
      if (f && f.type !== "application/pdf") return;
      onFileChange(f);
    },
    [onFileChange]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0] ?? null);
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground">
        Research Paper (PDF)
      </label>

      {/* Hidden file input — testable via setInputFiles */}
      <input
        ref={inputRef}
        data-testid="pdf-file-input"
        type="file"
        accept=".pdf,application/pdf"
        onChange={onInputChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div
        data-testid="pdf-upload-zone"
        onClick={() => inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        aria-label="Upload PDF — click or drag and drop"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={[
          "relative w-full min-h-[140px] border border-dashed",
          "flex flex-col items-center justify-center gap-3",
          "cursor-pointer transition-all duration-150 select-none",
          "outline-none",
          isDragging
            ? "border-primary bg-primary/5 shadow-[0_0_0_2px_rgba(0,212,255,0.15)]"
            : file
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-secondary hover:border-primary/40 hover:bg-secondary/80",
          "focus-visible:border-primary focus-visible:shadow-[0_0_0_2px_rgba(0,212,255,0.15)]",
        ].join(" ")}
      >
        {file ? (
          <>
            {/* File icon */}
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-primary shrink-0"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div className="text-center px-4">
              <p className="text-sm font-mono text-foreground truncate max-w-[280px]">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(file.size / 1024).toFixed(0)} KB · click to change
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Upload icon */}
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-muted-foreground shrink-0"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-center px-4">
              <p className="text-sm text-foreground">
                <span className="text-primary font-mono">Click to browse</span>
                {" "}or drag &amp; drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">PDF files only</p>
            </div>
          </>
        )}

        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10 pointer-events-none">
            <p className="text-sm font-mono text-primary">Drop PDF here</p>
          </div>
        )}
      </div>
    </div>
  );
}
