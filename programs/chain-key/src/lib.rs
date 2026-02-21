use anchor_lang::prelude::*;

declare_id!("AhXw9kSv452KwujTWqNpuQcGvVXdkiHp4D2A8SFpLhUp");

pub const MAX_KEY_NAME_LEN: usize = 64;
pub const MAX_SCOPES: usize = 8;
pub const MAX_SCOPE_LEN: usize = 32;
pub const MAX_KEYS_PER_PROJECT: u16 = 100;
pub const MAX_PROJECT_NAME_LEN: usize = 64;
pub const MAX_PROJECT_DESC_LEN: usize = 128;
pub const RATE_WINDOW_SLOTS: u64 = 216_000; // ~24 hours at 400ms/slot

pub const PROJECT_SEED: &[u8] = b"project";
pub const API_KEY_SEED: &[u8] = b"api_key";
pub const USAGE_SEED: &[u8] = b"usage";

#[program]
pub mod api_key_manager {
    use super::*;

    pub fn create_project(
        ctx: Context<CreateProject>,
        project_id: [u8; 16],
        name: String,
        description: String,
        default_rate_limit: u32,
    ) -> Result<()> {
        require!(name.len() <= MAX_PROJECT_NAME_LEN, ApiKeyError::NameTooLong);
        require!(description.len() <= MAX_PROJECT_DESC_LEN, ApiKeyError::DescriptionTooLong);
        require!(default_rate_limit > 0, ApiKeyError::InvalidRateLimit);

        // grab keys before mutable borrow
        let project_key = ctx.accounts.project.key();
        let authority_key = ctx.accounts.authority.key();

        let project = &mut ctx.accounts.project;
        project.authority = authority_key;
        project.project_id = project_id;
        project.name = name;
        project.description = description;
        project.default_rate_limit = default_rate_limit;
        project.total_keys = 0;
        project.active_keys = 0;
        project.created_at = Clock::get()?.slot;
        project.bump = ctx.bumps.project;

        let project_name = project.name.clone();

        emit!(ProjectCreated {
            project: project_key,
            authority: authority_key,
            project_id,
            name: project_name,
        });

        Ok(())
    }

    pub fn transfer_project_authority(
        ctx: Context<TransferProjectAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let project = &mut ctx.accounts.project;
        let old_authority = project.authority;
        project.authority = new_authority;

        emit!(ProjectAuthorityTransferred {
            project: ctx.accounts.project.key(),
            old_authority,
            new_authority,
        });

        Ok(())
    }

    pub fn issue_api_key(
        ctx: Context<IssueApiKey>,
        key_index: u16,
        name: String,
        key_hash: [u8; 32],
        scopes: Vec<String>,
        expires_at: Option<u64>,
        rate_limit_override: Option<u32>,
    ) -> Result<()> {
        require!(name.len() <= MAX_KEY_NAME_LEN, ApiKeyError::NameTooLong);
        require!(scopes.len() <= MAX_SCOPES, ApiKeyError::TooManyScopes);
        require!(scopes.iter().all(|s| s.len() <= MAX_SCOPE_LEN), ApiKeyError::ScopeTooLong);

        let project_key = ctx.accounts.project.key();
        let api_key_key = ctx.accounts.api_key.key();

        let clock = Clock::get()?;
        if let Some(exp) = expires_at {
            require!(exp > clock.slot, ApiKeyError::ExpiryInPast);
        }

        {
            let project = &mut ctx.accounts.project;
            require!(project.total_keys < MAX_KEYS_PER_PROJECT, ApiKeyError::MaxKeysReached);
            require!(key_index == project.total_keys, ApiKeyError::InvalidKeyIndex);

            let default_rate = project.default_rate_limit;

            let api_key = &mut ctx.accounts.api_key;
            api_key.project = project_key;
            api_key.issued_by = project.authority;
            api_key.key_index = key_index;
            api_key.name = name;
            api_key.key_hash = key_hash;
            api_key.scopes = scopes;
            api_key.status = KeyStatus::Active;
            api_key.expires_at = expires_at;
            api_key.rate_limit = rate_limit_override.unwrap_or(default_rate);
            api_key.created_at = clock.slot;
            api_key.last_verified_at = None;
            api_key.total_verifications = 0;
            api_key.failed_verifications = 0;
            api_key.bump = ctx.bumps.api_key;

            project.total_keys += 1;
            project.active_keys += 1;
        }

        {
            let usage = &mut ctx.accounts.usage;
            usage.api_key = api_key_key;
            usage.window_start = clock.slot;
            usage.request_count = 0;
            usage.last_used_at = 0;
            usage.bump = ctx.bumps.usage;
        }

        let api_key = &ctx.accounts.api_key;
        let emit_name = api_key.name.clone();
        let emit_scopes = api_key.scopes.clone();

        emit!(ApiKeyIssued {
            project: project_key,
            api_key: api_key_key,
            key_index,
            name: emit_name,
            scopes: emit_scopes,
            expires_at,
        });

        Ok(())
    }

