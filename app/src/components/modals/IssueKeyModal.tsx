"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, issueApiKey, sha256Browser, generateSecret, SCOPE_READ, SCOPE_WRITE, SCOPE_ADMIN, SCOPE_NONE, renderBN, handleTransactionError } from "../../utils/chainkey";
import { BN } from "@coral-xyz/anchor";
import { useToast } from "../../context/ToastContext";

interface Props {
    projectPDA: PublicKey;
    currentKeyCount: number;
    defaultRateLimit: number;
    onClose: () => void;
    onSuccess: () => void;
}

export default function IssueKeyModal({ projectPDA, currentKeyCount, defaultRateLimit, onClose, onSuccess }: Props) {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const { showToast } = useToast();
    const [name, setName] = useState("");
    const [selectedScopes, setSelectedScopes] = useState<BN>(SCOPE_READ);
    const [customMask, setCustomMask] = useState("");
    const [rateOverride, setRateOverride] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{ title: string; message: string; type: string } | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const toggleScope = (mask: BN) => {
        if (selectedScopes.and(mask).gt(SCOPE_NONE)) {
            setSelectedScopes(selectedScopes.xor(mask));
        } else {
            setSelectedScopes(selectedScopes.or(mask));
        }
    };

    const submit = async () => {
        if (!publicKey || !wallet) return;
        setLoading(true);
        setError(null);
        try {
            const program = getProgram(wallet.adapter, connection);
            if (!program) return;
            const rawSecret = generateSecret();
            const keyHash = await sha256Browser(rawSecret);
            const rateLimit = rateOverride ? parseInt(rateOverride) : null;

            let finalScopes = selectedScopes;
            if (customMask) {
                try {
                    const mask = customMask.startsWith("0x") ? new BN(customMask.slice(2), 16) : new BN(customMask);
                    finalScopes = finalScopes.or(mask);
                } catch (e) {
                    throw new Error("Invalid custom bitmask");
                }
            }

            await issueApiKey(program, publicKey, projectPDA, currentKeyCount, name, keyHash, finalScopes, null, rateLimit);
            showToast("Success", "API Key issued", "success");
            setSecret(rawSecret);
        } catch (e: any) {
            setError(handleTransactionError(e));
        } finally {
            setLoading(false);
        }
    };

    const copy = () => {
        if (secret) { navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    };

    if (secret) {
        return (
            <div className="modal-overlay">
                <div className="modal">
                    <div className="modal-header">
                        <div className="modal-title">🎉 Key Issued!</div>
                        <button className="modal-close" onClick={onSuccess}>×</button>
                    </div>
                    <div className="secret-box">
                        <h4>⚠️ COPY YOUR SECRET NOW — IT IS NEVER STORED</h4>
                        <div className="secret-value">{secret}</div>
                        <p className="secret-warn">This is the ONLY time you'll see this key. Store it securely.</p>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                        <button className="btn btn-outline" style={{ flex: 1 }} onClick={copy}>
                            {copied ? "✓ Copied!" : "📋 Copy Secret"}
                        </button>
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onSuccess}>
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-header">
                    <div className="modal-title">🗝️ Issue API Key</div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="form-group">
                    <label className="form-label">Key Name *</label>
                    <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production Key" maxLength={64} />
                </div>

                <div className="form-group">
                    <label className="form-label">Permissions (Scopes)</label>
                    <div className="checkbox-group" style={{ display: "flex", gap: 15, marginBottom: 10 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                            <input type="checkbox" checked={selectedScopes.and(SCOPE_READ).gt(SCOPE_NONE)} onChange={() => toggleScope(SCOPE_READ)} />
                            READ
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                            <input type="checkbox" checked={selectedScopes.and(SCOPE_WRITE).gt(SCOPE_NONE)} onChange={() => toggleScope(SCOPE_WRITE)} />
                            WRITE
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                            <input type="checkbox" checked={selectedScopes.and(SCOPE_ADMIN).gt(SCOPE_NONE)} onChange={() => toggleScope(SCOPE_ADMIN)} />
                            ADMIN
                        </label>
                    </div>
                    <input
                        className="form-input"
                        value={customMask}
                        onChange={e => setCustomMask(e.target.value)}
                        placeholder="Custom Mask (e.g. 0x08 for bit 3)"
                    />
                    <div className="form-hint">ChainKey now uses a u64 bitmask for efficient, high-performance scope checking.</div>
                </div>

                <div className="form-group">
                    <label className="form-label">Rate Limit Override (optional)</label>
                    <input
                        className="form-input"
                        type="number"
                        value={rateOverride}
                        onChange={e => setRateOverride(e.target.value)}
                        placeholder={`Default: ${renderBN(defaultRateLimit)} req/24h`}
                        min={1}
                    />
                </div>

                <div style={{ padding: "10px 14px", background: "var(--surface)", borderRadius: 8, fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>
                    Key Index: <strong style={{ color: "var(--text1)" }}>#{currentKeyCount + 1}</strong> &nbsp;·&nbsp;
                    A new secret will be generated and SHA-256 hashed before storing on-chain.
                </div>

                {error && (
                    <div className={`result-box result-${error.type}`} style={{ marginTop: 12 }}>
                        <div className="result-title">{error.title}</div>
                        <div className="result-detail">{error.message}</div>
                    </div>
                )}

                <div className="form-footer">
                    <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="btn btn-primary" onClick={submit} disabled={loading || !name.trim()}>
                        {loading ? <><span className="spinner" /> Issuing...</> : "Issue Key"}
                    </button>
                </div>
            </div>
        </div>
    );
}
