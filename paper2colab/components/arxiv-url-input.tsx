"use client";

interface ArxivUrlInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function ArxivUrlInput({ value, onChange }: ArxivUrlInputProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor="arxiv-url-input"
        className="block text-xs font-mono uppercase tracking-widest text-muted-foreground"
      >
        arXiv Paper URL or ID
      </label>
      <input
        id="arxiv-url-input"
        data-testid="arxiv-url-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://arxiv.org/abs/2301.00001"
        autoComplete="off"
        spellCheck={false}
        className={[
          "w-full px-3 py-2.5",
          "bg-secondary font-mono text-sm",
          "text-foreground placeholder:text-muted-foreground",
          "outline-none transition-colors",
          "border border-border hover:border-primary/40 focus:border-primary focus:shadow-[0_0_0_2px_rgba(0,212,255,0.12)]",
        ].join(" ")}
      />
      <p className="text-[11px] text-muted-foreground/60 font-mono">
        Paste an arXiv URL or bare paper ID (e.g. 2301.00001)
      </p>
    </div>
  );
}
