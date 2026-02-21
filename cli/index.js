#!/usr/bin/env node

const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const { createHash, randomBytes } = require("crypto");
const fs   = require("fs");
const path = require("path");

// ─── Config ───────────────────────────────────────────────────────────────────

const DEVNET_RPC  = "https://api.devnet.solana.com";
const PROGRAM_ID  = new PublicKey("B15uspHWgwuLzJhB8sJU3vS9j88sLoB5Uwbfu7q82isR");
const PROJECT_SEED = Buffer.from("project");
const API_KEY_SEED = Buffer.from("api_key");
const USAGE_SEED   = Buffer.from("usage");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(input) {
  return Array.from(createHash("sha256").update(input).digest());
}

function generateSecret() {
  return "sk_" + randomBytes(24).toString("base64url");
}

function loadWallet(keyPath) {
  const p = keyPath || path.join(process.env.HOME, ".config/solana/id.json");
  const resolved = p.startsWith("~")
    ? path.join(process.env.HOME, p.slice(2))
    : p;
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(resolved, "utf-8")))
  );
}

function getProjectPDA(authority, projectId) {
  const [pda] = PublicKey.findProgramAddressSync(
    [PROJECT_SEED, authority.toBuffer(), Buffer.from(projectId)],
    PROGRAM_ID
  );
  return pda;
}

function getApiKeyPDA(project, keyIndex) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(keyIndex);
  const [pda] = PublicKey.findProgramAddressSync(
    [API_KEY_SEED, project.toBuffer(), buf],
    PROGRAM_ID
  );
  return pda;
}

