import { PublicKey, Connection } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor";
import { PROGRAM_ID, PROJECT_SEED, API_KEY_SEED, USAGE_SEED } from "./constants";
import IDL from "../idl/api_key_manager.json";

// ─── Constants ────────────────────────────────────────────────────────────────

export const SCOPE_NONE = new BN(0);
export const SCOPE_READ = new BN(1);
export const SCOPE_WRITE = new BN(2);
export const SCOPE_ADMIN = new BN(4);
export const SCOPE_ALL = new BN("ffffffffffffffff", 16);

export const SCOPE_LABELS: Record<string, BN> = {
    "READ": SCOPE_READ,
    "WRITE": SCOPE_WRITE,
    "ADMIN": SCOPE_ADMIN,
    "ALL": SCOPE_ALL
};

// ─── PDA Helpers ──────────────────────────────────────────────────────────────

export function getProjectPDA(authority: PublicKey, projectId: number[]): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [PROJECT_SEED, authority.toBuffer(), Buffer.from(projectId)],
        PROGRAM_ID
    );
    return pda;
}

export function getApiKeyPDA(project: PublicKey, keyIndex: number): PublicKey {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(keyIndex);
    const [pda] = PublicKey.findProgramAddressSync(
        [API_KEY_SEED, project.toBuffer(), buf],
        PROGRAM_ID
    );
    return pda;
}

export function getUsagePDA(apiKey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [USAGE_SEED, apiKey.toBuffer()],
        PROGRAM_ID
    );
    return pda;
}

// ─── Crypto ───────────────────────────────────────────────────────────────────

export async function sha256Browser(input: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(hashBuffer);
}

export function generateSecret(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return "sk_" + btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function randomProjectId(): number[] {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes);
}

export function renderBN(val: any): string {
    if (val === null || val === undefined) return "—";
    try {
        if (val.toString) {
            // If it's a very large number (like a bitmask or timestamp), toString() is safer than toNumber()
            const s = val.toString();
            if (s.length > 10) return "0x" + val.toString(16);
            return Number(s).toLocaleString();
        }
        return Number(val).toLocaleString();
    } catch {
        return "—";
    }
}

export function renderScopes(scopes: BN): string {
    if (scopes.eq(SCOPE_NONE)) return "None";
    if (scopes.eq(SCOPE_ALL)) return "All (*)";

    const matched: string[] = [];
    if (scopes.and(SCOPE_READ).gt(SCOPE_NONE)) matched.push("READ");
    if (scopes.and(SCOPE_WRITE).gt(SCOPE_NONE)) matched.push("WRITE");
    if (scopes.and(SCOPE_ADMIN).gt(SCOPE_NONE)) matched.push("ADMIN");

    if (matched.length === 0) return "0x" + scopes.toString(16);
    return matched.join(", ");
}

// ─── Program factory ──────────────────────────────────────────────────────────
let _programCache: any = null;
let _lastWallet: string | null = null;
let _lastRpcs: string | null = null;

export function getProgram(wallet: any, connection: Connection): any {
    if (!wallet) return null;
    const walletAddr = wallet.publicKey?.toBase58();
    const rpc = connection.rpcEndpoint;

    if (_programCache && _lastWallet === walletAddr && _lastRpcs === rpc) {
        return _programCache;
    }

    const provider = new AnchorProvider(connection, wallet as Wallet, {
        commitment: "confirmed",
    });
    _programCache = new Program(IDL as any, provider);
    _lastWallet = walletAddr;
    _lastRpcs = rpc;
    return _programCache;
}

// ─── Instructions ─────────────────────────────────────────────────────────────

export async function createProject(
    program: any,
    wallet: PublicKey,
    projectId: number[],
    name: string,
    description: string,
    defaultRateLimit: number
): Promise<{ sig: string; projectPDA: PublicKey }> {
    const projectPDA = getProjectPDA(wallet, projectId);
    const sig = await program.methods
        .createProject(projectId, name, description, defaultRateLimit)
        .accountsPartial({ project: projectPDA, authority: wallet })
        .rpc();
    return { sig, projectPDA };
}

export async function issueApiKey(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    keyIndex: number,
    name: string,
    keyHash: Uint8Array,
    scopes: BN,
    expiresAt: number | null,
    rateLimitOverride: number | null
): Promise<{ sig: string; apiKeyPDA: PublicKey }> {
    const apiKeyPDA = getApiKeyPDA(projectPDA, keyIndex);
    const usagePDA = getUsagePDA(apiKeyPDA);
    const sig = await program.methods
        .issueApiKey(
            keyIndex,
            name,
            keyHash,
            scopes,
            expiresAt ? new BN(expiresAt) : null,
            rateLimitOverride ?? null
        )
        .accounts({
            project: projectPDA,
            apiKey: apiKeyPDA,
            usage: usagePDA,
            authority: wallet,
        })
        .rpc();
    return { sig, apiKeyPDA };
}

export async function verifyApiKey(
    program: any,
    wallet: PublicKey,
    apiKeyPDA: PublicKey,
    presentedHash: Uint8Array,
    requiredScope: BN,
    simulate: boolean = false
): Promise<any> {
    const usagePDA = getUsagePDA(apiKeyPDA);
    const method = program.methods
        .verifyApiKey(presentedHash, requiredScope)
        .accounts({ apiKey: apiKeyPDA, usage: usagePDA, verifier: wallet });

    if (simulate) {
        return method.simulate();
    }
    return method.rpc();
}

export async function rotateApiKey(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    apiKeyPDA: PublicKey,
    newKeyHash: Uint8Array
): Promise<string> {
    return program.methods
        .rotateApiKey(newKeyHash, SCOPE_NONE)
        .accounts({ project: projectPDA, apiKey: apiKeyPDA, authority: wallet })
        .rpc();
}

