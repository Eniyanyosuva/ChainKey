"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, updateRateLimit, renderBN } from "../../utils/chainkey";

interface Props {
    keyData: any;
    projectPDA: PublicKey;
    onClose: () => void;
    onSuccess: () => void;
}

export default function UpdateRateLimitModal({ keyData, projectPDA, onClose, onSuccess }: Props) {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const [rateLimit, setRateLimit] = useState(String(keyData.rateLimit));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        if (!publicKey || !wallet) return;
        const val = parseInt(rateLimit);
        if (!val || val < 1) { setError("Rate limit must be ≥ 1"); return; }
        setLoading(true);
        setError("");
        try {
            const program = getProgram(wallet.adapter, connection);
            await updateRateLimit(program, publicKey, projectPDA, keyData.pda, val);
            onSuccess();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-header">
                    <div className="modal-title">🚦 Update Rate Limit</div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
                    Updating rate limit for <strong style={{ color: "var(--text1)" }}>{keyData.name}</strong>
                </p>

                <div className="form-group">
                    <label className="form-label">Requests per 24h</label>
                    <input
                        className="form-input"
                        type="number"
                        value={rateLimit}
                        onChange={e => setRateLimit(e.target.value)}
                        min={1}
                        style={{ fontSize: 20, fontWeight: 700 }}
                    />
                    <div className="form-hint">Current: {renderBN(keyData.rateLimit)} req/24h. Uses Solana slot-based sliding windows (~216,000 slots ≈ 24h).</div>
                </div>

                {error && (
                    <div className="result-box result-error" style={{ marginBottom: 16 }}>
                        <div className="result-title">Error</div>
                        <div className="result-detail">{error}</div>
                    </div>
                )}

                <div className="form-footer">
                    <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="btn btn-primary" onClick={submit} disabled={loading}>
                        {loading ? <><span className="spinner" /> Saving...</> : "Update Limit"}
                    </button>
                </div>
            </div>
        </div>
    );
}
