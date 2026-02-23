"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, verifyApiKey, sha256Browser, renderBN, handleTransactionError } from "../../../utils/chainkey";
import { useToast } from "../../../context/ToastContext";

export default function VerifyPage() {
    const { publicKey, wallet } = useWallet();
    const { connection } = useConnection();
    const { showToast } = useToast();

    const [keyPdaStr, setKeyPdaStr] = useState("");
    const [secret, setSecret] = useState("");
    const [scope, setScope] = useState("");
    const [dryRun, setDryRun] = useState(true);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; msg: string; type?: string; count?: number; rateLimit?: number } | null>(null);

    const handleVerify = async () => {
        if (!publicKey || !wallet) {
            showToast("Wallet required", "Please connect your wallet to verify keys on-chain.", "warning");
            return;
        }

        if (!keyPdaStr || !secret) {
            showToast("Missing information", "API Key Address and Secret Key are required.", "warning");
            return;
        }

        let keyPda: PublicKey;
        try {
            keyPda = new PublicKey(keyPdaStr.trim());
        } catch {
            showToast("Invalid Address", "The API Key Address provided is not a valid Solana public key.", "error");
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            const hash = await sha256Browser(secret.trim());
            const program = getProgram(wallet.adapter, connection);

            // Fetch key metadata first to get usage PDA and rate limit
            const keyAccount = await (program.account as any).apiKey.fetch(keyPda);
            const usagePda = PublicKey.findProgramAddressSync(
                [Buffer.from("usage"), keyPda.toBuffer()],
                program.programId
            )[0];

            const response = await verifyApiKey(program, publicKey, keyPda, hash, scope.trim() || null, dryRun);

            let isValid = true;
            if (dryRun) {
                const hasValue = response.value === true;
                const hasEvent = response.events?.some((e: any) => e.name === "ApiKeyVerified");
                const hasSuccessLog = response.logs?.some((l: string) =>
                    l.includes("ApiKeyVerified") ||
                    l.includes("Program return: 1") ||
                    l.includes("Program return: AQ==")
                );
                isValid = hasValue || hasEvent || hasSuccessLog;
            } else {
                // For RPC, transaction must succeed. 
                // We'll refetch account state to confirm it was valid (failedVerifications resets to 0)
                const updatedKey = await (program.account as any).apiKey.fetch(keyPda);
                isValid = updatedKey.failedVerifications === 0;
            }

            if (!isValid) {
                setResult({ ok: false, msg: "Invalid key — hash mismatch or scope violation" });
            } else {
                // Fetch usage
                let count = 0;
                try {
                    const usage = await (program.account as any).usageAccount.fetch(usagePda);
                    count = usage.requestCount.toNumber ? usage.requestCount.toNumber() : usage.requestCount;
                } catch { }

                setResult({
                    ok: true,
                    msg: dryRun ? "✓ VALID — Key hash matches (Dry Run)" : "✓ VERIFIED — Key is VALID",
                    type: "success",
                    count,
                    rateLimit: keyAccount.rateLimit
                });
            }
        } catch (e: any) {
            console.error("Verification failed:", e);
            const msg = e.message || "";
            // Anchor error codes for ApiKeyError:
            // 6008: KeyNotActive
            // 6010: KeyExpired
            // 6011: InvalidKey (HashMismatch)
            // 6012: InsufficientScope
            // 6013: RateLimitExceeded

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
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Key Verification Tool</h1>
                    <p style={{ fontSize: 13, color: "var(--text3)", marginTop: 4 }}>
                        Test any ChainKey API key on-chain. Simulation is free and does not affect usage counts.
                    </p>
                </div>
            </div>

            <div className="stat-card" style={{ padding: 32 }}>
                <div className="form-group">
                    <label className="form-label">API Key Address (PDA) *</label>
                    <input
                        className="form-input"
                        value={keyPdaStr}
                        onChange={e => setKeyPdaStr(e.target.value)}
                        placeholder="Enter the account address of the key"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Secret Key *</label>
                    <input
                        className="form-input"
                        type="password"
                        value={secret}
                        onChange={e => setSecret(e.target.value)}
                        placeholder="sk_..."
                    />
                    <div className="form-hint">Hashed locally in your browser. Never sent to an external server.</div>
                </div>

                <div className="form-group">
                    <label className="form-label">Scope (optional)</label>
                    <input
                        className="form-input"
                        value={scope}
                        onChange={e => setScope(e.target.value)}
                        placeholder="e.g. read:data"
                    />
                </div>

                <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
                    <input
                        type="checkbox"
                        id="dryRunTogglePage"
                        checked={dryRun}
                        onChange={e => setDryRun(e.target.checked)}
                        style={{ width: 18, height: 18, cursor: "pointer" }}
                    />
                    <div>
                        <label htmlFor="dryRunTogglePage" style={{ display: "block", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "var(--text1)" }}>
                            Dry Run (Free Simulation)
                        </label>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>Uses simulation to check validity without consuming rate limits.</span>
                    </div>
                </div>

                {result && (
                    <div className={`result-box ${result.type ? `result-${result.type}` : (result.ok ? "result-success" : "result-error")}`} style={{ marginBottom: 24 }}>
                        <div className="result-title">{result.msg}</div>
                        {result.count !== undefined && result.rateLimit !== undefined && (
                            <div className="result-detail">
                                Current Usage: <strong>{renderBN(result.count)} / {renderBN(result.rateLimit)}</strong> requests in window
                            </div>
                        )}
                    </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleVerify}
                        disabled={loading || !keyPdaStr || !secret}
                        style={{ minWidth: 160 }}
                    >
                        {loading ? <><span className="spinner" /> Processing...</> : (dryRun ? "Simulate Verification" : "Verify On-Chain")}
                    </button>
                </div>
            </div>

            <div style={{ marginTop: 40, padding: 24, background: "rgba(255,255,255,0.01)", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.1)" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text2)", marginBottom: 16 }}>How verification works:</h3>
                <ul style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.6, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 8 }}><strong>Local Hashing:</strong> Your secret is hashed using SHA-256 inside your browser using the Web Crypto API.</li>
                    <li style={{ marginBottom: 8 }}><strong>State Transition:</strong> The hash is submitted to the Solana program. If it matches the stored salt+hash, the state is updated atomically.</li>
                    <li style={{ marginBottom: 8 }}><strong>Sliding Window:</strong> Usage is tracked in a ~24h sliding window. Verification fails if the rate limit is exceeded.</li>
                    <li style={{ marginBottom: 0 }}><strong>Security:</strong> Failed attempts increment a counter. Too many failed attempts (10+) will automatically revoke the key.</li>
                </ul>
            </div>
        </div>
    );
}
