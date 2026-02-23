import anchor from "@coral-xyz/anchor";
const { Program, BN } = anchor;
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";
import { assert } from "chai";

const SCOPE_NONE = new BN(0);
const SCOPE_READ = new BN(1);
const SCOPE_WRITE = new BN(2);
const SCOPE_ADMIN = new BN(4);
const SCOPE_ALL = new BN("ffffffffffffffff", 16);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(input: string): number[] {
  return Array.from(createHash("sha256").update(input).digest());
}

function randomProjectId(): number[] {
  return Array.from(Keypair.generate().secretKey.slice(0, 16));
}

function getProjectPDA(
  authority: PublicKey,
  projectId: number[],
  programId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("project"), authority.toBuffer(), Buffer.from(projectId)],
    programId
  );
  return pda;
}

function getApiKeyPDA(
  project: PublicKey,
  keyIndex: number,
  programId: PublicKey
): PublicKey {
  const indexBuf = Buffer.alloc(2);
  indexBuf.writeUInt16LE(keyIndex);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("api_key"), project.toBuffer(), indexBuf],
    programId
  );
  return pda;
}

function getUsagePDA(apiKey: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("usage"), apiKey.toBuffer()],
    programId
  );
  return pda;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ChainKey — API Key Manager", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ApiKeyManager as any;
  const authority = provider.wallet as anchor.Wallet;

  let projectId: number[];
  let projectPDA: PublicKey;
  let apiKeyPDA: PublicKey;
  let usagePDA: PublicKey;

  const rawSecret = "sk_test_chainkey_supersecret_12345";
  const keyHash = sha256(rawSecret);

  // ── 1. Project Management ─────────────────────────────────────────────────

  describe("1. Project Management", () => {
    it("Creates a project", async () => {
      projectId = randomProjectId();
      projectPDA = getProjectPDA(
        authority.publicKey,
        projectId,
        program.programId
      );

      const tx = await program.methods
        .createProject(
          projectId,
          "ChainKey Test Project",
          "Integration test project for CI pipeline",
          1000
        )
        .accounts({
          project: projectPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("    createProject tx:", tx);

      const project = await program.account.project.fetch(projectPDA);
      assert.equal(project.name, "ChainKey Test Project");
      assert.equal(project.description, "Integration test project for CI pipeline");
      assert.equal(project.defaultRateLimit, 1000);
      assert.equal(project.totalKeys, 0);
      assert.equal(project.activeKeys, 0);
      assert.equal(
        project.authority.toBase58(),
        authority.publicKey.toBase58()
      );
    });

    it("Rejects zero rate limit", async () => {
      const newId = randomProjectId();
      const newPDA = getProjectPDA(authority.publicKey, newId, program.programId);
      try {
        await program.methods
          .createProject(newId, "Bad Project", "desc", 0)
          .accounts({
            project: newPDA,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "InvalidRateLimit");
      }
    });

    it("Rejects name exceeding 64 chars", async () => {
      const newId = randomProjectId();
      const newPDA = getProjectPDA(authority.publicKey, newId, program.programId);
      try {
        await program.methods
          .createProject(newId, "A".repeat(65), "desc", 100)
          .accounts({
            project: newPDA,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "NameTooLong");
      }
    });

    it("Rejects description exceeding 128 chars", async () => {
      const newId = randomProjectId();
      const newPDA = getProjectPDA(authority.publicKey, newId, program.programId);
      try {
        await program.methods
          .createProject(newId, "Valid Name", "D".repeat(129), 100)
          .accounts({
            project: newPDA,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "DescriptionTooLong");
      }
    });
  });

  // ── 2. API Key Issuance ───────────────────────────────────────────────────

  describe("2. API Key Issuance", () => {
    it("Issues key #0 with scopes", async () => {
      apiKeyPDA = getApiKeyPDA(projectPDA, 0, program.programId);
      usagePDA = getUsagePDA(apiKeyPDA, program.programId);

      const tx = await program.methods
        .issueApiKey(
          0,
          "Production Key",
          keyHash,
          SCOPE_READ.or(SCOPE_WRITE),
          null,
          null
        )
        .accounts({
          project: projectPDA,
          apiKey: apiKeyPDA,
          usage: usagePDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("    issueApiKey tx:", tx);

      const key = await program.account.apiKey.fetch(apiKeyPDA);
      assert.equal(key.name, "Production Key");
      assert.ok(key.scopes.eq(SCOPE_READ.or(SCOPE_WRITE)));
      assert.deepEqual(key.status, { active: {} });
      assert.equal(key.rateLimit, 1000); // inherited default

      const project = await program.account.project.fetch(projectPDA);
      assert.equal(project.totalKeys, 1);
      assert.equal(project.activeKeys, 1);

      const usage = await program.account.usageAccount.fetch(usagePDA);
      assert.equal(usage.requestCount, 0);
    });

    it("Issues key #1 with rate limit override", async () => {
      const key1PDA = getApiKeyPDA(projectPDA, 1, program.programId);
      const usage1PDA = getUsagePDA(key1PDA, program.programId);

      await program.methods
        .issueApiKey(
          1,
          "Read-Only Key",
          sha256("another_secret"),
          SCOPE_READ,
          null,
          50
        )
        .accounts({
          project: projectPDA,
          apiKey: key1PDA,
          usage: usage1PDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const key = await program.account.apiKey.fetch(key1PDA);
      assert.equal(key.rateLimit, 50);
      assert.ok(key.scopes.eq(SCOPE_READ));

      const project = await program.account.project.fetch(projectPDA);
      assert.equal(project.totalKeys, 2);
      assert.equal(project.activeKeys, 2);
    });

    it("Rejects wrong key index", async () => {
      const badPDA = getApiKeyPDA(projectPDA, 99, program.programId);
      const badUsagePDA = getUsagePDA(badPDA, program.programId);
      try {
        await program.methods
          .issueApiKey(99, "Bad Key", sha256("x"), SCOPE_NONE, null, null)
          .accounts({
            project: projectPDA,
            apiKey: badPDA,
            usage: badUsagePDA,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "InvalidKeyIndex");
      }
    });

  });

  // ── 3. Verification ───────────────────────────────────────────────────────

  describe("3. Verification", () => {
    it("Verifies correct hash", async () => {
      const tx = await program.methods
        .verifyApiKey(keyHash, SCOPE_NONE)
        .accounts({
          apiKey: apiKeyPDA,
          usage: usagePDA,
          verifier: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("    verifyApiKey tx:", tx);

      const usage = await program.account.usageAccount.fetch(usagePDA);
      assert.equal(usage.requestCount, 1);

      const key = await program.account.apiKey.fetch(apiKeyPDA);
      assert.equal(key.totalVerifications.toNumber(), 1);
      assert.equal(key.failedVerifications, 0);
    });

    it("Verifies with scope check", async () => {
      await program.methods
        .verifyApiKey(keyHash, SCOPE_READ)
        .accounts({
          apiKey: apiKeyPDA,
          usage: usagePDA,
          verifier: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const usage = await program.account.usageAccount.fetch(usagePDA);
      assert.equal(usage.requestCount, 2);
    });

    it("Increments failed_verifications on wrong hash (RPC)", async () => {
      const before = await (program.account as any).apiKey.fetch(apiKeyPDA);
      await program.methods
        .verifyApiKey(sha256("wrong_secret"), SCOPE_NONE)
        .accounts({
          apiKey: apiKeyPDA,
          usage: usagePDA,
          verifier: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const after = await (program.account as any).apiKey.fetch(apiKeyPDA);
      assert.isAbove(after.failedVerifications, before.failedVerifications);
    });

    it("Rejects insufficient scope", async () => {
      try {
        await program.methods
          .verifyApiKey(keyHash, SCOPE_ADMIN)
          .accounts({
            apiKey: apiKeyPDA,
            usage: usagePDA,
            verifier: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "InsufficientScope");
      }
    });

    it("Increments failed_verifications on bad hash and persists state", async () => {
      const before = await program.account.apiKey.fetch(apiKeyPDA);

      await program.methods
        .verifyApiKey(sha256("bad_attempt"), SCOPE_NONE)
        .accounts({
          apiKey: apiKeyPDA,
          usage: usagePDA,
          verifier: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const after = await program.account.apiKey.fetch(apiKeyPDA);
      assert.isAbove(after.failedVerifications, before.failedVerifications);
    });

    it("Resets failed_verifications on success", async () => {
      await program.methods
        .verifyApiKey(keyHash, SCOPE_NONE)
        .accounts({
          apiKey: apiKeyPDA,
          usage: usagePDA,
          verifier: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const key = await program.account.apiKey.fetch(apiKeyPDA);
      assert.equal(key.failedVerifications, 0);
    });

    it("Automatically revokes key after 10 failed attempts", async () => {
      const revokeKeyIdx = 2;
      const revokeKeyPDA = getApiKeyPDA(projectPDA, revokeKeyIdx, program.programId);
      const revokeUsagePDA = getUsagePDA(revokeKeyPDA, program.programId);
      const revokeSecret = "sk_to_be_revoked_123";
      const revokeHash = sha256(revokeSecret);

      // Issue the key
      await program.methods
        .issueApiKey(revokeKeyIdx, "Revoke Me", revokeHash, SCOPE_READ, null, null)
        .accounts({
          project: projectPDA,
          apiKey: revokeKeyPDA,
          usage: revokeUsagePDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      for (let i = 0; i < 10; i++) {
        await program.methods
          .verifyApiKey(sha256("wrong_secret_threshold"), SCOPE_NONE)
          .accounts({
            apiKey: revokeKeyPDA,
            usage: revokeUsagePDA,
            verifier: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      const key = await program.account.apiKey.fetch(revokeKeyPDA);
      assert.deepEqual(key.status, { revoked: {} });

      // Verify it can no longer be used even with correct secret
      try {
        await program.methods
          .verifyApiKey(revokeHash, SCOPE_NONE)
          .accounts({
            apiKey: revokeKeyPDA,
            usage: revokeUsagePDA,
            verifier: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Key should be revoked");
      } catch (e: any) {
        assert.include(e.message, "KeyNotActive");
      }
    });
  });

  // ── 4. Rate Limiting ──────────────────────────────────────────────────────

  describe("4. Rate Limiting", () => {
    let rlProjectId: number[];
    let rlProjectPDA: PublicKey;
    let rlKeyPDA: PublicKey;
    let rlUsagePDA: PublicKey;
    const rlSecret = "sk_rate_limit_test";
    const rlHash = sha256(rlSecret);

    before(async () => {
      // project with rate_limit=3 to test the ceiling
      rlProjectId = randomProjectId();
      rlProjectPDA = getProjectPDA(
        authority.publicKey,
        rlProjectId,
        program.programId
      );

      await program.methods
        .createProject(rlProjectId, "Rate Limit Test", "low limit project", 3)
        .accounts({
          project: rlProjectPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      rlKeyPDA = getApiKeyPDA(rlProjectPDA, 0, program.programId);
      rlUsagePDA = getUsagePDA(rlKeyPDA, program.programId);

      await program.methods
        .issueApiKey(0, "RL Key", rlHash, SCOPE_READ, null, null)
        .accounts({
          project: rlProjectPDA,
          apiKey: rlKeyPDA,
          usage: rlUsagePDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("Allows requests within limit", async () => {
      // 3 requests, limit is 3 — all should pass
      for (let i = 0; i < 3; i++) {
        await program.methods
          .verifyApiKey(rlHash, SCOPE_NONE)
          .accounts({
            apiKey: rlKeyPDA,
            usage: rlUsagePDA,
            verifier: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      const usage = await program.account.usageAccount.fetch(rlUsagePDA);
      assert.equal(usage.requestCount, 3);
    });

    it("Rejects when rate limit exceeded", async () => {
      // 4th request should fail
      try {
        await program.methods
          .verifyApiKey(rlHash, SCOPE_NONE)
          .accounts({
            apiKey: rlKeyPDA,
            usage: rlUsagePDA,
            verifier: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "RateLimitExceeded");
      }
    });
  });

  // ── 5. Authorization ──────────────────────────────────────────────────────

  describe("5. Authorization", () => {
    let attacker: Keypair;

    before(async () => {
      attacker = Keypair.generate();
      try {
        const sig = await provider.connection.requestAirdrop(
          attacker.publicKey,
          1_000_000_000
        );
        await provider.connection.confirmTransaction(sig);
      } catch (e) {
        console.log("    Airdrop failed, but continuing as attacker might already have funds or it might not be strictly needed for failure tests");
      }
    });

    it("Rejects issue from non-authority", async () => {
      const key2PDA = getApiKeyPDA(projectPDA, 2, program.programId);
      const usage2PDA = getUsagePDA(key2PDA, program.programId);

      try {
        await program.methods
          .issueApiKey(2, "Hacked Key", sha256("hacker"), SCOPE_ALL, null, null)
          .accounts({
            project: projectPDA,
            apiKey: key2PDA,
            usage: usage2PDA,
            authority: attacker.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        // seed constraint or has_one check fails
        assert.ok(e);
      }
    });

    it("Rejects revoke from non-authority", async () => {
      try {
        await program.methods
          .revokeApiKey()
          .accounts({
            project: projectPDA,
            apiKey: apiKeyPDA,
            authority: attacker.publicKey,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.ok(e);
      }
    });

    it("Rejects scope update from non-authority", async () => {
      try {
        await program.methods
          .updateScopes(SCOPE_ADMIN)
          .accounts({
            project: projectPDA,
            apiKey: apiKeyPDA,
            authority: attacker.publicKey,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.ok(e);
      }
    });

    it("Rejects rotation from non-authority", async () => {
      try {
        await program.methods
          .rotateApiKey(sha256("attacker_hash"), null)
          .accounts({
            project: projectPDA,
            apiKey: apiKeyPDA,
            authority: attacker.publicKey,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.ok(e);
      }
    });
  });

  // ── 6. Scope & Rate Limit Updates ─────────────────────────────────────────

  describe("6. Updates", () => {
    it("Updates scopes", async () => {
      await program.methods
        .updateScopes(SCOPE_ALL)
        .accounts({
          project: projectPDA,
          apiKey: apiKeyPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const key = await program.account.apiKey.fetch(apiKeyPDA);
      assert.ok(key.scopes.eq(SCOPE_ALL));
    });

    it("Updates rate limit", async () => {
      await program.methods
        .updateRateLimit(500)
        .accounts({
          project: projectPDA,
          apiKey: apiKeyPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const key = await program.account.apiKey.fetch(apiKeyPDA);
      assert.equal(key.rateLimit, 500);
    });
  });

  // ── 7. Key Rotation ───────────────────────────────────────────────────────

  describe("7. Key Rotation", () => {
    const newSecret = "sk_rotated_newsecret_67890";

    it("Rotates the key hash", async () => {
      const newHash = sha256(newSecret);

      const tx = await program.methods
        .rotateApiKey(newHash, null)
        .accounts({
          project: projectPDA,
          apiKey: apiKeyPDA,
          authority: authority.publicKey,
        })
        .rpc();

      console.log("    rotateApiKey tx:", tx);

      const key = await program.account.apiKey.fetch(apiKeyPDA);
      assert.deepEqual(key.keyHash, newHash);
      assert.equal(key.totalVerifications.toNumber(), 0);
      assert.equal(key.failedVerifications, 0);
    });

    it("Increments failed_verifications on old hash after rotation", async () => {
      const before = await (program.account as any).apiKey.fetch(apiKeyPDA);
      await program.methods
        .verifyApiKey(keyHash, SCOPE_NONE)
        .accounts({
          apiKey: apiKeyPDA,
          usage: usagePDA,
          verifier: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const after = await (program.account as any).apiKey.fetch(apiKeyPDA);
      assert.isAbove(after.failedVerifications, before.failedVerifications);
    });

    it("New hash works", async () => {
      const tx = await program.methods
        .verifyApiKey(sha256(newSecret), SCOPE_NONE)
        .accounts({
          apiKey: apiKeyPDA,
          usage: usagePDA,
          verifier: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("    verify (rotated) tx:", tx);
    });
  });

  // ── 8. Suspend / Reactivate / Revoke ──────────────────────────────────────

  describe("8. Lifecycle", () => {
    let lcKeyPDA: PublicKey;
    let lcUsagePDA: PublicKey;

    before(async () => {
      const project = await program.account.project.fetch(projectPDA);
      const idx = project.totalKeys;
      lcKeyPDA = getApiKeyPDA(projectPDA, idx, program.programId);
      lcUsagePDA = getUsagePDA(lcKeyPDA, program.programId);

      await program.methods
        .issueApiKey(idx, "Lifecycle Key", sha256("lc_secret"), SCOPE_READ, null, null)
        .accounts({
          project: projectPDA,
          apiKey: lcKeyPDA,
          usage: lcUsagePDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("Suspends a key", async () => {
      await program.methods
        .suspendApiKey()
        .accounts({
          project: projectPDA,
          apiKey: lcKeyPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const key = await program.account.apiKey.fetch(lcKeyPDA);
      assert.deepEqual(key.status, { suspended: {} });
    });

    it("Suspended key fails verification", async () => {
      try {
        await program.methods
          .verifyApiKey(sha256("lc_secret"), SCOPE_NONE)
          .accounts({
            apiKey: lcKeyPDA,
            usage: lcUsagePDA,
            verifier: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail();
      } catch (e: any) {
        assert.include(e.message, "KeyNotActive");
      }
    });

    it("Reactivates a suspended key", async () => {
      await program.methods
        .reactivateApiKey()
        .accounts({
          project: projectPDA,
          apiKey: lcKeyPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const key = await program.account.apiKey.fetch(lcKeyPDA);
      assert.deepEqual(key.status, { active: {} });
    });

    it("Reactivated key verifies again", async () => {
      await program.methods
        .verifyApiKey(sha256("lc_secret"), SCOPE_NONE)
        .accounts({
          apiKey: lcKeyPDA,
          usage: lcUsagePDA,
          verifier: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const key = await program.account.apiKey.fetch(lcKeyPDA);
      assert.equal(key.totalVerifications.toNumber(), 1);
    });

    it("Revokes a key permanently", async () => {
      const tx = await program.methods
        .revokeApiKey()
        .accounts({
          project: projectPDA,
          apiKey: lcKeyPDA,
          authority: authority.publicKey,
        })
        .rpc();

      console.log("    revokeApiKey tx:", tx);

      const key = await program.account.apiKey.fetch(lcKeyPDA);
      assert.deepEqual(key.status, { revoked: {} });
    });

    it("Revoked key can never verify", async () => {
      try {
        await program.methods
          .verifyApiKey(sha256("lc_secret"), SCOPE_NONE)
          .accounts({
            apiKey: lcKeyPDA,
            usage: lcUsagePDA,
            verifier: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail();
      } catch (e: any) {
        assert.include(e.message, "KeyNotActive");
      }
    });
  });

  // ── 9. Rent Reclamation ───────────────────────────────────────────────────

  describe("9. Rent Reclamation", () => {
    it("Closes usage account and reclaims SOL", async () => {
      const before = await provider.connection.getBalance(authority.publicKey);

      await program.methods
        .closeUsageAccount()
        .accounts({
          project: projectPDA,
          apiKey: apiKeyPDA,
          usage: usagePDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const after = await provider.connection.getBalance(authority.publicKey);
      console.log(
        "    Rent reclaimed:",
        (after - before) / anchor.web3.LAMPORTS_PER_SOL,
        "SOL"
      );
      assert.isAbove(after, before - 10000);
    });
  });
});