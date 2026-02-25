"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, rotateApiKey, sha256Browser, generateSecret, handleTransactionError } from "../../utils/chainkey";
import { useToast } from "../../context/ToastContext";

interface Props {
    keyData: any;
    projectPDA: PublicKey;
    onClose: () => void;
    onSuccess: () => void;
}

export default function RotateKeyModal({ keyData, projectPDA, onClose, onSuccess }: Props) {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{ title: string; message: string; type: string } | null>(null);
    const [newSecret, setNewSecret] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const rotate = async () => {
        if (!publicKey || !wallet) return;
        setLoading(true);
        setError(null);
        try {
            const rawSecret = generateSecret();
            const hash = await sha256Browser(rawSecret);
            const program = getProgram(wallet.adapter, connection);
            await rotateApiKey(program, publicKey, projectPDA, keyData.pda, hash, keyData.expiresAt);
            showToast("Success", "API Key rotated", "success");
            setNewSecret(rawSecret);
        } catch (e: any) {
            setError(handleTransactionError(e));
        } finally {
            setLoading(false);
        }
    };

    const copy = () => {
        if (newSecret) { navigator.clipboard.writeText(newSecret); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    };

    if (newSecret) {
        return (
            <div className="modal-overlay">
                <div className="modal">
                    <div className="modal-header">
                        <div className="modal-title">🔄 Key Rotated!</div>
                        <button className="modal-close" onClick={onSuccess}>×</button>
                    </div>
                    <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 12 }}>
                        Old secret is now invalid. Copy your new secret:
                    </p>
                    <div className="secret-box">
                        <h4>⚠️ NEW SECRET — COPY NOW</h4>
                        <div className="secret-value">{newSecret}</div>
                        <p className="secret-warn">This is the only time you'll see this key.</p>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <button className="btn btn-outline" style={{ flex: 1 }} onClick={copy}>
                            {copied ? "✓ Copied!" : "📋 Copy"}
                        </button>
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onSuccess}>Done</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-header">
                    <div className="modal-title">🔄 Rotate Key</div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 20 }}>
                    Rotating <strong style={{ color: "var(--text1)" }}>{keyData.name}</strong> generates a new secret atomically.
                    The old secret will become invalid immediately upon confirmation.
                </p>
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "var(--warning)", marginBottom: 20 }}>
                    ⚠️ Make sure you immediately copy the new secret — it will only be shown once.
                </div>

                {error && (
                    <div className={`result-box result-${error.type}`} style={{ marginBottom: 16 }}>
                        <div className="result-title">{error.title}</div>
                        <div className="result-detail">{error.message}</div>
                    </div>
                )}

                <div className="form-footer">
                    <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="btn btn-primary" onClick={rotate} disabled={loading}>
                        {loading ? <><span className="spinner" /> Rotating...</> : "Rotate Key"}
                    </button>
                </div>
            </div>
        </div>
    );
}
