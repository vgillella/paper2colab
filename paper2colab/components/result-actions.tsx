"use client";

interface ResultActionsProps {
  notebookJson: string;
  filename: string;
  colabUrl: string | null;
  title: string;
}

export function ResultActions({ notebookJson, filename, colabUrl, title }: ResultActionsProps) {
  const handleDownload = () => {
    const blob = new Blob([notebookJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="result-actions" className="space-y-4">
      {/* Title */}
      <div className="border-b border-border pb-3">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Generated notebook
        </p>
        <p
          data-testid="result-title"
          className="text-sm font-mono text-foreground truncate"
          title={title}
        >
          {title}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Download */}
        <button
          data-testid="download-button"
          onClick={handleDownload}
          className={[
            "flex-1 py-3 px-4 font-mono text-sm font-medium tracking-wide",
            "border border-primary bg-primary text-primary-foreground",
            "hover:bg-primary/90 hover:shadow-[0_0_16px_rgba(0,212,255,0.25)]",
            "transition-all duration-150 outline-none",
            "focus-visible:shadow-[0_0_0_2px_rgba(0,212,255,0.4)]",
          ].join(" ")}
        >
          Download .ipynb
        </button>

        {/* Open in Colab */}
        {colabUrl && (
          <a
            data-testid="colab-button"
            href={colabUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "flex-1 py-3 px-4 font-mono text-sm font-medium tracking-wide text-center",
              "border border-primary/60 bg-transparent text-primary",
              "hover:bg-primary/10 hover:border-primary",
              "transition-all duration-150 outline-none",
              "focus-visible:shadow-[0_0_0_2px_rgba(0,212,255,0.4)]",
            ].join(" ")}
          >
            Open in Colab ↗
          </a>
        )}
      </div>

      {!colabUrl && (
        <p className="text-[11px] font-mono text-muted-foreground/50 text-center">
          Colab link unavailable — download the file and upload it to{" "}
          <a
            href="https://colab.research.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/60 hover:text-primary underline"
          >
            colab.research.google.com
          </a>
        </p>
      )}
    </div>
  );
}
