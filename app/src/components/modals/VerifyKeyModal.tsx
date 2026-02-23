"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { getProgram, verifyApiKey, sha256Browser, renderBN, SCOPE_READ, SCOPE_WRITE, SCOPE_ADMIN, SCOPE_NONE, handleTransactionError } from "../../utils/chainkey";
import { BN } from "@coral-xyz/anchor";

interface Props {
    keyData: any;
    onClose: () => void;
}

export default function VerifyKeyModal({ keyData, onClose }: Props) {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const [secret, setSecret] = useState("");
    const [scopeInput, setScopeInput] = useState("");
    const [dryRun, setDryRun] = useState(true);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; msg: string; type?: string; count?: number } | null>(null);

    const verify = async () => {
        if (!publicKey || !wallet) return;
        setLoading(true);
        setResult(null);
        try {
            const hash = await sha256Browser(secret.trim());
            const program = getProgram(wallet.adapter, connection);

            let requiredScope = SCOPE_NONE;
            if (scopeInput) {
                try {
                    requiredScope = scopeInput.startsWith("0x") ? new BN(scopeInput.slice(2), 16) : new BN(scopeInput);
                } catch {
                    // fallback to standard label check if user typed "READ"
                    const upper = scopeInput.trim().toUpperCase();
                    if (upper === "READ") requiredScope = SCOPE_READ;
                    else if (upper === "WRITE") requiredScope = SCOPE_WRITE;
                    else if (upper === "ADMIN") requiredScope = SCOPE_ADMIN;
                    else if (upper === "ALL") requiredScope = new BN("ffffffffffffffff", 16);
                }
            }

            const response = await verifyApiKey(program, publicKey, keyData.pda, hash, requiredScope, dryRun);

            let isValid = true;
            if (dryRun) {
                // Triple-Check for Success:
                // 1. Direct return value (Anchor 0.30+)
                // 2. Parsed events (Anchor coder)
                // 3. Raw logs (Universal fallback)
                const hasValue = response.value === true;
                const hasEvent = response.events?.some((e: any) => e.name === "ApiKeyVerified");
                const hasSuccessLog = response.logs?.some((l: string) =>
                    l.includes("ApiKeyVerified") ||
                    l.includes("Program return: 1") ||
                    l.includes("Program return: AQ==") // Base64 for 1 (true)
                );

                isValid = hasValue || hasEvent || hasSuccessLog;
            } else {
                // For RPC, we check if failedVerifications is 0 (it resets on success)
                const key = await (program.account as any).apiKey.fetch(keyData.pda);
                isValid = key.failedVerifications === 0;
            }

            if (!isValid) {
                setResult({ ok: false, msg: "Invalid key — hash mismatch or scope violation" });
                setLoading(false);
                return;
            }

            // Fetch updated usage
            let count: number | undefined;
            try {
                const usage = await (program.account as any).usageAccount.fetch(keyData.usagePDA);
                count = (usage.requestCount as any).toNumber?.() ?? usage.requestCount;
            } catch {
                count = 0;
            }
            setResult({
                ok: true,
                msg: dryRun ? "✓ VALID — Key hash matches (Dry Run)" : "✓ VERIFIED — Key is VALID",
                type: "success",
                count
            });
        } catch (e: any) {
            console.error("Verification failed:", e);
            const msg = e.message || "";
            // Anchor error codes: 6000 + enum index
            // InvalidKey is index 11 -> 6011
            // InsufficientScope is index 12 -> 6012
            // KeyNotActive is index 8 -> 6008
            // KeyExpired is index 10 -> 6010
            // RateLimitExceeded is index 13 -> 6013

            if (msg.includes("InvalidKey") || (e.code === 6011)) {
                setResult({ ok: false, msg: "Invalid key — hash mismatch" });
            } else if (msg.includes("InsufficientScope") || (e.code === 6012)) {
                setResult({ ok: false, msg: "Insufficient scope for this operation" });
            } else if (msg.includes("KeyNotActive") || (e.code === 6008)) {
                setResult({ ok: false, msg: "Key is not active (suspended or revoked)" });
            } else if (msg.includes("KeyExpired") || (e.code === 6010)) {
                setResult({ ok: false, msg: "Key has expired" });
            } else if (msg.includes("RateLimitExceeded") || (e.code === 6013)) {
                setResult({ ok: false, msg: "Rate limit exceeded" });
            } else {
                const err = handleTransactionError(e);
                setResult({ ok: false, msg: err.message, type: err.type });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-header">
                    <div className="modal-title">🔍 Verify Key</div>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
                    Key: <strong style={{ color: "var(--text1)" }}>{keyData.name}</strong> &nbsp;#{keyData.index + 1}
                </div>

                <div className="form-group">
                    <label className="form-label">Secret Key *</label>
                    <input
                        className="form-input"
                        type="password"
                        value={secret}
                        onChange={e => setSecret(e.target.value)}
                        placeholder="sk_abc123..."
                    />
                    <div className="form-hint">The raw secret (not the hash). It will be SHA-256 hashed in your browser.</div>
                </div>

                <div className="form-group">
                    <label className="form-label">Required Scope (bitmask/hex)</label>
                    <input
                        className="form-input"
                        value={scopeInput}
                        onChange={e => setScopeInput(e.target.value)}
                        placeholder="e.g. 0x01 (READ), 0x02 (WRITE), or index bit"
                    />
                    <div className="form-hint">Leave empty for basic verification. Hex (0x01) or Dec (1) supported.</div>
                </div>

                <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                    <input
                        type="checkbox"
                        id="dryRunToggle"
                        checked={dryRun}
                        onChange={e => setDryRun(e.target.checked)}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    <label htmlFor="dryRunToggle" style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text1)" }}>
                        Dry Run (FREE — uses simulation)
                    </label>
                </div>

                {result && (
                    <div className={`result-box ${result.type ? `result-${result.type}` : (result.ok ? "result-success" : "result-error")}`}>
                        <div className="result-title">{result.type === "warning" ? "Action Required" : result.msg}</div>
                        {result.type === "warning" && <div className="result-detail">{result.msg}</div>}
                        {result.count !== undefined && (
                            <div className="result-detail">Request count: {renderBN(result.count)} / {renderBN(keyData.rateLimit)} in window</div>
                        )}
                    </div>
                )}

                <div className="form-footer">
                    <button className="btn btn-outline" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" onClick={verify} disabled={loading || !secret}>
                        {loading ? <><span className="spinner" /> Verifying...</> : "Verify"}
                    </button>
                </div>
            </div>
        </div>
    );
}
