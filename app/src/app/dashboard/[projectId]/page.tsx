"use client";

import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import {
    getProgram, getApiKeyPDA,
    fetchAllKeysForProject, keyStatus,
    handleTransactionError, renderBN, renderScopes,
    closeUsageAccount, closeApiKey, closeProject, closeProjectForced,
} from "../../../utils/chainkey";
import { useToast } from "../../../context/ToastContext";
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
    const { showToast } = useToast();

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
    const [showForceDelete, setShowForceDelete] = useState(false);

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
        } catch (e) {
            const err = handleTransactionError(e);
            showToast(err.title, err.message, err.type);
        }
        setActionLoading(false);
    };

    const suspendKey = async (k: any) => {
        if (!publicKey || !wallet || !projectPda) return;
        setActionLoading(true);
        try {
            const program = getProgram(wallet.adapter, connection);
            await program.methods.suspendApiKey().accounts({
                apiKey: k.pda,
                project: projectPda,
                authority: publicKey,
            }).rpc();
            await load();
        } catch (e) {
            const err = handleTransactionError(e);
            showToast(err.title, err.message, err.type);
        }
        setActionLoading(false);
    };

    const reactivateKey = async (k: any) => {
        if (!publicKey || !wallet || !projectPda) return;
        setActionLoading(true);
        try {
            const program = getProgram(wallet.adapter, connection);
            await program.methods.reactivateApiKey().accounts({
                apiKey: k.pda,
                project: projectPda,
                authority: publicKey,
            }).rpc();
            await load();
        } catch (e) {
            const err = handleTransactionError(e);
            showToast(err.title, err.message, err.type);
        }
        setActionLoading(false);
    };

    const handleDeleteProject = async () => {
        if (!publicKey || !wallet || !projectPda) return;
        const confirmed = window.confirm("Are you sure you want to delete this project? This will permanently revoke and close ALL keys and reclaim all SOL rent. This action cannot be undone.");
        if (!confirmed) return;

        setActionLoading(true);
        try {
            const program = getProgram(wallet.adapter, connection);
            showToast("Cleanup Started", `Closing ${keys.length} keys and usage accounts...`, "info");

            let closedCount = 0;
            let errorCount = 0;

            // 1. Close all usage accounts and api keys
            for (const k of keys) {
                try {
                    if (k.usage) {
                        await closeUsageAccount(program, publicKey, projectPda, k.pda);
                    }
                    await closeApiKey(program, publicKey, projectPda, k.pda);
                    closedCount++;
                } catch (e: any) {
                    console.error(`Failed to close key #${k.index}:`, e);
                    errorCount++;
                }
            }

            if (errorCount > 0) {
                showToast("Cleanup Partial", `Closed ${closedCount} keys, but ${errorCount} failed. Attempting to close project anyway...`, "warning");
            }

            // 2. Close project account
            try {
                await closeProject(program, publicKey, projectPda);
                showToast("Success", "Project and all accounts deleted. Rent reclaimed.", "success");
                window.location.href = "/dashboard";
            } catch (e: any) {
                const err = handleTransactionError(e);

                if (err.message.includes("ProjectHasKeys")) {
                    showToast("Closure Blocked", "Standard closure failed because the program still thinks there are active keys. You may need to use 'Force Delete'.", "error");
                    setShowForceDelete(true);
                } else {
                    showToast(`Project Closure Failed`, err.message, "error");
                }
                // Refresh data to show current state
                await load();
            }
        } catch (e: any) {
            const err = handleTransactionError(e);
            showToast(err.title, err.message, err.type);
        }
        setActionLoading(false);
    };

    const handleForceDelete = async () => {
        if (!publicKey || !wallet || !projectPda) return;
        const confirmed = window.confirm("DANGER: This will bypass account checks and FORCE the project account to close. Use this ONLY if standard deletion is failing due to state corruption. Continue?");
        if (!confirmed) return;

        setActionLoading(true);
        try {
            const program = getProgram(wallet.adapter, connection);
            await closeProjectForced(program, publicKey, projectPda);
            showToast("Success", "Project forced closed and rent reclaimed.", "success");
            window.location.href = "/dashboard";
        } catch (e: any) {
            const err = handleTransactionError(e);
            showToast("Force Delete Failed", err.message, "error");
        }
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
                                        <div className="key-meta-value" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {renderScopes(k.scopes)}
                                        </div>
                                    </div>
                                    <div className="key-meta-item">
                                        <div className="key-meta-label">Last Active</div>
                                        <div className="key-meta-value">
                                            {k.lastVerifiedAt ? `Slot ${renderBN(k.lastVerifiedAt)}` : "Never"}
                                        </div>
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
                                                className="btn-sm warning"
                                                disabled={actionLoading}
                                                onClick={() => suspendKey(k)}
                                            >
                                                Suspend
                                            </button>
                                            <button
                                                className="btn-sm danger"
                                                disabled={actionLoading}
                                                onClick={() => revokeKey(k)}
                                            >
                                                Revoke
                                            </button>
                                        </>
                                    )}
                                    {st === "Suspended" && (
                                        <>
                                            <button
                                                className="btn-sm"
                                                style={{ border: "1px solid var(--success)", color: "var(--success)" }}
                                                disabled={actionLoading}
                                                onClick={() => reactivateKey(k)}
                                            >
                                                Reactivate
                                            </button>
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

            {/* Danger Zone */}
            <div style={{ marginTop: 60, borderTop: "1px solid var(--border)", paddingTop: 32, marginBottom: 40 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 12 }}>
                    Danger Zone
                </h3>
                <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 12, padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>Delete Project</div>
                        <div style={{ fontSize: 13, color: "var(--text3)" }}>Once you delete a project, all its API keys are revoked and accounts are closed. This action is permanent.</div>
                    </div>
                    <button
                        className="btn btn-danger"
                        disabled={actionLoading}
                        onClick={handleDeleteProject}
                    >
                        {actionLoading ? "Deleting..." : "Delete Project"}
                    </button>
                </div>

                {showForceDelete && (
                    <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "2px dashed rgba(239, 68, 68, 0.4)", borderRadius: 12, padding: 20, marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>Force Delete Required</div>
                            <div style={{ fontSize: 13, color: "var(--text3)" }}>Standard deletion failed. This usually means some API key records are out of sync. Force deleting will reclaim all project rent regardless of key states.</div>
                        </div>
                        <button
                            className="btn btn-danger"
                            style={{ background: "var(--danger)", color: "white" }}
                            disabled={actionLoading}
                            onClick={handleForceDelete}
                        >
                            {actionLoading ? "Processing..." : "FORCE DELETE"}
                        </button>
                    </div>
                )}
            </div>

            {/* Modals */}
            {showIssue && (
                <IssueKeyModal
                    projectPDA={projectPda}
                    currentKeyCount={project.totalKeys}
                    defaultRateLimit={project.defaultRateLimit}
                    onClose={() => setShowIssue(false)}
                    onSuccess={() => { load(); setShowIssue(false); }}
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
                    onSuccess={() => { load(); setShowRotate(null); }}
                />
            )}
            {showScopes && (
                <UpdateScopesModal
                    keyData={showScopes}
                    projectPDA={projectPda}
                    onClose={() => setShowScopes(null)}
                    onSuccess={() => { load(); setShowScopes(null); }}
                />
            )}
            {showRateLimit && (
                <UpdateRateLimitModal
                    keyData={showRateLimit}
                    projectPDA={projectPda}
                    onClose={() => setShowRateLimit(null)}
                    onSuccess={() => { load(); setShowRateLimit(null); }}
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
