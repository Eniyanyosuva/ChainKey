"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getProgram, fetchAllProjects, renderBN } from "../../utils/chainkey";
import CreateProjectModal from "../../components/modals/CreateProjectModal";
import { useNetwork } from "../../context/NetworkContext";

export default function DashboardPage() {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const { network } = useNetwork();
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    const loadProjects = useCallback(async () => {
        if (!publicKey || !wallet) {
            setProjects([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const program = getProgram(wallet.adapter, connection);
            const data = await fetchAllProjects(program, publicKey);
            setProjects(data);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [publicKey, wallet, connection]);

    useEffect(() => { loadProjects(); }, [loadProjects]);

    const totalKeys = projects.reduce((sum, p) => sum + (p.keyCount || 0), 0);

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    + New Project
                </button>
            </div>

            {/* Stats */}
            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Projects</div>
                    <div className="stat-value">{projects.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Keys</div>
                    <div className="stat-value">{totalKeys}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Network</div>
                    <div className="stat-value" style={{ fontSize: 20 }}>{network.label}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Status</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: publicKey ? "#10b981" : "#64748b"
                        }} />
                        <span style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: publicKey ? "var(--text1)" : "var(--text3)"
                        }}>
                            {publicKey ? "Connected" : "Disconnected"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Project list */}
            <div style={{ marginBottom: 12 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 14 }}>
                    Projects
                </h2>
            </div>

            {loading ? (
                <div className="empty-state">
                    <span className="spinner" />
                </div>
            ) : projects.length === 0 ? (
                <div className="empty-state">
                    <p>No projects yet</p>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        Create Your First Project
                    </button>
                </div>
            ) : (
                <div className="key-grid">
                    {projects.map((p) => (
                        <Link
                            key={p.pda.toBase58()}
                            href={`/dashboard/${p.pda.toBase58()}`}
                            style={{ textDecoration: "none" }}
                        >
                            <div className="key-card">
                                <div className="key-card-info">
                                    <div className="key-card-name">{p.name}</div>
                                    <div className="key-card-addr">{p.description || "No description"}</div>
                                </div>
                                <div className="key-card-meta">
                                    <div className="key-meta-item">
                                        <div className="key-meta-label">Keys</div>
                                        <div className="key-meta-value">{renderBN(p.keyCount)}</div>
                                    </div>
                                    <div className="key-meta-item">
                                        <div className="key-meta-label">Rate Limit</div>
                                        <div className="key-meta-value">{renderBN(p.defaultRateLimit)}</div>
                                    </div>
                                </div>
                                <div style={{ color: "var(--text3)", fontSize: 18 }}>→</div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {showCreate && (
                <CreateProjectModal
                    onClose={() => setShowCreate(false)}
                    onSuccess={loadProjects}
                />
            )}
        </>
    );
}
