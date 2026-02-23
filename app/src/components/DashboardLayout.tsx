"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import { useNetwork, NETWORKS, NetworkId } from "../context/NetworkContext";

const navItems = [
    {
        href: "/dashboard",
        label: "Dashboard",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
        )
    },
    {
        href: "/dashboard/verify",
        label: "Verify",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
            </svg>
        )
    },
    {
        href: "/dashboard/analytics",
        label: "Analytics",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
        )
    },
    {
        href: "https://github.com/Eniyanyosuva/ChainKey",
        label: "Source Code",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
        ),
        external: true
    },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { publicKey } = useWallet();
    const { connection } = useConnection();
    const pathname = usePathname();
    const { network } = useNetwork();
    const [balance, setBalance] = useState<number | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!publicKey) { setBalance(null); return; }
        connection.getBalance(publicKey).then((b) => setBalance(b / LAMPORTS_PER_SOL));
        const id = connection.onAccountChange(publicKey, (acc) => setBalance(acc.lamports / LAMPORTS_PER_SOL));
        return () => { connection.removeAccountChangeListener(id); };
    }, [publicKey, connection]);

    useEffect(() => { setSidebarOpen(false); }, [pathname]);

    const addr = publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : "";

    return (
        <>


            <div className="dash-shell" style={{ position: "relative", zIndex: 1 }}>
                {sidebarOpen && (
                    <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
                )}

                <aside className={`dash-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
                    <Link href="/" className="dash-logo">
                        <span style={{
                            background: "var(--primary)",
                            padding: "6px",
                            borderRadius: "8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontSize: "14px"
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        </span>
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
                                    <span style={{ opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                                    {item.label}
                                </Tag>
                            );
                        })}
                    </nav>

                    <div className="dash-sidebar-footer">
                        <div style={{
                            fontSize: 10,
                            color: "var(--text3)",
                            marginBottom: 8,
                            letterSpacing: "0.5px",
                            fontWeight: 600
                        }}>NETWORK</div>
                        <div className="network-switcher">
                            <div className="network-option network-active" style={{ cursor: "default" }}>
                                <span
                                    className="network-dot"
                                    style={{ background: network.id === 'devnet' ? '#06b6d4' : network.color, color: network.id === 'devnet' ? '#06b6d4' : network.color }}
                                />
                                {network.label}
                            </div>
                        </div>
                    </div>
                </aside>

                <div className="dash-main">
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

                        <div /> {/* Spacer */}

                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {balance !== null && (
                                <div style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: 12,
                                    color: "var(--text2)",
                                    background: "rgba(255,255,255,0.04)",
                                    padding: "6px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}>
                                    <span style={{ color: "#fbbf24" }}>●</span>
                                    {balance.toFixed(3)} SOL
                                </div>
                            )}
                            {publicKey && (
                                <div style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: 12,
                                    color: "var(--text2)",
                                    background: "rgba(255,255,255,0.04)",
                                    padding: "6px 12px",
                                    borderRadius: "8px",
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

                    <div className="dash-content">
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
}
