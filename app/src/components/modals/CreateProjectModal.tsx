"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { getProgram, randomProjectId, createProject } from "../../utils/chainkey";

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateProjectModal({ onClose, onSuccess }: Props) {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [rateLimit, setRateLimit] = useState("1000");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        if (!publicKey || !wallet) return;
        setLoading(true);
        setError("");
        try {
            const program = getProgram(wallet.adapter, connection);
            const projectId = randomProjectId();
            await createProject(program, publicKey, projectId, name, description, parseInt(rateLimit));
            onSuccess();
            onClose();
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
                    <div className="modal-title">📦 Create Project</div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="form-group">
                    <label className="form-label">Project Name *</label>
                    <input
                        className="form-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. My Production App"
                        maxLength={64}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                        className="form-textarea"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What is this project for?"
                        rows={3}
                        maxLength={128}
                        style={{ resize: "vertical" }}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Default Rate Limit (requests per 24h)</label>
                    <input
                        className="form-input"
                        type="number"
                        value={rateLimit}
                        onChange={(e) => setRateLimit(e.target.value)}
                        min={1}
                    />
                    <div className="form-hint">This is the default limit applied to all new keys. Can be overridden per key.</div>
                </div>

                {error && (
                    <div className="result-box result-error" style={{ marginBottom: 16 }}>
                        <div className="result-title">Error</div>
                        <div className="result-detail">{error}</div>
                    </div>
                )}

                <div className="form-footer">
                    <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        onClick={submit}
                        disabled={loading || !name.trim()}
                    >
                        {loading ? <><span className="spinner" /> Creating...</> : "Create Project"}
                    </button>
                </div>
            </div>
        </div>
    );
}
