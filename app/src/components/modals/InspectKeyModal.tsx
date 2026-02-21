"use client";

import StatusBadge from "../StatusBadge";
import { keyStatus, explorerLink, renderBN } from "../../utils/chainkey";

interface Props {
    keyData: any;
    onClose: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border2)", gap: 16 }}>
            <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px", flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: 13, color: "var(--text1)", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
        </div>
    );
}

export default function InspectKeyModal({ keyData, onClose }: Props) {
    const status = keyStatus(keyData.status);
    const hashHex = Buffer.from(keyData.keyHash).toString("hex");

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 540 }}>
                <div className="modal-header">
                    <div className="modal-title">🔎 Inspect Key</div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{keyData.name}</div>
                    <StatusBadge status={status} />
                </div>

                <Row label="Key Index" value={`#${keyData.index + 1}`} />
                <Row label="Address" value={<span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{keyData.pda.toBase58()}</span>} />
                <Row label="Key Hash (SHA-256)" value={<span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{hashHex.slice(0, 16)}...{hashHex.slice(-8)}</span>} />
                <Row label="Scopes" value={
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                        {keyData.scopes.length ? keyData.scopes.map((s: string) => (
                            <span className="scope-pill" key={s}>{s}</span>
                        )) : <span style={{ color: "var(--text3)" }}>None</span>}
                    </div>
                } />
                <Row label="Rate Limit" value={`${renderBN(keyData.rateLimit)} req / 24h`} />
                <Row label="Created (slot)" value={renderBN(keyData.createdAt)} />
                <Row label="Last Verified (slot)" value={renderBN(keyData.lastVerifiedAt)} />
                <Row label="Total Verifications" value={renderBN(keyData.totalVerifications)} />
                <Row label="Failed Attempts" value={renderBN(keyData.failedVerifications)} />
                {keyData.expiresAt && <Row label="Expires (slot)" value={renderBN(keyData.expiresAt)} />}

                {keyData.usage && (
                    <>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", margin: "16px 0 4px" }}>📊 Usage Window</div>
                        <Row label="Request Count" value={`${renderBN(keyData.usage.requestCount)} / ${renderBN(keyData.rateLimit)}`} />
                        <Row label="Window Start (slot)" value={renderBN(keyData.usage.windowStart)} />
                        <Row label="Last Used (slot)" value={renderBN(keyData.usage.lastUsedAt)} />
                    </>
                )}

                <div style={{ marginTop: 20 }}>
                    <button className="btn btn-outline" style={{ width: "100%" }} onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
