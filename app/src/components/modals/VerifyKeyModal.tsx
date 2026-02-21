"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { getProgram, verifyApiKey, sha256Browser, renderBN } from "../../utils/chainkey";

interface Props {
    keyData: any;
    onClose: () => void;
}

export default function VerifyKeyModal({ keyData, onClose }: Props) {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const [secret, setSecret] = useState("");
    const [scope, setScope] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; msg: string; count?: number } | null>(null);

    const verify = async () => {
        if (!publicKey || !wallet) return;
        setLoading(true);
        setResult(null);
        try {
            const hash = await sha256Browser(secret.trim());
            const program = getProgram(wallet.adapter, connection);
            await verifyApiKey(program, publicKey, keyData.pda, hash, scope.trim() || null);
            // Fetch updated usage
            let count: number | undefined;
            try {
                const usage = await (program.account as any).usageAccount.fetch(keyData.usagePDA);
                count = (usage.requestCount as any).toNumber?.() ?? usage.requestCount;
            } catch {
                count = 0; // Usage account might not exist yet if verify just failed or first time
            }
            setResult({ ok: true, msg: "✓ VERIFIED — Key is VALID", count });
        } catch (e: any) {
            console.error("Verification failed:", e);
            const msg = e.message || "";
            // Check for Anchor custom errors
            if (msg.includes("InvalidKey") || (e.code === 6002)) setResult({ ok: false, msg: "Invalid key — hash mismatch" });
            else if (msg.includes("InsufficientScope") || (e.code === 6003)) setResult({ ok: false, msg: "Insufficient scope" });
            else if (msg.includes("KeyNotActive") || (e.code === 6001)) setResult({ ok: false, msg: "Key is not active" });
            else if (msg.includes("KeyExpired") || (e.code === 6004)) setResult({ ok: false, msg: "Key has expired" });
            else if (msg.includes("RateLimitExceeded") || (e.code === 6005)) setResult({ ok: false, msg: "Rate limit exceeded" });
            else setResult({ ok: false, msg: msg.slice(0, 120) || "Verification failed" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-header">
                    <div className="modal-title">🔍 Verify Key</div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
                    Key: <strong style={{ color: "var(--text1)" }}>{keyData.name}</strong> &nbsp;#{keyData.index + 1}
                </div>

                <div className="form-group">
                    <label className="form-label">Secret Key *</label>
                    <input
                        className="form-input"
                        type="password"
                        value={secret}
                        onChange={e => setSecret(e.target.value)}
                        placeholder="sk_abc123..."
                    />
                    <div className="form-hint">The raw secret (not the hash). It will be SHA-256 hashed in your browser.</div>
                </div>

                <div className="form-group">
                    <label className="form-label">Required Scope (optional)</label>
                    <input
                        className="form-input"
                        value={scope}
                        onChange={e => setScope(e.target.value)}
                        placeholder="e.g. read:data"
                    />
                </div>

                {result && (
                    <div className={`result-box ${result.ok ? "result-success" : "result-error"}`}>
                        <div className="result-title">{result.msg}</div>
                        {result.count !== undefined && (
                            <div className="result-detail">Request count: {renderBN(result.count)} / {renderBN(keyData.rateLimit)} in window</div>
                        )}
                    </div>
                )}

                <div className="form-footer">
                    <button className="btn btn-outline" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" onClick={verify} disabled={loading || !secret}>
                        {loading ? <><span className="spinner" /> Verifying...</> : "Verify"}
                    </button>
                </div>
            </div>
        </div>
    );
}
