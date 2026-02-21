"use client";

import { useState } from "react";

interface CopyButtonProps {
    text: string;
    display?: string;
    mono?: boolean;
}

export default function CopyButton({ text, display, mono = true }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const shown = display || `${text.slice(0, 6)}...${text.slice(-4)}`;

    return (
        <button onClick={copy} className="copy-btn" title="Copy to clipboard">
            <span style={{
                fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
                fontSize: 12,
            }}>
                {shown}
            </span>
            <span style={{ fontSize: 13, opacity: 0.5 }}>
                {copied ? "✓" : "⧉"}
            </span>
        </button>
    );
}