export async function revokeApiKey(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    apiKeyPDA: PublicKey
): Promise<string> {
    return program.methods
        .revokeApiKey()
        .accounts({ project: projectPDA, apiKey: apiKeyPDA, authority: wallet })
        .rpc();
}

export async function suspendApiKey(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    apiKeyPDA: PublicKey
): Promise<string> {
    return program.methods
        .suspendApiKey()
        .accounts({ project: projectPDA, apiKey: apiKeyPDA, authority: wallet })
        .rpc();
}

export async function reactivateApiKey(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    apiKeyPDA: PublicKey
): Promise<string> {
    return program.methods
        .reactivateApiKey()
        .accounts({ project: projectPDA, apiKey: apiKeyPDA, authority: wallet })
        .rpc();
}

export async function updateScopes(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    apiKeyPDA: PublicKey,
    newScopes: BN
): Promise<string> {
    return program.methods
        .updateScopes(newScopes)
        .accounts({ project: projectPDA, apiKey: apiKeyPDA, authority: wallet })
        .rpc();
}

export async function updateRateLimit(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    apiKeyPDA: PublicKey,
    newRateLimit: number
): Promise<string> {
    return program.methods
        .updateRateLimit(newRateLimit)
        .accounts({ project: projectPDA, apiKey: apiKeyPDA, authority: wallet })
        .rpc();
}

export async function closeUsageAccount(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    apiKeyPDA: PublicKey
): Promise<string> {
    return program.methods
        .closeUsageAccount()
        .accounts({
            project: projectPDA,
            apiKey: apiKeyPDA,
            usage: getUsagePDA(apiKeyPDA),
            authority: wallet
        })
        .rpc();
}

export async function closeApiKey(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    apiKeyPDA: PublicKey
): Promise<string> {
    return program.methods
        .closeApiKey()
        .accounts({ project: projectPDA, apiKey: apiKeyPDA, authority: wallet })
        .rpc();
}

export async function closeProject(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey
): Promise<string> {
    return program.methods
        .closeProject()
        .accounts({ project: projectPDA, authority: wallet })
        .rpc();
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchAllKeysForProject(
    program: any,
    projectPDA: PublicKey,
    _totalKeys: number // kept for signature compatibility
): Promise<any[]> {
    try {
        // Fetch all API keys for this project using memcmp filter
        // The project field starts at offset 8 (after discriminator)
        const allKeys = await program.account.apiKey.all([
            { memcmp: { offset: 8, bytes: projectPDA.toBase58() } },
        ]);

        // Fetch usage accounts in parallel for better performance
        const keysWithUsage = await Promise.all(
            allKeys.map(async (a: any) => {
                const apiKeyPDA = a.publicKey;
                const usagePDA = getUsagePDA(apiKeyPDA);
                let usage = null;
                try {
                    usage = await (program.account as any).usageAccount.fetch(usagePDA);
                } catch {
                    // Usage account might not exist yet
                }
                return {
                    ...a.account,
                    pda: apiKeyPDA,
                    usagePDA,
                    usage,
                    index: a.account.keyIndex
                };
            })
        );

        // Sort by index
        return keysWithUsage.sort((a, b) => a.index - b.index);
    } catch (e) {
        console.error("fetchAllKeysForProject error:", e);
        return [];
    }
}

export async function fetchAllProjects(
    program: any,
    authority: PublicKey
): Promise<any[]> {
    try {
        const allAccounts = await program.account.project.all([
            { memcmp: { offset: 8, bytes: authority.toBase58() } },
        ]);
        return allAccounts.map((a: any) => ({
            ...a.account,
            pda: a.publicKey,
            keyCount: a.account.totalKeys || 0,
        }));
    } catch (e) {
        console.error("fetchAllProjects error:", e);
        return [];
    }
}

export function explorerLink(sig: string, suffix = "?cluster=devnet") {
    return `https://explorer.solana.com/tx/${sig}${suffix}`;
}

export function keyStatus(status: any): "Active" | "Suspended" | "Revoked" {
    if (status?.active !== undefined) return "Active";
    if (status?.suspended !== undefined) return "Suspended";
    return "Revoked";
}

export function handleTransactionError(e: any): { title: string; message: string; type: "error" | "warning" } {
    console.error("Transaction error:", e);
    const msg = e.message || String(e);

    if (msg.includes("Attempt to debit an account but found no record of a prior credit")) {
        return {
            title: "Action Required",
            message: "Insufficient SOL in wallet. Please add some SOL to continue.",
            type: "warning"
        };
    }
    if (msg.includes("User rejected the request")) {
        return {
            title: "Cancelled",
            message: "Transaction cancelled by user.",
            type: "warning"
        };
    }
    if (msg.includes("Account already in use")) {
        return {
            title: "Error",
            message: "This account is already initialized.",
            type: "error"
        };
    }
    if (msg.includes("Transaction simulation failed") || msg.includes("Blockhash not found")) {
        // Broad check for network mismatch: if the simulation fails and logs are empty, 
        // or if it explicitly mentions "Node is on a different network" (some RPCs do this)
        if (msg.includes("different network") || !e.logs || e.logs.length === 0) {
            return {
                title: "Network Mismatch",
                message: "Please ensure your wallet is set to Solana Devnet and try again.",
                type: "warning"
            };
        }
        return {
            title: "Simulation Failed",
            message: "Transaction simulation failed. Check console for logs.",
            type: "error"
        };
    }

    return {
        title: "Error",
        message: msg,
        type: "error"
    };
}