    pub fn verify_api_key(
        ctx: Context<VerifyApiKey>,
        presented_hash: [u8; 32],
        required_scope: Option<String>,
    ) -> Result<()> {
        let clock = Clock::get()?;

        let api_key_key = ctx.accounts.api_key.key();
        let project_key = ctx.accounts.api_key.project;

        let api_key = &mut ctx.accounts.api_key;

        require!(api_key.status == KeyStatus::Active, ApiKeyError::KeyNotActive);

        if let Some(exp) = api_key.expires_at {
            require!(clock.slot <= exp, ApiKeyError::KeyExpired);
        }

        // constant-time comparison to prevent timing attacks
        let hash_matches = constant_time_eq(&presented_hash, &api_key.key_hash);

        if !hash_matches {
            api_key.failed_verifications = api_key.failed_verifications.saturating_add(1);
            // auto-revoke after too many bad attempts
            if api_key.failed_verifications >= 10 {
                api_key.status = KeyStatus::Revoked;
                emit!(ApiKeyAutoRevoked {
                    project: project_key,
                    api_key: api_key_key,
                    reason: "too_many_failed_verifications".to_string(),
                });
            }
            return Err(ApiKeyError::InvalidKey.into());
        }

        if let Some(scope) = required_scope {
            require!(
                api_key.scopes.contains(&scope) || api_key.scopes.contains(&"*".to_string()),
                ApiKeyError::InsufficientScope
            );
        }

        // rate limiting — slot-based sliding window
        let usage = &mut ctx.accounts.usage;
        let window_start = clock.slot.saturating_sub(RATE_WINDOW_SLOTS);

        if usage.window_start < window_start {
            usage.window_start = clock.slot;
            usage.request_count = 0;
        }

        require!(usage.request_count < api_key.rate_limit, ApiKeyError::RateLimitExceeded);

        usage.request_count = usage.request_count.saturating_add(1);
        usage.last_used_at = clock.slot;
        api_key.last_verified_at = Some(clock.slot);
        api_key.total_verifications = api_key.total_verifications.saturating_add(1);
        api_key.failed_verifications = 0; // reset on success

        let request_count = usage.request_count;

        emit!(ApiKeyVerified {
            project: project_key,
            api_key: api_key_key,
            slot: clock.slot,
            request_count,
        });

        Ok(())
    }

    pub fn rotate_api_key(
        ctx: Context<RotateApiKey>,
        new_key_hash: [u8; 32],
        new_expires_at: Option<u64>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        if let Some(exp) = new_expires_at {
            require!(exp > clock.slot, ApiKeyError::ExpiryInPast);
        }

        let api_key = &mut ctx.accounts.api_key;
        require!(api_key.status == KeyStatus::Active, ApiKeyError::KeyNotActive);

        let old_hash = api_key.key_hash;
        api_key.key_hash = new_key_hash;
        api_key.expires_at = new_expires_at;
        api_key.failed_verifications = 0;
        api_key.total_verifications = 0;

        emit!(ApiKeyRotated {
            project: api_key.project,
            api_key: ctx.accounts.api_key.key(),
            old_hash,
            slot: clock.slot,
        });

        Ok(())
    }

