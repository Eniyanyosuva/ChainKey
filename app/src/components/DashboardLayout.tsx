"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ShaderAnimation } from "@/components/ui/shader-animation";
import { useNetwork, NETWORKS, NetworkId } from "../context/NetworkContext";

const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "⊞" },
    { href: "/dashboard/analytics", label: "Analytics", icon: "◎" },
    { href: "https://github.com/Eniyanyosuva/ChainKey", label: "Docs", icon: "◬", external: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { publicKey } = useWallet();
    const { connection } = useConnection();
    const pathname = usePathname();
    const { network, setNetwork } = useNetwork();
    const [balance, setBalance] = useState<number | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!publicKey) { setBalance(null); return; }
        connection.getBalance(publicKey).then((b) => setBalance(b / LAMPORTS_PER_SOL));
        const id = connection.onAccountChange(publicKey, (acc) => setBalance(acc.lamports / LAMPORTS_PER_SOL));
        return () => { connection.removeAccountChangeListener(id); };
    }, [publicKey, connection]);

    // Close sidebar on route change
    useEffect(() => { setSidebarOpen(false); }, [pathname]);

    const addr = publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : "";

    return (
        <>
            {/* Shader background */}
            <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
                <ShaderAnimation />
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", pointerEvents: "none" }} />
            </div>

            <div className="dash-shell" style={{ position: "relative", zIndex: 1 }}>
                {/* Sidebar overlay */}
                {sidebarOpen && (
                    <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
                )}

                {/* Sidebar */}
                <aside className={`dash-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
                    <Link href="/" style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "0 20px 16px",
                        marginBottom: 8,
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        textDecoration: "none",
                        color: "#f1f5f9",
                        fontSize: 15,
                        fontWeight: 700,
                        letterSpacing: "-0.3px",
                    }}>
                        <span style={{ fontSize: 18 }}>🔑</span>
                        ChainKey
                    </Link>

                    <nav className="dash-nav">
                        {navItems.map((item) => {
                            const active = !item.external && (
                                item.href === "/dashboard"
                                    ? pathname === "/dashboard"
                                    : pathname.startsWith(item.href)
                            );
                            const Tag = item.external ? "a" : Link;
                            const extra = item.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
                            return (
                                <Tag
                                    key={item.href}
                                    href={item.href}
                                    className={`dash-nav-item ${active ? "active" : ""}`}
                                    {...extra}
                                >
                                    <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{item.icon}</span>
                                    {item.label}
                                </Tag>
                            );
                        })}
                    </nav>

                    <div className="dash-sidebar-footer">
                        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>NETWORK</div>
                        <div className="network-switcher">
                            {(Object.keys(NETWORKS) as NetworkId[]).map((id) => {
                                const net = NETWORKS[id];
                                const isActive = network.id === id;
                                return (
                                    <button
                                        key={id}
                                        className={`network-option ${isActive ? "network-active" : ""}`}
                                        onClick={() => setNetwork(id)}
                                    >
                                        <span
                                            className="network-dot"
                                            style={{ background: net.color }}
                                        />
                                        {net.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </aside>

                {/* Main area */}
                <div className="dash-main">
                    {/* Top bar */}
                    <header className="dash-topbar">
                        <button
                            className="sidebar-toggle"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label="Toggle sidebar"
                        >
                            <span />
                            <span />
                            <span />
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            {balance !== null && (
                                <div style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: 12,
                                    color: "var(--text2)",
                                    background: "rgba(255,255,255,0.04)",
                                    padding: "5px 10px",
                                    borderRadius: 6,
                                    border: "1px solid rgba(255,255,255,0.06)",
                                }}>
                                    {balance.toFixed(3)} SOL
                                </div>
                            )}
                            {publicKey && (
                                <div style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: 12,
                                    color: "var(--text2)",
                                    background: "rgba(255,255,255,0.04)",
                                    padding: "5px 10px",
                                    borderRadius: 6,
                                    border: "1px solid rgba(255,255,255,0.06)",
                                }}>
                                    {addr}
                                </div>
                            )}
                            <div className="wallet-btn-wrap">
                                <WalletMultiButton />
                            </div>
                        </div>
                    </header>

                    {/* Page content */}
                    <div className="dash-content">
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
}