function getUsagePDA(apiKey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [USAGE_SEED, apiKey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function explorerLink(sig) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function log(label, value) {
  console.log(label.padEnd(26) + value);
}

function divider() {
  console.log("─".repeat(64));
}

async function getProgram(walletPath) {
  const wallet     = loadWallet(walletPath);
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const provider   = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );

  // Try both possible IDL locations
  const idlPaths = [
    path.join(__dirname, "../target/idl/api_key_manager.json"),
    path.join(__dirname, "../target/idl/chain_key.json"),
    path.join(__dirname, "../target/idl/chainkey.json"),
  ];

  let idl = null;
  for (const p of idlPaths) {
    if (fs.existsSync(p)) {
      idl = JSON.parse(fs.readFileSync(p, "utf-8"));
      break;
    }
  }

  if (!idl) {
    // List what's actually in target/idl
    const idlDir = path.join(__dirname, "../target/idl");
    if (fs.existsSync(idlDir)) {
      const files = fs.readdirSync(idlDir);
      console.error("IDL not found. Files in target/idl:", files);
    } else {
      console.error("target/idl directory not found — run: anchor build");
    }
    process.exit(1);
  }

  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  return { program, wallet, connection };
}

function getArg(args, ...flags) {
  for (const flag of flags) {
    const i = args.indexOf(flag);
    if (i !== -1 && args[i + 1]) return args[i + 1];
  }
  return null;
}

function hasFlag(args, ...flags) {
  return flags.some(f => args.includes(f));
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function createProject(args) {
  const name        = getArg(args, "--name", "-n");
  const description = getArg(args, "--description", "-d") || "";
  const rateLimit   = parseInt(getArg(args, "--rate-limit", "-r") || "1000");
  const walletPath  = getArg(args, "--wallet", "-w");

  if (!name) { console.error("Error: --name is required"); process.exit(1); }

  const { program, wallet } = await getProgram(walletPath);
  const projectId  = Array.from(randomBytes(16));
  const projectPDA = getProjectPDA(wallet.publicKey, projectId);

  console.log("\nCreating project on Devnet...\n");

  const sig = await program.methods
    .createProject(
      projectId,
      name,
      description,
      rateLimit
    )
    .accountsPartial({
      project: projectPDA,
      authority: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✓ Project Created!\n");
  divider();
  log("Project Address:",  projectPDA.toBase58());
  log("Project ID (hex):", Buffer.from(projectId).toString("hex"));
  log("Name:",             name);
  log("Rate Limit:",       rateLimit + " req/24h");
  log("Authority:",        wallet.publicKey.toBase58());
  log("Explorer:",         explorerLink(sig));
  divider();
  console.log("\n💾 Save your Project ID:\n");
  console.log("   " + Buffer.from(projectId).toString("hex") + "\n");
}

async function issueKey(args) {
  const projectIdHex = getArg(args, "--project-id", "-p");
  const name         = getArg(args, "--name", "-n");
  const scopesRaw    = getArg(args, "--scopes", "-s") || "read:data";
  const rateOverride = getArg(args, "--rate-limit", "-r");
  const expirySlots  = getArg(args, "--expires-slots", "-e");
  const walletPath   = getArg(args, "--wallet", "-w");

  if (!projectIdHex) { console.error("Error: --project-id is required"); process.exit(1); }
  if (!name)         { console.error("Error: --name is required");        process.exit(1); }

  const { program, wallet, connection } = await getProgram(walletPath);
  const projectId  = Array.from(Buffer.from(projectIdHex, "hex"));
  const projectPDA = getProjectPDA(wallet.publicKey, projectId);
  const project    = await program.account.project.fetch(projectPDA);
  const keyIndex   = project.totalKeys;
  const apiKeyPDA  = getApiKeyPDA(projectPDA, keyIndex);
  const usagePDA   = getUsagePDA(apiKeyPDA);
  const rawSecret  = generateSecret();
  const keyHash    = sha256(rawSecret);
  const scopes     = scopesRaw.split(",").map(s => s.trim());

  let expiresAt = null;
  if (expirySlots) {
    const slot = await connection.getSlot();
    expiresAt  = new anchor.BN(slot + parseInt(expirySlots));
  }

  console.log("\nIssuing API key on Devnet...\n");

  const sig = await program.methods
    .issueApiKey(
      keyIndex,
      name,
      keyHash,
      scopes,
      expiresAt ? { some: expiresAt } : null,
      rateOverride ? parseInt(rateOverride) : null
    )
    .accounts({
      project: projectPDA,
      apiKey:  apiKeyPDA,
      usage:   usagePDA,
      authority: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("⚠  COPY YOUR SECRET NOW — NEVER STORED ON-CHAIN\n");
  divider();
  log("Secret Key:",      rawSecret);
  divider();
  log("Key Address:",     apiKeyPDA.toBase58());
  log("Key Index:",       keyIndex.toString());
  log("Name:",            name);
  log("Scopes:",          scopes.join(", "));
  log("Rate Limit:",      (rateOverride || project.defaultRateLimit) + " req/24h");
  log("Explorer:",        explorerLink(sig));
  divider();
  console.log(`\nTo verify: node cli/index.js verify --project-id ${projectIdHex} --key-index ${keyIndex} --secret ${rawSecret}\n`);
}

async function verifyKey(args) {
  const projectIdHex = getArg(args, "--project-id", "-p");
  const keyIndex     = parseInt(getArg(args, "--key-index", "-k") || "0");
  const secret       = getArg(args, "--secret", "-s");
  const scope        = getArg(args, "--scope");
  const walletPath   = getArg(args, "--wallet", "-w");

  if (!projectIdHex) { console.error("Error: --project-id is required"); process.exit(1); }
  if (!secret)       { console.error("Error: --secret is required");      process.exit(1); }

  const { program, wallet } = await getProgram(walletPath);
  const projectId  = Array.from(Buffer.from(projectIdHex, "hex"));
  const projectPDA = getProjectPDA(wallet.publicKey, projectId);
  const apiKeyPDA  = getApiKeyPDA(projectPDA, keyIndex);
  const usagePDA   = getUsagePDA(apiKeyPDA);
  const hash       = sha256(secret);

  console.log("\nVerifying key on Devnet...\n");

  const sig = await program.methods
    .verifyApiKey(hash, scope || null)
    .accounts({
      apiKey:   apiKeyPDA,
      usage:    usagePDA,
      verifier: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const usage = await program.account.usageAccount.fetch(usagePDA);
  const key   = await program.account.apiKey.fetch(apiKeyPDA);

  console.log("✓ VERIFIED — Key is VALID\n");
  divider();
  log("Key Name:",    key.name);
  log("Requests:",    usage.requestCount + " / " + key.rateLimit + " in window");
  log("Remaining:",   (key.rateLimit - usage.requestCount) + " requests left");
  log("Scopes:",      key.scopes.join(", "));
  log("Explorer:",    explorerLink(sig));
  divider();
}

async function rotateKey(args) {
  const projectIdHex = getArg(args, "--project-id", "-p");
  const keyIndex     = parseInt(getArg(args, "--key-index", "-k") || "0");
  const walletPath   = getArg(args, "--wallet", "-w");

  if (!projectIdHex) { console.error("Error: --project-id is required"); process.exit(1); }

  const { program, wallet } = await getProgram(walletPath);
  const projectId  = Array.from(Buffer.from(projectIdHex, "hex"));
  const projectPDA = getProjectPDA(wallet.publicKey, projectId);
  const apiKeyPDA  = getApiKeyPDA(projectPDA, keyIndex);
  const newSecret  = generateSecret();
  const newHash    = sha256(newSecret);

  console.log("\nRotating key on Devnet...\n");

  const sig = await program.methods
    .rotateApiKey(newHash, null)
    .accounts({
      project:   projectPDA,
      apiKey:    apiKeyPDA,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log("✓ Key Rotated — old secret is now invalid\n");
  divider();
  log("New Secret:", newSecret);
  log("Explorer:",   explorerLink(sig));
  divider();
  console.log("\n⚠  Save your new secret — it cannot be recovered!\n");
}

async function revokeKey(args) {
  const projectIdHex = getArg(args, "--project-id", "-p");
  const keyIndex     = parseInt(getArg(args, "--key-index", "-k") || "0");
  const walletPath   = getArg(args, "--wallet", "-w");

  if (!projectIdHex) { console.error("Error: --project-id is required"); process.exit(1); }

  const { program, wallet } = await getProgram(walletPath);
  const projectId  = Array.from(Buffer.from(projectIdHex, "hex"));
  const projectPDA = getProjectPDA(wallet.publicKey, projectId);
  const apiKeyPDA  = getApiKeyPDA(projectPDA, keyIndex);

  console.log("\nRevoking key on Devnet...\n");

  const sig = await program.methods
    .revokeApiKey()
    .accounts({
      project:   projectPDA,
      apiKey:    apiKeyPDA,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log("✓ Key permanently revoked\n");
  divider();
  log("Explorer:", explorerLink(sig));
  divider();
}

async function suspendKey(args) {
  const projectIdHex = getArg(args, "--project-id", "-p");
  const keyIndex     = parseInt(getArg(args, "--key-index", "-k") || "0");
  const walletPath   = getArg(args, "--wallet", "-w");

  if (!projectIdHex) { console.error("Error: --project-id is required"); process.exit(1); }

  const { program, wallet } = await getProgram(walletPath);
  const projectId  = Array.from(Buffer.from(projectIdHex, "hex"));
  const projectPDA = getProjectPDA(wallet.publicKey, projectId);
  const apiKeyPDA  = getApiKeyPDA(projectPDA, keyIndex);

  const sig = await program.methods
    .suspendApiKey()
    .accounts({
      project:   projectPDA,
      apiKey:    apiKeyPDA,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log("\n✓ Key suspended\n");
  log("Explorer:", explorerLink(sig));
}

async function reactivateKey(args) {
  const projectIdHex = getArg(args, "--project-id", "-p");
  const keyIndex     = parseInt(getArg(args, "--key-index", "-k") || "0");
  const walletPath   = getArg(args, "--wallet", "-w");

  if (!projectIdHex) { console.error("Error: --project-id is required"); process.exit(1); }

  const { program, wallet } = await getProgram(walletPath);
  const projectId  = Array.from(Buffer.from(projectIdHex, "hex"));
  const projectPDA = getProjectPDA(wallet.publicKey, projectId);
  const apiKeyPDA  = getApiKeyPDA(projectPDA, keyIndex);

  const sig = await program.methods
    .reactivateApiKey()
    .accounts({
      project:   projectPDA,
      apiKey:    apiKeyPDA,
      authority: wallet.publicKey,
    })
    .rpc();

  console.log("\n✓ Key reactivated\n");
  log("Explorer:", explorerLink(sig));
}

async function inspectAccount(args) {
  const type         = args[0];
  const projectIdHex = getArg(args, "--project-id", "-p");
  const keyIndex     = parseInt(getArg(args, "--key-index", "-k") || "0");
  const walletPath   = getArg(args, "--wallet", "-w");

  if (!projectIdHex) { console.error("Error: --project-id is required"); process.exit(1); }

  const { program, wallet } = await getProgram(walletPath);
  const projectId  = Array.from(Buffer.from(projectIdHex, "hex"));
  const projectPDA = getProjectPDA(wallet.publicKey, projectId);

  if (type === "project") {
    const p = await program.account.project.fetch(projectPDA);
    console.log("\n── Project Account ──\n");
    log("Address:",      projectPDA.toBase58());
    log("Name:",         p.name);
    log("Description:",  p.description);
    log("Authority:",    p.authority.toBase58());
    log("Rate Limit:",   p.defaultRateLimit.toString());
    log("Total Keys:",   p.totalKeys.toString());
    log("Active Keys:",  p.activeKeys.toString());
    log("Created Slot:", p.createdAt.toString());
    console.log("");
  } else if (type === "key") {
    const apiKeyPDA = getApiKeyPDA(projectPDA, keyIndex);
    const usagePDA  = getUsagePDA(apiKeyPDA);
    const k = await program.account.apiKey.fetch(apiKeyPDA);
    let usage = null;
    try { usage = await program.account.usageAccount.fetch(usagePDA); } catch {}

    const status = Object.keys(k.status)[0].toUpperCase();

    console.log("\n── API Key Account ──\n");
    log("Address:",            apiKeyPDA.toBase58());
    log("Name:",               k.name);
    log("Status:",             status);
    log("Scopes:",             k.scopes.join(", "));
    log("Rate Limit:",         k.rateLimit.toString());
    log("Key Hash (partial):", Buffer.from(k.keyHash).toString("hex").slice(0, 16) + "...");
    log("Created Slot:",       k.createdAt.toString());
    log("Last Verified:",      k.lastVerifiedAt ? k.lastVerifiedAt.toString() : "Never");
    log("Total Verifications:",k.totalVerifications.toString());
    log("Failed Attempts:",    k.failedVerifications.toString());

    if (usage) {
      console.log("\n── Usage Account ──\n");
      log("Request Count:", usage.requestCount.toString());
      log("Window Start:",  usage.windowStart.toString());
      log("Last Used:",     usage.lastUsedAt.toString());
    }
    console.log("");
  }
}

async function listKeys(args) {
  const projectIdHex = getArg(args, "--project-id", "-p");
  const walletPath   = getArg(args, "--wallet", "-w");

  if (!projectIdHex) { console.error("Error: --project-id is required"); process.exit(1); }

  const { program, wallet } = await getProgram(walletPath);
  const projectId  = Array.from(Buffer.from(projectIdHex, "hex"));
  const projectPDA = getProjectPDA(wallet.publicKey, projectId);
  const project    = await program.account.project.fetch(projectPDA);

  console.log(`\nProject: ${project.name}`);
  console.log(`Keys: ${project.totalKeys} total, ${project.activeKeys} active\n`);
  divider();
  console.log("#    Name                  Status       Rate    Verifications");
  divider();

  for (let i = 0; i < project.totalKeys; i++) {
    const apiKeyPDA = getApiKeyPDA(projectPDA, i);
    const k = await program.account.apiKey.fetch(apiKeyPDA);
    const status = Object.keys(k.status)[0].toUpperCase();
    console.log(
      `${String(i).padEnd(5)}${k.name.padEnd(22)}${status.padEnd(13)}${String(k.rateLimit).padEnd(8)}${k.totalVerifications}`
    );
  }
  divider();
  console.log("");
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗██╗  ██╗███████╗██╗   ██╗
 ██╔════╝██║  ██║██╔══██╗██║████╗  ██║██║ ██╔╝██╔════╝╚██╗ ██╔╝
 ██║     ███████║███████║██║██╔██╗ ██║█████╔╝ █████╗   ╚████╔╝
 ██║     ██╔══██║██╔══██║██║██║╚██╗██║██╔═██╗ ██╔══╝    ╚██╔╝
 ╚██████╗██║  ██║██║  ██║██║██║ ╚████║██║  ██╗███████╗   ██║
  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ╚═╝

  On-Chain API Key Manager — Solana Devnet
  Program: B15uspHWgwuLzJhB8sJU3vS9j88sLoB5Uwbfu7q82isR

  Usage: node cli/index.js <command> [options]

  Commands:
    create-project    Create a new project namespace
    issue             Issue a new API key
    verify            Verify an API key
    rotate            Rotate key secret (atomic)
    revoke            Permanently revoke a key
    suspend           Temporarily suspend a key
    reactivate        Reactivate a suspended key
    inspect           Inspect a project or key account
    list-keys         List all keys for a project

  Examples:
    node cli/index.js create-project --name "My App" --rate-limit 1000
    node cli/index.js issue --project-id <hex> --name "Prod Key" --scopes "read:data,write:data"
    node cli/index.js verify --project-id <hex> --key-index 0 --secret sk_...
    node cli/index.js rotate --project-id <hex> --key-index 0
    node cli/index.js revoke --project-id <hex> --key-index 0
    node cli/index.js list-keys --project-id <hex>
    node cli/index.js inspect project --project-id <hex>
    node cli/index.js inspect key --project-id <hex> --key-index 0
  `);
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case "create-project": await createProject(args.slice(1)); break;
      case "issue":          await issueKey(args.slice(1));      break;
      case "verify":         await verifyKey(args.slice(1));     break;
      case "rotate":         await rotateKey(args.slice(1));     break;
      case "revoke":         await revokeKey(args.slice(1));     break;
      case "suspend":        await suspendKey(args.slice(1));    break;
      case "reactivate":     await reactivateKey(args.slice(1)); break;
      case "inspect":        await inspectAccount(args.slice(1)); break;
      case "list-keys":      await listKeys(args.slice(1));      break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (e) {
    console.error("\n✗ Error:", e.message);
    process.exit(1);
  }
}

main();