    pub fn update_scopes(
        ctx: Context<UpdateApiKey>,
        new_scopes: Vec<String>,
    ) -> Result<()> {
        require!(new_scopes.len() <= MAX_SCOPES, ApiKeyError::TooManyScopes);
        require!(new_scopes.iter().all(|s| s.len() <= MAX_SCOPE_LEN), ApiKeyError::ScopeTooLong);

        let api_key_key = ctx.accounts.api_key.key();
        let project_key = ctx.accounts.api_key.project;

        let api_key = &mut ctx.accounts.api_key;
        let old_scopes = api_key.scopes.clone();
        api_key.scopes = new_scopes;
        let new_scopes_emit = api_key.scopes.clone();

        emit!(ApiKeyScopesUpdated {
            project: project_key,
            api_key: api_key_key,
            old_scopes,
            new_scopes: new_scopes_emit,
        });

        Ok(())
    }

    pub fn update_rate_limit(
        ctx: Context<UpdateApiKey>,
        new_rate_limit: u32,
    ) -> Result<()> {
        require!(new_rate_limit > 0, ApiKeyError::InvalidRateLimit);
        ctx.accounts.api_key.rate_limit = new_rate_limit;
        Ok(())
    }

    pub fn revoke_api_key(ctx: Context<RevokeApiKey>) -> Result<()> {
        let project = &mut ctx.accounts.project;
        let api_key = &mut ctx.accounts.api_key;

        require!(api_key.status == KeyStatus::Active, ApiKeyError::KeyNotActive);

        api_key.status = KeyStatus::Revoked;
        project.active_keys = project.active_keys.saturating_sub(1);

        emit!(ApiKeyRevoked {
            project: project.key(),
            api_key: ctx.accounts.api_key.key(),
            slot: Clock::get()?.slot,
        });

        Ok(())
    }

    pub fn suspend_api_key(ctx: Context<RevokeApiKey>) -> Result<()> {
        let api_key = &mut ctx.accounts.api_key;
        require!(api_key.status == KeyStatus::Active, ApiKeyError::KeyNotActive);
        api_key.status = KeyStatus::Suspended;
        ctx.accounts.project.active_keys = ctx.accounts.project.active_keys.saturating_sub(1);
        Ok(())
    }

    pub fn reactivate_api_key(ctx: Context<RevokeApiKey>) -> Result<()> {
        let api_key = &mut ctx.accounts.api_key;
        require!(api_key.status == KeyStatus::Suspended, ApiKeyError::KeyNotSuspended);
        api_key.status = KeyStatus::Active;
        ctx.accounts.project.active_keys = ctx.accounts.project.active_keys.saturating_add(1);
        Ok(())
    }

    pub fn close_usage_account(_ctx: Context<CloseUsageAccount>) -> Result<()> {
        Ok(())
    }
}

// ── Accounts ─────────────────────────────────────────────────────────────────

#[account]
#[derive(Default)]
pub struct Project {
    pub authority: Pubkey,
    pub project_id: [u8; 16],
    pub name: String,
    pub description: String,
    pub default_rate_limit: u32,
    pub total_keys: u16,
    pub active_keys: u16,
    pub created_at: u64,
    pub bump: u8,
}

impl Project {
    pub const LEN: usize = 8
        + 32
        + 16
        + 4 + MAX_PROJECT_NAME_LEN
        + 4 + MAX_PROJECT_DESC_LEN
        + 4
        + 2
        + 2
        + 8
        + 1;
}

