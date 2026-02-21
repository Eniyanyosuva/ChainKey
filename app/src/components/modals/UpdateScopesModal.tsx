"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, updateScopes } from "../../utils/chainkey";

interface Props {
    keyData: any;
    projectPDA: PublicKey;
    onClose: () => void;
    onSuccess: () => void;
}

export default function UpdateScopesModal({ keyData, projectPDA, onClose, onSuccess }: Props) {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const [scopes, setScopes] = useState<string[]>([...keyData.scopes]);
    const [scopeInput, setScopeInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

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
            const program = getProgram(wallet.adapter, connection);
            await updateScopes(program, publicKey, projectPDA, keyData.pda, scopes);
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
                    <div className="modal-title">🏷️ Update Scopes</div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
                    Updating scopes for <strong style={{ color: "var(--text1)" }}>{keyData.name}</strong>
                </p>

                <div className="form-group">
                    <label className="form-label">Scopes (max 8)</label>
                    <div className="scope-tags">
                        {scopes.map(s => (
                            <span key={s} className="scope-tag">
                                {s}
                                <button className="scope-tag-remove" onClick={() => removeScope(s)}>×</button>
                            </span>
                        ))}
                        {scopes.length === 0 && <span style={{ fontSize: 13, color: "var(--text3)" }}>No scopes</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input
                            className="form-input"
                            value={scopeInput}
                            onChange={e => setScopeInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addScope()}
                            placeholder="add:scope (press Enter)"
                        />
                        <button className="btn btn-outline" onClick={addScope} disabled={scopes.length >= 8}>Add</button>
                    </div>
                    <div className="form-hint">Use * for wildcard (admin) access.</div>
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
                        {loading ? <><span className="spinner" /> Saving...</> : "Update Scopes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
