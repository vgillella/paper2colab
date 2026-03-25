"use client";

import { useState } from "react";

interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function ApiKeyInput({ value, onChange }: ApiKeyInputProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-1.5">
      <label
        data-testid="api-key-label"
        htmlFor="api-key-input"
        className="block text-xs font-mono uppercase tracking-widest text-muted-foreground"
      >
        OpenAI API Key
      </label>
      <div className="relative">
        <input
          id="api-key-input"
          data-testid="api-key-input"
          type={showKey ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
          spellCheck={false}
          className={[
            "w-full px-3 py-2.5 pr-20",
            "bg-secondary border border-border",
            "text-foreground font-mono text-sm",
            "placeholder:text-muted-foreground",
            "outline-none transition-colors",
            "hover:border-primary/40",
            "focus:border-primary focus:shadow-[0_0_0_2px_rgba(0,212,255,0.12)]",
          ].join(" ")}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
            tabIndex={-1}
          >
            {showKey ? "HIDE" : "SHOW"}
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground/60 font-mono">
        Your key is used directly — never stored.
      </p>
    </div>
  );
}