#[account]
pub struct ApiKey {
    pub project: Pubkey,
    pub issued_by: Pubkey,
    pub key_index: u16,
    pub name: String,
    pub key_hash: [u8; 32],
    pub scopes: Vec<String>,
    pub status: KeyStatus,
    pub expires_at: Option<u64>,
    pub rate_limit: u32,
    pub created_at: u64,
    pub last_verified_at: Option<u64>,
    pub total_verifications: u64,
    pub failed_verifications: u8,
    pub bump: u8,
}

impl ApiKey {
    pub const LEN: usize = 8
        + 32
        + 32
        + 2
        + 4 + MAX_KEY_NAME_LEN
        + 32
        + 4 + MAX_SCOPES * (4 + MAX_SCOPE_LEN)
        + 1
        + 1 + 8
        + 4
        + 8
        + 1 + 8
        + 8
        + 1
        + 1;
}

#[account]
#[derive(Default)]
pub struct UsageAccount {
    pub api_key: Pubkey,
    pub window_start: u64,
    pub request_count: u32,
    pub last_used_at: u64,
    pub bump: u8,
}

impl UsageAccount {
    pub const LEN: usize = 8 + 32 + 8 + 4 + 8 + 1;
}

// ── Enums ────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default)]
pub enum KeyStatus {
    #[default]
    Active,
    Revoked,
    Suspended,
}

// ── Contexts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(project_id: [u8; 16])]
pub struct CreateProject<'info> {
    #[account(
        init,
        payer = authority,
        space = Project::LEN,
        seeds = [PROJECT_SEED, authority.key().as_ref(), &project_id],
        bump
    )]
    pub project: Account<'info, Project>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferProjectAuthority<'info> {
    #[account(
        mut,
        seeds = [PROJECT_SEED, authority.key().as_ref(), &project.project_id],
        bump = project.bump,
        has_one = authority @ ApiKeyError::Unauthorized,
    )]
    pub project: Account<'info, Project>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(key_index: u16)]
pub struct IssueApiKey<'info> {
    #[account(
        mut,
        seeds = [PROJECT_SEED, authority.key().as_ref(), &project.project_id],
        bump = project.bump,
        has_one = authority @ ApiKeyError::Unauthorized,
    )]
    pub project: Account<'info, Project>,
    #[account(
        init,
        payer = authority,
        space = ApiKey::LEN,
        seeds = [API_KEY_SEED, project.key().as_ref(), &key_index.to_le_bytes()],
        bump
    )]
    pub api_key: Account<'info, ApiKey>,
    #[account(
        init,
        payer = authority,
        space = UsageAccount::LEN,
        seeds = [USAGE_SEED, api_key.key().as_ref()],
        bump
    )]
    pub usage: Account<'info, UsageAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyApiKey<'info> {
    #[account(mut)]
    pub api_key: Account<'info, ApiKey>,
    #[account(
        mut,
        seeds = [USAGE_SEED, api_key.key().as_ref()],
        bump = usage.bump,
    )]
    pub usage: Account<'info, UsageAccount>,
    #[account(mut)]
    pub verifier: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RotateApiKey<'info> {
    #[account(
        seeds = [PROJECT_SEED, authority.key().as_ref(), &project.project_id],
        bump = project.bump,
        has_one = authority @ ApiKeyError::Unauthorized,
    )]
    pub project: Account<'info, Project>,
    #[account(
        mut,
        seeds = [API_KEY_SEED, project.key().as_ref(), &api_key.key_index.to_le_bytes()],
        bump = api_key.bump,
        has_one = project @ ApiKeyError::KeyProjectMismatch,
    )]
    pub api_key: Account<'info, ApiKey>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateApiKey<'info> {
    #[account(
        seeds = [PROJECT_SEED, authority.key().as_ref(), &project.project_id],
        bump = project.bump,
        has_one = authority @ ApiKeyError::Unauthorized,
    )]
    pub project: Account<'info, Project>,
    #[account(
        mut,
        seeds = [API_KEY_SEED, project.key().as_ref(), &api_key.key_index.to_le_bytes()],
        bump = api_key.bump,
        has_one = project @ ApiKeyError::KeyProjectMismatch,
    )]
    pub api_key: Account<'info, ApiKey>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RevokeApiKey<'info> {
    #[account(
        mut,
        seeds = [PROJECT_SEED, authority.key().as_ref(), &project.project_id],
        bump = project.bump,
        has_one = authority @ ApiKeyError::Unauthorized,
    )]
    pub project: Account<'info, Project>,
    #[account(
        mut,
        seeds = [API_KEY_SEED, project.key().as_ref(), &api_key.key_index.to_le_bytes()],
        bump = api_key.bump,
        has_one = project @ ApiKeyError::KeyProjectMismatch,
    )]
    pub api_key: Account<'info, ApiKey>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseUsageAccount<'info> {
    #[account(
        seeds = [PROJECT_SEED, authority.key().as_ref(), &project.project_id],
        bump = project.bump,
        has_one = authority @ ApiKeyError::Unauthorized,
    )]
    pub project: Account<'info, Project>,
    pub api_key: Account<'info, ApiKey>,
    #[account(
        mut,
        close = authority,
        seeds = [USAGE_SEED, api_key.key().as_ref()],
        bump = usage.bump,
    )]
    pub usage: Account<'info, UsageAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct ProjectCreated {
    pub project: Pubkey,
    pub authority: Pubkey,
    pub project_id: [u8; 16],
    pub name: String,
}

