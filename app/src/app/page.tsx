"use client";
import { ShaderAnimation } from "@/components/ui/shader-animation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import Link from "next/link";

const steps = [
    { num: "01", title: "Create API Key", desc: "Deploy a PDA-backed key with SHA-256 hash. Secret shown once." },
    { num: "02", title: "Enforce Limits", desc: "Rate limits and scopes enforced on-chain per slot window." },
    { num: "03", title: "Validate via Wallet", desc: "Verify keys with wallet signatures. No middleware needed." },
];

export default function HomePage() {
    const { publicKey } = useWallet();
    const router = useRouter();
    const prevKey = useRef(publicKey);

    // only redirect on fresh connect (null → connected), not on page revisit
    useEffect(() => {
        if (publicKey && !prevKey.current) {
            router.push("/dashboard");
        }
        prevKey.current = publicKey;
    }, [publicKey, router]);

    return (
        <div style={{ position: "relative", width: "100%", minHeight: "100vh", overflow: "hidden" }}>
            {/* Full-screen shader background */}
            <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
                <ShaderAnimation />
                <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.55)",
                    pointerEvents: "none",
                }} />
            </div>

            {/* Content */}
            <div style={{ position: "relative", zIndex: 1 }}>
                {/* Hero */}
                <section style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "80vh",
                    textAlign: "center",
                    padding: "120px 24px 60px",
                }}>
                    <div style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 14px",
                        borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--text3)",
                        letterSpacing: ".5px",
                        textTransform: "uppercase",
                        marginBottom: 32,
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                        Deployed on Solana Devnet
                    </div>

                    <h1 style={{
                        fontSize: "clamp(36px, 5vw, 64px)",
                        fontWeight: 800,
                        lineHeight: 1.1,
                        letterSpacing: "-2px",
                        fontFamily: "'Outfit', sans-serif",
                        color: "#f1f5f9",
                        marginBottom: 24,
                        maxWidth: 800,
                    }}>
                        Deterministic API Key <br /> State Machine on Solana
                    </h1>

                    <p style={{
                        fontSize: 18,
                        color: "var(--text2)",
                        maxWidth: 600,
                        lineHeight: 1.6,
                        marginBottom: 16,
                    }}>
                        Replaces traditional DB + Redis key infrastructure <br /> with deterministic, atomic on-chain state transitions.
                    </p>

                    <p style={{
                        fontSize: 14,
                        color: "var(--text3)",
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: "1px",
                        marginBottom: 48,
                        textTransform: "uppercase",
                        opacity: 0.8
                    }}>
                        No database. &nbsp; No Redis. &nbsp; No background workers.
                    </p>

                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
                        {publicKey ? (
                            <Link href="/dashboard" className="btn-landing" style={{
                                background: "rgba(16,185,129,0.15)",
                                borderColor: "rgba(16,185,129,0.3)",
                                color: "#10b981",
                            }}>
                                Interact →
                            </Link>
                        ) : (
                            <div className="wallet-btn-wrap">
                                <WalletMultiButton>Interact</WalletMultiButton>
                            </div>
                        )}
                        <a
                            href="https://github.com/Eniyanyosuva/ChainKey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-landing"
                        >
                            Source Code
                        </a>
                    </div>
                </section>

                {/* 3-step explanation */}
                <section id="how" style={{
                    maxWidth: 900,
                    margin: "0 auto",
                    padding: "0 24px 100px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: 20,
                }}>
                    {steps.map((s) => (
                        <div key={s.num} style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 12,
                            padding: "28px 24px",
                        }}>
                            <div style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "var(--text3)",
                                fontFamily: "'JetBrains Mono', monospace",
                                marginBottom: 12,
                                letterSpacing: "1px",
                            }}>
                                STEP {s.num}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
                                {s.title}
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.6 }}>
                                {s.desc}
                            </div>
                        </div>
                    ))}
                </section>
            </div>
        </div>
    );
}
