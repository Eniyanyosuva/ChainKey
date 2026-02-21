import { PublicKey, Connection } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor";
import { PROGRAM_ID, PROJECT_SEED, API_KEY_SEED, USAGE_SEED } from "./constants";
import IDL from "../idl/api_key_manager.json";

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

export async function sha256Browser(input: string): Promise<number[]> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer));
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
    const num = val.toNumber ? val.toNumber() : Number(val);
    return num.toLocaleString();
}

// ─── Program factory ──────────────────────────────────────────────────────────

export function getProgram(wallet: any, connection: Connection) {
    const provider = new AnchorProvider(connection, wallet as Wallet, {
        commitment: "confirmed",
    });
    return new Program(IDL as any, provider);
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
    keyHash: number[],
    scopes: string[],
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
    presentedHash: number[],
    requiredScope: string | null
): Promise<string> {
    const usagePDA = getUsagePDA(apiKeyPDA);
    return program.methods
        .verifyApiKey(presentedHash, requiredScope)
        .accounts({ apiKey: apiKeyPDA, usage: usagePDA, verifier: wallet })
        .rpc();
}

export async function rotateApiKey(
    program: any,
    wallet: PublicKey,
    projectPDA: PublicKey,
    apiKeyPDA: PublicKey,
    newKeyHash: number[]
): Promise<string> {
    return program.methods
        .rotateApiKey(newKeyHash, null)
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
    newScopes: string[]
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

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchAllKeysForProject(
    program: any,
    projectPDA: PublicKey,
    totalKeys: number
): Promise<any[]> {
    const keys = [];
    for (let i = 0; i < totalKeys; i++) {
        const apiKeyPDA = getApiKeyPDA(projectPDA, i);
        const usagePDA = getUsagePDA(apiKeyPDA);
        try {
            const key = await program.account.apiKey.fetch(apiKeyPDA);
            let usage = null;
            try { usage = await (program.account as any).usageAccount.fetch(usagePDA); } catch { }
            keys.push({ ...key, pda: apiKeyPDA, usagePDA, usage, index: i });
        } catch { }
    }
    return keys;
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