#[event]
pub struct ProjectAuthorityTransferred {
    pub project: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct ApiKeyIssued {
    pub project: Pubkey,
    pub api_key: Pubkey,
    pub key_index: u16,
    pub name: String,
    pub scopes: Vec<String>,
    pub expires_at: Option<u64>,
}

#[event]
pub struct ApiKeyVerified {
    pub project: Pubkey,
    pub api_key: Pubkey,
    pub slot: u64,
    pub request_count: u32,
}

#[event]
pub struct ApiKeyRotated {
    pub project: Pubkey,
    pub api_key: Pubkey,
    pub old_hash: [u8; 32],
    pub slot: u64,
}

#[event]
pub struct ApiKeyScopesUpdated {
    pub project: Pubkey,
    pub api_key: Pubkey,
    pub old_scopes: Vec<String>,
    pub new_scopes: Vec<String>,
}

#[event]
pub struct ApiKeyRevoked {
    pub project: Pubkey,
    pub api_key: Pubkey,
    pub slot: u64,
}

#[event]
pub struct ApiKeyAutoRevoked {
    pub project: Pubkey,
    pub api_key: Pubkey,
    pub reason: String,
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum ApiKeyError {
    #[msg("Caller is not the project authority")]
    Unauthorized,
    #[msg("Name exceeds maximum length")]
    NameTooLong,
    #[msg("Description exceeds maximum length")]
    DescriptionTooLong,
    #[msg("Maximum number of API keys per project reached")]
    MaxKeysReached,
    #[msg("Key index must equal current total_keys counter")]
    InvalidKeyIndex,
    #[msg("Expiry slot must be in the future")]
    ExpiryInPast,
    #[msg("Too many scopes (max 8)")]
    TooManyScopes,
    #[msg("Scope string exceeds maximum length")]
    ScopeTooLong,
    #[msg("API key is not active")]
    KeyNotActive,
    #[msg("API key is not suspended")]
    KeyNotSuspended,
    #[msg("API key has expired")]
    KeyExpired,
    #[msg("Invalid API key — hash mismatch")]
    InvalidKey,
    #[msg("Insufficient scope for this operation")]
    InsufficientScope,
    #[msg("Rate limit exceeded for this key")]
    RateLimitExceeded,
    #[msg("Rate limit must be greater than zero")]
    InvalidRateLimit,
    #[msg("API key does not belong to this project")]
    KeyProjectMismatch,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// constant-time comparison — standard == on bytes leaks timing info
fn constant_time_eq(a: &[u8; 32], b: &[u8; 32]) -> bool {
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}