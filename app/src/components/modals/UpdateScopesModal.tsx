"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, updateScopes, SCOPE_READ, SCOPE_WRITE, SCOPE_ADMIN, SCOPE_NONE, handleTransactionError } from "../../utils/chainkey";
import { BN } from "@coral-xyz/anchor";
import { useToast } from "../../context/ToastContext";

interface Props {
    keyData: any;
    projectPDA: PublicKey;
    onClose: () => void;
    onSuccess: () => void;
}

export default function UpdateScopesModal({ keyData, projectPDA, onClose, onSuccess }: Props) {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const { showToast } = useToast();
    const [selectedScopes, setSelectedScopes] = useState<BN>(new BN(keyData.scopes));
    const [customMask, setCustomMask] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{ title: string; message: string; type: string } | null>(null);

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

            let finalScopes = selectedScopes;
            if (customMask) {
                try {
                    const mask = customMask.startsWith("0x") ? new BN(customMask.slice(2), 16) : new BN(customMask);
                    finalScopes = finalScopes.or(mask);
                } catch (e) {
                    throw new Error("Invalid custom bitmask");
                }
            }

            await updateScopes(program, publicKey, projectPDA, keyData.pda, finalScopes);
            showToast("Success", "Scopes updated successfully", "success");
            onSuccess();
            onClose();
        } catch (e: any) {
            setError(handleTransactionError(e));
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
                    <div className="form-hint">ChainKey bitmasks are atomic and efficient. Toggle standard scopes or provide a custom hex mask.</div>
                </div>

                {error && (
                    <div className={`result-box result-${error.type}`} style={{ marginBottom: 16 }}>
                        <div className="result-title">{error.title}</div>
                        <div className="result-detail">{error.message}</div>
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
