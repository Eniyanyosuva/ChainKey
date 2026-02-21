"use client";

import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import {
    getProgram, getApiKeyPDA,
    fetchAllKeysForProject, keyStatus,
} from "../../../utils/chainkey";
import CopyButton from "../../../components/CopyButton";
import IssueKeyModal from "../../../components/modals/IssueKeyModal";
import VerifyKeyModal from "../../../components/modals/VerifyKeyModal";
import RotateKeyModal from "../../../components/modals/RotateKeyModal";
import UpdateScopesModal from "../../../components/modals/UpdateScopesModal";
import UpdateRateLimitModal from "../../../components/modals/UpdateRateLimitModal";
import InspectKeyModal from "../../../components/modals/InspectKeyModal";

export default function ProjectPage() {
    const params = useParams();
    const projectPdaStr = params.projectId as string;
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();

    const [project, setProject] = useState<any>(null);
    const [keys, setKeys] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Modals
    const [showIssue, setShowIssue] = useState(false);
    const [showVerify, setShowVerify] = useState<any>(null);
    const [showRotate, setShowRotate] = useState<any>(null);
    const [showScopes, setShowScopes] = useState<any>(null);
    const [showRateLimit, setShowRateLimit] = useState<any>(null);
    const [showInspect, setShowInspect] = useState<any>(null);

    const load = useCallback(async () => {
        if (!publicKey || !wallet) {
            setProject(null);
            setKeys([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const program = getProgram(wallet.adapter, connection);
            const projectPda = new PublicKey(projectPdaStr);
            const proj = await (program.account as any).project.fetch(projectPda);
            setProject({ ...proj, pda: projectPda });
            const allKeys = await fetchAllKeysForProject(program, projectPda, proj.totalKeys);
            setKeys(allKeys);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [publicKey, wallet, connection, projectPdaStr]);

    useEffect(() => { load(); }, [load]);

    const projectPda = project?.pda;

    const revokeKey = async (k: any) => {
        if (!publicKey || !wallet || !projectPda) return;
        setActionLoading(true);
        try {
            const program = getProgram(wallet.adapter, connection);
            await program.methods.revokeApiKey().accounts({
                apiKey: k.pda,
                project: projectPda,
                authority: publicKey,
            }).rpc();
            await load();
        } catch (e) { console.error(e); }
        setActionLoading(false);
    };

    if (loading) {
        return (
            <div className="empty-state">
                <span className="spinner" style={{ width: 32, height: 32 }} />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="empty-state">
                <p>Project not found</p>
            </div>
        );
    }

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="page-title">{project.name}</h1>
                    <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 4 }}>
                        {project.description || "No description"}
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowIssue(true)}>
                    + Issue Key
                </button>
            </div>

            {/* Stats */}
            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Keys</div>
                    <div className="stat-value">{project.totalKeys}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Active Keys</div>
                    <div className="stat-value">
                        {keys.filter((k) => keyStatus(k.status) === "Active").length}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Default Rate Limit</div>
                    <div className="stat-value">{project.defaultRateLimit}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Project PDA</div>
                    <CopyButton text={projectPdaStr} />
                </div>
            </div>

            {/* Key list */}
            <div style={{ marginBottom: 12 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px" }}>
                    API Keys
                </h2>
            </div>

            {keys.length === 0 ? (
                <div className="empty-state">
                    <p>No keys issued yet</p>
                    <button className="btn btn-primary" onClick={() => setShowIssue(true)}>
                        Issue First Key
                    </button>
                </div>
            ) : (
                <div className="key-grid">
                    {keys.map((k) => {
                        const st = keyStatus(k.status);
                        const statusClass = st === "Active" ? "status-active"
                            : st === "Revoked" ? "status-revoked" : "status-paused";
                        const usagePercent = k.rateLimit > 0 ? Math.min(100, ((k.usage?.count || 0) / k.rateLimit) * 100) : 0;

                        return (
                            <div className="key-card" key={k.index}>
                                <div className="key-card-info">
                                    <div className="key-card-name">
                                        Key #{k.index + 1}
                                        <span className={`status-badge ${statusClass}`} style={{ marginLeft: 10 }}>
                                            {st}
                                        </span>
                                    </div>
                                    <div className="key-card-addr">
                                        <CopyButton text={k.pda.toBase58()} />
                                    </div>
                                </div>

                                <div className="key-card-meta">
                                    <div className="key-meta-item">
                                        <div className="key-meta-label">Usage</div>
                                        <div className="key-meta-value">{k.usage?.count || 0}</div>
                                        <div className="usage-bar">
                                            <div className="usage-bar-fill" style={{ width: `${usagePercent}%` }} />
                                        </div>
                                    </div>
                                    <div className="key-meta-item">
                                        <div className="key-meta-label">Rate Limit</div>
                                        <div className="key-meta-value">{k.rateLimit}</div>
                                    </div>
                                    <div className="key-meta-item">
                                        <div className="key-meta-label">Scopes</div>
                                        <div className="key-meta-value">{k.scopes?.join(", ") || "—"}</div>
                                    </div>
                                </div>

                                <div className="key-card-actions">
                                    <button className="btn-sm" onClick={() => setShowInspect(k)}>
                                        Details
                                    </button>
                                    {st === "Active" && (
                                        <>
                                            <button className="btn-sm" onClick={() => setShowVerify(k)}>Verify</button>
                                            <button className="btn-sm" onClick={() => setShowRotate(k)}>Rotate</button>
                                            <button className="btn-sm" onClick={() => setShowScopes(k)}>Scopes</button>
                                            <button className="btn-sm" onClick={() => setShowRateLimit(k)}>Limit</button>
                                            <button
                                                className="btn-sm danger"
                                                disabled={actionLoading}
                                                onClick={() => revokeKey(k)}
                                            >
                                                Revoke
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
            {showIssue && (
                <IssueKeyModal
                    projectPDA={projectPda}
                    currentKeyCount={project.totalKeys}
                    defaultRateLimit={project.defaultRateLimit}
                    onClose={() => setShowIssue(false)}
                    onSuccess={load}
                />
            )}
            {showVerify && (
                <VerifyKeyModal
                    keyData={showVerify}
                    onClose={() => setShowVerify(null)}
                />
            )}
            {showRotate && (
                <RotateKeyModal
                    keyData={showRotate}
                    projectPDA={projectPda}
                    onClose={() => setShowRotate(null)}
                    onSuccess={load}
                />
            )}
            {showScopes && (
                <UpdateScopesModal
                    keyData={showScopes}
                    projectPDA={projectPda}
                    onClose={() => setShowScopes(null)}
                    onSuccess={load}
                />
            )}
            {showRateLimit && (
                <UpdateRateLimitModal
                    keyData={showRateLimit}
                    projectPDA={projectPda}
                    onClose={() => setShowRateLimit(null)}
                    onSuccess={load}
                />
            )}
            {showInspect && (
                <InspectKeyModal
                    keyData={showInspect}
                    onClose={() => setShowInspect(null)}
                />
            )}
        </>
    );
}
