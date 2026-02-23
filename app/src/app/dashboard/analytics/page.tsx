"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { getProgram, fetchAllProjects, fetchAllKeysForProject, keyStatus } from "../../../utils/chainkey";
import { useNetwork } from "../../../context/NetworkContext";

export default function AnalyticsPage() {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const { network } = useNetwork();
    const [stats, setStats] = useState({
        projects: 0,
        totalKeys: 0,
        activeKeys: 0,
        revokedKeys: 0,
        totalUsage: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            if (!publicKey || !wallet) return;
            setLoading(true);
            try {
                const program = getProgram(wallet.adapter, connection);
                const projects = await fetchAllProjects(program, publicKey);

                const allKeysResults = await Promise.all(
                    projects.map(p => fetchAllKeysForProject(program, p.pda, p.keyCount || 0))
                );

                let totalKeys = 0;
                let activeKeys = 0;
                let revokedKeys = 0;
                let totalUsage = 0;

                for (const keys of allKeysResults) {
                    totalKeys += keys.length;
                    for (const k of keys) {
                        const s = keyStatus(k.status);
                        if (s === "Active") activeKeys++;
                        if (s === "Revoked") revokedKeys++;
                        totalUsage += k.totalVerifications ? k.totalVerifications.toNumber() : (k.usageCount || 0);
                    }
                }

                setStats({ projects: projects.length, totalKeys, activeKeys, revokedKeys, totalUsage });
            } catch (e) {
                console.error("Analytics fetch error:", e);
            }
            setLoading(false);
        })();
    }, [publicKey, wallet]);

    if (loading) {
        return (
            <div className="empty-state">
                <span className="spinner" style={{ width: 32, height: 32 }} />
            </div>
        );
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Analytics</h1>
            </div>

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Projects</div>
                    <div className="stat-value">{stats.projects}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Keys</div>
                    <div className="stat-value">{stats.totalKeys}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Active Keys</div>
                    <div className="stat-value" style={{ color: "#10b981" }}>{stats.activeKeys}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Revoked Keys</div>
                    <div className="stat-value" style={{ color: "#ef4444" }}>{stats.revokedKeys}</div>
                </div>
            </div>

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Verifications</div>
                    <div className="stat-value">{stats.totalUsage}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Network</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text1)" }}>{network.label}</span>
                    </div>
                </div>
            </div>

            <div style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                padding: 32,
                textAlign: "center",
                color: "var(--text3)",
                fontSize: 13,
                marginTop: 8,
            }}>
                Detailed usage charts and event history will be available once Solana event indexing is integrated.
            </div>
        </>
    );
}
