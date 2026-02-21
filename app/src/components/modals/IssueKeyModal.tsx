"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, issueApiKey, sha256Browser, generateSecret, getApiKeyPDA, renderBN } from "../../utils/chainkey";

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
    const [name, setName] = useState("");
    const [scopeInput, setScopeInput] = useState("");
    const [scopes, setScopes] = useState<string[]>(["read:data"]);
    const [rateOverride, setRateOverride] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [secret, setSecret] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const addScope = () => {
        const s = scopeInput.trim();
        if (s && !scopes.includes(s) && scopes.length < 8) {
            setScopes([...scopes, s]);
            setScopeInput("");
        }
    };
    const removeScope = (s: string) => setScopes(scopes.filter((x) => x !== s));

    const submit = async () => {
        if (!publicKey || !wallet) return;
        setLoading(true);
        setError("");
        try {
            const rawSecret = generateSecret();
            const keyHash = await sha256Browser(rawSecret);
            const program = getProgram(wallet.adapter, connection);
            const rateLimit = rateOverride ? parseInt(rateOverride) : null;
            await issueApiKey(program, publicKey, projectPDA, currentKeyCount, name, keyHash, scopes, null, rateLimit);
            setSecret(rawSecret);
        } catch (e: any) {
            setError(e.message);
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
                    <label className="form-label">Scopes</label>
                    <div className="scope-tags">
                        {scopes.map(s => (
                            <span key={s} className="scope-tag">
                                {s}
                                <button className="scope-tag-remove" onClick={() => removeScope(s)}>×</button>
                            </span>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input
                            className="form-input"
                            value={scopeInput}
                            onChange={e => setScopeInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addScope()}
                            placeholder="read:data (press Enter)"
                        />
                        <button className="btn btn-outline" onClick={addScope} disabled={scopes.length >= 8}>Add</button>
                    </div>
                    <div className="form-hint">Max 8 scopes. Use * for wildcard access.</div>
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
                    <div className="result-box result-error" style={{ marginTop: 12 }}>
                        <div className="result-title">Error</div>
                        <div className="result-detail">{error}</div>
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
