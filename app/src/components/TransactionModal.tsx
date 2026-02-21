"use client";

import { explorerLink } from "../utils/chainkey";

interface TransactionModalProps {
    status: "pending" | "confirmed" | "failed";
    signature?: string;
    errorMsg?: string;
    suffix?: string;
    onClose: () => void;
}

export default function TransactionModal({ status, signature, errorMsg, suffix, onClose }: TransactionModalProps) {
    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && status !== "pending" && onClose()}>
            <div className="modal" style={{ maxWidth: 420, textAlign: "center" }}>
                {status === "pending" && (
                    <>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>
                            <span className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text1)", marginBottom: 8 }}>
                            Confirming Transaction
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text3)" }}>
                            Waiting for Solana confirmation...
                        </div>
                    </>
                )}

                {status === "confirmed" && (
                    <>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#10b981", marginBottom: 8 }}>
                            Transaction Confirmed
                        </div>
                        {signature && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>
                                    Signature
                                </div>
                                <div style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: 11,
                                    color: "var(--text2)",
                                    background: "rgba(255,255,255,0.03)",
                                    borderRadius: 6,
                                    padding: "8px 12px",
                                    wordBreak: "break-all",
                                    marginBottom: 12,
                                }}>
                                    {signature}
                                </div>
                                <a
                                    href={explorerLink(signature, suffix)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        fontSize: 13,
                                        color: "#8b5cf6",
                                        textDecoration: "none",
                                    }}
                                >
                                    View on Solana Explorer ↗
                                </a>
                            </div>
                        )}
                        <button className="btn btn-outline" style={{ marginTop: 20, width: "100%" }} onClick={onClose}>
                            Close
                        </button>
                    </>
                )}

                {status === "failed" && (
                    <>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>✕</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444", marginBottom: 8 }}>
                            Transaction Failed
                        </div>
                        <div style={{
                            fontSize: 13,
                            color: "var(--text3)",
                            background: "rgba(239,68,68,0.06)",
                            borderRadius: 8,
                            padding: "10px 14px",
                            marginTop: 12,
                            wordBreak: "break-all",
                        }}>
                            {errorMsg || "Unknown error"}
                        </div>
                        <button className="btn btn-outline" style={{ marginTop: 20, width: "100%" }} onClick={onClose}>
                            Close
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
