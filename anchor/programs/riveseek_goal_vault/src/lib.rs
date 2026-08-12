use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

#[cfg(test)]
mod tests;

declare_id!("FDtNFJfNyKCeyvAkt6GUPiu6WREjRb6GM6e29NugHqxp");

#[program]
pub mod riveseek_goal_vault {
    use super::*;

    pub fn create_goal(ctx: Context<CreateGoal>, goal_id: u64, maximum_budget: u64) -> Result<()> {
        require!(maximum_budget > 0, VaultError::InvalidMaximumBudget);
        let goal = &mut ctx.accounts.goal_account;
        goal.owner = ctx.accounts.owner.key();
        goal.goal_id = goal_id;
        goal.funding_mint = ctx.accounts.funding_mint.key();
        goal.vault_token = ctx.accounts.vault_token.key();
        goal.maximum_budget = maximum_budget;
        goal.status = GoalStatus::Active;
        goal.created_at = Clock::get()?.unix_timestamp;
        goal.bump = ctx.bumps.goal_account;
        Ok(())
    }

    pub fn deposit(ctx: Context<GoalTokenAction>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        require!(ctx.accounts.goal_account.status == GoalStatus::Active, VaultError::GoalNotActive);
        require!(ctx.accounts.vault_token.amount.checked_add(amount).ok_or(VaultError::AmountOverflow)? <= ctx.accounts.goal_account.maximum_budget, VaultError::MaximumBudgetExceeded);
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.key(), Transfer {
                from: ctx.accounts.owner_token.to_account_info(),
                to: ctx.accounts.vault_token.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            }), amount,
        )
    }

    pub fn withdraw(ctx: Context<GoalTokenAction>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        require!(ctx.accounts.vault_token.amount >= amount, VaultError::InsufficientFunds);
        let goal_key = ctx.accounts.goal_account.key();
        let bump = ctx.bumps.vault_authority;
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault_token", goal_key.as_ref(), &[bump]]];
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.key(), Transfer {
                from: ctx.accounts.vault_token.to_account_info(),
                to: ctx.accounts.owner_token.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            }, signer_seeds), amount,
        )
    }

    pub fn pause_goal(ctx: Context<GoalOnly>) -> Result<()> {
        require!(ctx.accounts.goal_account.status == GoalStatus::Active, VaultError::InvalidStatus);
        ctx.accounts.goal_account.status = GoalStatus::Paused;
        Ok(())
    }

    pub fn resume_goal(ctx: Context<GoalOnly>) -> Result<()> {
        require!(ctx.accounts.goal_account.status == GoalStatus::Paused, VaultError::InvalidStatus);
        ctx.accounts.goal_account.status = GoalStatus::Active;
        Ok(())
    }

    pub fn cancel_goal(ctx: Context<GoalOnly>) -> Result<()> {
        require!(
            matches!(
                ctx.accounts.goal_account.status,
                GoalStatus::Active | GoalStatus::Paused
            ),
            VaultError::InvalidStatus
        );
        ctx.accounts.goal_account.status = GoalStatus::Cancelled;
        Ok(())
    }

    pub fn close_goal(ctx: Context<CloseGoal>) -> Result<()> {
        require!(ctx.accounts.vault_token.amount == 0, VaultError::VaultNotEmpty);
        let goal_key = ctx.accounts.goal_account.key();
        let bump = ctx.bumps.vault_authority;
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault_token", goal_key.as_ref(), &[bump]]];
        token::close_account(CpiContext::new_with_signer(ctx.accounts.token_program.key(), CloseAccount {
            account: ctx.accounts.vault_token.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        }, signer_seeds))
    }
}

#[derive(Accounts)]
#[instruction(goal_id: u64)]
pub struct CreateGoal<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub funding_mint: Account<'info, Mint>,
    #[account(init, payer = owner, space = 8 + GoalAccount::INIT_SPACE, seeds = [b"goal", owner.key().as_ref(), &goal_id.to_le_bytes()], bump)]
    pub goal_account: Account<'info, GoalAccount>,
    /// CHECK: PDA used only as the token account authority.
    #[account(seeds = [b"vault_token", goal_account.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(init, payer = owner, token::mint = funding_mint, token::authority = vault_authority)]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct GoalOnly<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub goal_account: Account<'info, GoalAccount>,
}

#[derive(Accounts)]
pub struct GoalTokenAction<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, has_one = vault_token @ VaultError::InvalidVaultToken)]
    pub goal_account: Account<'info, GoalAccount>,
    #[account(address = goal_account.funding_mint)]
    pub funding_mint: Account<'info, Mint>,
    /// CHECK: PDA authority is verified by seeds and used only for token CPI signing.
    #[account(seeds = [b"vault_token", goal_account.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, token::mint = funding_mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(mut, token::mint = funding_mint, token::authority = vault_authority)]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseGoal<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = owner,
        has_one = vault_token @ VaultError::InvalidVaultToken,
        close = owner
    )]
    pub goal_account: Account<'info, GoalAccount>,
    /// CHECK: PDA authority is verified by seeds and used only for token CPI signing.
    #[account(seeds = [b"vault_token", goal_account.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, token::authority = vault_authority)]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct GoalAccount {
    pub owner: Pubkey,
    pub goal_id: u64,
    pub funding_mint: Pubkey,
    pub vault_token: Pubkey,
    pub maximum_budget: u64,
    pub status: GoalStatus,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum GoalStatus {
    Active,
    Paused,
    Cancelled,
}

#[error_code]
pub enum VaultError {
    #[msg("Maximum budget must be greater than zero")]
    InvalidMaximumBudget,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Goal is not active")]
    GoalNotActive,
    #[msg("Amount arithmetic overflowed")]
    AmountOverflow,
    #[msg("Maximum budget exceeded")]
    MaximumBudgetExceeded,
    #[msg("Insufficient vault funds")]
    InsufficientFunds,
    #[msg("Invalid goal status")]
    InvalidStatus,
    #[msg("Vault token account must be empty")]
    VaultNotEmpty,
    #[msg("Invalid vault token account")]
    InvalidVaultToken,
}
