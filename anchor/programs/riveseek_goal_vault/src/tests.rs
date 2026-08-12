#[cfg(test)]
mod tests {
    use crate::{GoalAccount, GoalStatus, ID as PROGRAM_ID};
    use anchor_lang::{
        solana_program::{
            clock::Clock, program_option::COption, program_pack::Pack, system_program,
        },
        AccountDeserialize, InstructionData, ToAccountMetas,
    };
    use anchor_spl::token::{
        self,
        spl_token::state::{Account as SplTokenAccount, AccountState, Mint},
    };
    use litesvm::{types::TransactionResult, LiteSVM};
    use solana_sdk::{
        account::Account,
        instruction::{Instruction, InstructionError},
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::{Transaction, TransactionError},
    };

    const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
    const TOKEN: u64 = 1_000_000;
    const OWNER_STARTING_TOKENS: u64 = 1_000 * TOKEN;
    const INVALID_MAXIMUM_BUDGET: u32 = 6000;
    const INVALID_AMOUNT: u32 = 6001;
    const GOAL_NOT_ACTIVE: u32 = 6002;
    const AMOUNT_OVERFLOW: u32 = 6003;
    const MAXIMUM_BUDGET_EXCEEDED: u32 = 6004;
    const INSUFFICIENT_FUNDS: u32 = 6005;
    const INVALID_STATUS: u32 = 6006;
    const VAULT_NOT_EMPTY: u32 = 6007;
    const INVALID_VAULT_TOKEN: u32 = 6008;

    struct TestEnv {
        svm: LiteSVM,
        owner: Keypair,
        attacker: Keypair,
        mint: Pubkey,
        wrong_mint: Pubkey,
        owner_token: Pubkey,
        owner_wrong_token: Pubkey,
        attacker_token: Pubkey,
    }

    struct GoalFixture {
        goal: Pubkey,
        goal_bump: u8,
        vault_authority: Pubkey,
        vault_token: Pubkey,
    }

    impl TestEnv {
        fn new() -> Self {
            let mut svm = LiteSVM::new();
            svm.add_program(
                PROGRAM_ID,
                include_bytes!("../../../target/deploy/riveseek_goal_vault.so"),
            )
            .unwrap();

            let owner = Keypair::new();
            let attacker = Keypair::new();
            svm.airdrop(&owner.pubkey(), 20 * LAMPORTS_PER_SOL).unwrap();
            svm.airdrop(&attacker.pubkey(), 20 * LAMPORTS_PER_SOL)
                .unwrap();

            let mint = Pubkey::new_unique();
            let wrong_mint = Pubkey::new_unique();
            set_mint(&mut svm, mint, owner.pubkey(), OWNER_STARTING_TOKENS, 6);
            set_mint(
                &mut svm,
                wrong_mint,
                owner.pubkey(),
                OWNER_STARTING_TOKENS,
                6,
            );

            let owner_token = Pubkey::new_unique();
            let owner_wrong_token = Pubkey::new_unique();
            let attacker_token = Pubkey::new_unique();
            set_token_account(
                &mut svm,
                owner_token,
                mint,
                owner.pubkey(),
                OWNER_STARTING_TOKENS,
            );
            set_token_account(
                &mut svm,
                owner_wrong_token,
                wrong_mint,
                owner.pubkey(),
                OWNER_STARTING_TOKENS,
            );
            set_token_account(
                &mut svm,
                attacker_token,
                mint,
                attacker.pubkey(),
                100 * TOKEN,
            );

            Self {
                svm,
                owner,
                attacker,
                mint,
                wrong_mint,
                owner_token,
                owner_wrong_token,
                attacker_token,
            }
        }

        fn create_goal(&mut self, goal_id: u64, maximum_budget: u64) -> GoalFixture {
            let (goal, goal_bump) = goal_pda(&self.owner.pubkey(), goal_id);
            let (vault_authority, _) = vault_authority_pda(&goal);
            let vault_token = Keypair::new();
            let ix = create_goal_ix(
                self.owner.pubkey(),
                self.mint,
                goal,
                vault_authority,
                vault_token.pubkey(),
                goal_id,
                maximum_budget,
            );
            send_ix(&mut self.svm, ix, &self.owner, &[&vault_token]).unwrap();
            GoalFixture {
                goal,
                goal_bump,
                vault_authority,
                vault_token: vault_token.pubkey(),
            }
        }
    }

    fn set_mint(svm: &mut LiteSVM, address: Pubkey, authority: Pubkey, supply: u64, decimals: u8) {
        let mint = Mint {
            mint_authority: COption::Some(authority),
            supply,
            decimals,
            is_initialized: true,
            freeze_authority: COption::None,
        };
        let mut data = vec![0; Mint::LEN];
        Mint::pack(mint, &mut data).unwrap();
        svm.set_account(
            address,
            Account {
                lamports: LAMPORTS_PER_SOL,
                data,
                owner: token::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    }

    fn set_token_account(
        svm: &mut LiteSVM,
        address: Pubkey,
        mint: Pubkey,
        owner: Pubkey,
        amount: u64,
    ) {
        let token_account = SplTokenAccount {
            mint,
            owner,
            amount,
            delegate: COption::None,
            state: AccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        };
        let mut data = vec![0; SplTokenAccount::LEN];
        SplTokenAccount::pack(token_account, &mut data).unwrap();
        svm.set_account(
            address,
            Account {
                lamports: LAMPORTS_PER_SOL,
                data,
                owner: token::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    }

    fn set_token_amount(svm: &mut LiteSVM, address: Pubkey, amount: u64) {
        let mut account = svm.get_account(&address).unwrap();
        let mut token_account = SplTokenAccount::unpack(&account.data).unwrap();
        token_account.amount = amount;
        SplTokenAccount::pack(token_account, &mut account.data).unwrap();
        svm.set_account(address, account).unwrap();
    }

    fn token_account(svm: &LiteSVM, address: Pubkey) -> SplTokenAccount {
        let account = svm.get_account(&address).expect("token account must exist");
        assert_eq!(account.owner, token::ID);
        SplTokenAccount::unpack(&account.data).unwrap()
    }

    fn token_balance(svm: &LiteSVM, address: Pubkey) -> u64 {
        token_account(svm, address).amount
    }

    fn goal_account(svm: &LiteSVM, address: Pubkey) -> GoalAccount {
        let account = svm.get_account(&address).expect("goal account must exist");
        assert_eq!(account.owner, PROGRAM_ID);
        GoalAccount::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    fn goal_pda(owner: &Pubkey, goal_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"goal", owner.as_ref(), &goal_id.to_le_bytes()],
            &PROGRAM_ID,
        )
    }

    fn vault_authority_pda(goal: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault_token", goal.as_ref()], &PROGRAM_ID)
    }

    fn send_ix(
        svm: &mut LiteSVM,
        ix: Instruction,
        payer: &Keypair,
        extra_signers: &[&Keypair],
    ) -> TransactionResult {
        svm.expire_blockhash();
        let mut signers = vec![payer];
        signers.extend_from_slice(extra_signers);
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &signers,
            svm.latest_blockhash(),
        );
        svm.send_transaction(tx)
    }

    fn assert_custom_error(result: TransactionResult, expected: u32) {
        let failure = result.expect_err("transaction must fail");
        assert_eq!(
            failure.err,
            TransactionError::InstructionError(0, InstructionError::Custom(expected))
        );
    }

    fn create_goal_ix(
        owner: Pubkey,
        funding_mint: Pubkey,
        goal_account: Pubkey,
        vault_authority: Pubkey,
        vault_token: Pubkey,
        goal_id: u64,
        maximum_budget: u64,
    ) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: crate::accounts::CreateGoal {
                owner,
                funding_mint,
                goal_account,
                vault_authority,
                vault_token,
                token_program: token::ID,
                system_program: system_program::ID,
                rent: solana_sdk::sysvar::rent::ID,
            }
            .to_account_metas(None),
            data: crate::instruction::CreateGoal {
                goal_id,
                maximum_budget,
            }
            .data(),
        }
    }

    fn token_action_ix(
        owner: Pubkey,
        fixture: &GoalFixture,
        funding_mint: Pubkey,
        owner_token: Pubkey,
        vault_token: Pubkey,
        amount: u64,
        withdraw: bool,
    ) -> Instruction {
        let accounts = crate::accounts::GoalTokenAction {
            owner,
            goal_account: fixture.goal,
            funding_mint,
            vault_authority: fixture.vault_authority,
            owner_token,
            vault_token,
            token_program: token::ID,
        }
        .to_account_metas(None);
        let data = if withdraw {
            crate::instruction::Withdraw { amount }.data()
        } else {
            crate::instruction::Deposit { amount }.data()
        };
        Instruction {
            program_id: PROGRAM_ID,
            accounts,
            data,
        }
    }

    fn goal_only_ix(owner: Pubkey, goal: Pubkey, action: &str) -> Instruction {
        let data = match action {
            "pause" => crate::instruction::PauseGoal {}.data(),
            "resume" => crate::instruction::ResumeGoal {}.data(),
            "cancel" => crate::instruction::CancelGoal {}.data(),
            _ => panic!("unknown goal action"),
        };
        Instruction {
            program_id: PROGRAM_ID,
            accounts: crate::accounts::GoalOnly {
                owner,
                goal_account: goal,
            }
            .to_account_metas(None),
            data,
        }
    }

    fn close_goal_ix(owner: Pubkey, fixture: &GoalFixture, vault_token: Pubkey) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: crate::accounts::CloseGoal {
                owner,
                goal_account: fixture.goal,
                vault_authority: fixture.vault_authority,
                vault_token,
                token_program: token::ID,
            }
            .to_account_metas(None),
            data: crate::instruction::CloseGoal {}.data(),
        }
    }

    #[test]
    fn create_goal_initializes_state_and_zero_balance_vault() {
        let mut env = TestEnv::new();
        let expected_created_at = env.svm.get_sysvar::<Clock>().unix_timestamp;
        let fixture = env.create_goal(41, 100 * TOKEN);

        let goal = goal_account(&env.svm, fixture.goal);
        assert_eq!(goal.owner, env.owner.pubkey());
        assert_eq!(goal.goal_id, 41);
        assert_eq!(goal.funding_mint, env.mint);
        assert_eq!(goal.vault_token, fixture.vault_token);
        assert_eq!(goal.maximum_budget, 100 * TOKEN);
        assert!(goal.status == GoalStatus::Active);
        assert_eq!(goal.created_at, expected_created_at);
        assert_eq!(goal.bump, fixture.goal_bump);

        let vault = token_account(&env.svm, fixture.vault_token);
        assert_eq!(vault.mint, env.mint);
        assert_eq!(vault.owner, fixture.vault_authority);
        assert_eq!(vault.amount, 0);
    }

    #[test]
    fn deposit_partial_and_full_withdraw_update_exact_balances() {
        let mut env = TestEnv::new();
        let fixture = env.create_goal(1, 100 * TOKEN);
        let original_owner_balance = token_balance(&env.svm, env.owner_token);

        let deposit = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            80 * TOKEN,
            false,
        );
        send_ix(&mut env.svm, deposit, &env.owner, &[]).unwrap();
        assert_eq!(
            token_balance(&env.svm, env.owner_token),
            original_owner_balance - 80 * TOKEN
        );
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 80 * TOKEN);
        let goal = goal_account(&env.svm, fixture.goal);
        assert_eq!(goal.maximum_budget, 100 * TOKEN);
        assert!(goal.status == GoalStatus::Active);

        let partial = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            30 * TOKEN,
            true,
        );
        send_ix(&mut env.svm, partial, &env.owner, &[]).unwrap();
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 50 * TOKEN);
        assert_eq!(
            token_balance(&env.svm, env.owner_token),
            original_owner_balance - 50 * TOKEN
        );

        let full = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            50 * TOKEN,
            true,
        );
        send_ix(&mut env.svm, full, &env.owner, &[]).unwrap();
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 0);
        assert_eq!(
            token_balance(&env.svm, env.owner_token),
            original_owner_balance
        );
    }

    #[test]
    fn amount_validation_failures_preserve_state() {
        let mut env = TestEnv::new();
        let (zero_goal, _) = goal_pda(&env.owner.pubkey(), 90);
        let (zero_authority, _) = vault_authority_pda(&zero_goal);
        let zero_vault = Keypair::new();
        let zero_budget = create_goal_ix(
            env.owner.pubkey(),
            env.mint,
            zero_goal,
            zero_authority,
            zero_vault.pubkey(),
            90,
            0,
        );
        assert_custom_error(
            send_ix(&mut env.svm, zero_budget, &env.owner, &[&zero_vault]),
            INVALID_MAXIMUM_BUDGET,
        );
        assert!(env.svm.get_account(&zero_goal).is_none());
        assert!(env.svm.get_account(&zero_vault.pubkey()).is_none());

        let fixture = env.create_goal(91, 100 * TOKEN);
        let owner_before = token_balance(&env.svm, env.owner_token);
        let zero_deposit = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            0,
            false,
        );
        assert_custom_error(
            send_ix(&mut env.svm, zero_deposit, &env.owner, &[]),
            INVALID_AMOUNT,
        );

        let zero_withdraw = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            0,
            true,
        );
        assert_custom_error(
            send_ix(&mut env.svm, zero_withdraw, &env.owner, &[]),
            INVALID_AMOUNT,
        );

        let excessive_withdraw = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            1,
            true,
        );
        assert_custom_error(
            send_ix(&mut env.svm, excessive_withdraw, &env.owner, &[]),
            INSUFFICIENT_FUNDS,
        );
        assert_eq!(token_balance(&env.svm, env.owner_token), owner_before);
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 0);
        assert!(goal_account(&env.svm, fixture.goal).status == GoalStatus::Active);
    }

    #[test]
    fn budget_is_current_balance_based_and_addition_overflow_fails_safely() {
        let mut env = TestEnv::new();
        let fixture = env.create_goal(2, 100 * TOKEN);
        let owner_before = token_balance(&env.svm, env.owner_token);

        for (amount, withdraw, expected_vault) in [
            (80 * TOKEN, false, 80 * TOKEN),
            (30 * TOKEN, true, 50 * TOKEN),
            (40 * TOKEN, false, 90 * TOKEN),
        ] {
            let ix = token_action_ix(
                env.owner.pubkey(),
                &fixture,
                env.mint,
                env.owner_token,
                fixture.vault_token,
                amount,
                withdraw,
            );
            send_ix(&mut env.svm, ix, &env.owner, &[]).unwrap();
            assert_eq!(token_balance(&env.svm, fixture.vault_token), expected_vault);
        }

        for amount in [21 * TOKEN, 11 * TOKEN] {
            let vault_before = token_balance(&env.svm, fixture.vault_token);
            let owner_snapshot = token_balance(&env.svm, env.owner_token);
            let ix = token_action_ix(
                env.owner.pubkey(),
                &fixture,
                env.mint,
                env.owner_token,
                fixture.vault_token,
                amount,
                false,
            );
            assert_custom_error(
                send_ix(&mut env.svm, ix, &env.owner, &[]),
                MAXIMUM_BUDGET_EXCEEDED,
            );
            assert_eq!(token_balance(&env.svm, fixture.vault_token), vault_before);
            assert_eq!(token_balance(&env.svm, env.owner_token), owner_snapshot);
        }
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 90 * TOKEN);
        assert_eq!(
            token_balance(&env.svm, env.owner_token),
            owner_before - 90 * TOKEN
        );

        let overflow_fixture = env.create_goal(3, u64::MAX);
        set_token_amount(&mut env.svm, overflow_fixture.vault_token, u64::MAX);
        let owner_snapshot = token_balance(&env.svm, env.owner_token);
        let overflow = token_action_ix(
            env.owner.pubkey(),
            &overflow_fixture,
            env.mint,
            env.owner_token,
            overflow_fixture.vault_token,
            1,
            false,
        );
        assert_custom_error(
            send_ix(&mut env.svm, overflow, &env.owner, &[]),
            AMOUNT_OVERFLOW,
        );
        assert_eq!(
            token_balance(&env.svm, overflow_fixture.vault_token),
            u64::MAX
        );
        assert_eq!(token_balance(&env.svm, env.owner_token), owner_snapshot);
    }

    #[test]
    fn wrong_mint_source_and_destination_are_rejected() {
        let mut env = TestEnv::new();
        let fixture = env.create_goal(4, 100 * TOKEN);
        let owner_primary_before = token_balance(&env.svm, env.owner_token);
        let owner_wrong_before = token_balance(&env.svm, env.owner_wrong_token);

        let wrong_deposit = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_wrong_token,
            fixture.vault_token,
            10 * TOKEN,
            false,
        );
        assert!(send_ix(&mut env.svm, wrong_deposit, &env.owner, &[]).is_err());
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 0);
        assert_eq!(
            token_balance(&env.svm, env.owner_wrong_token),
            owner_wrong_before
        );

        let valid_deposit = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            10 * TOKEN,
            false,
        );
        send_ix(&mut env.svm, valid_deposit, &env.owner, &[]).unwrap();

        let wrong_withdraw = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_wrong_token,
            fixture.vault_token,
            TOKEN,
            true,
        );
        assert!(send_ix(&mut env.svm, wrong_withdraw, &env.owner, &[]).is_err());
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 10 * TOKEN);
        assert_eq!(
            token_balance(&env.svm, env.owner_token),
            owner_primary_before - 10 * TOKEN
        );
        assert_eq!(
            token_balance(&env.svm, env.owner_wrong_token),
            owner_wrong_before
        );

        let wrong_funding_mint = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.wrong_mint,
            env.owner_wrong_token,
            fixture.vault_token,
            TOKEN,
            false,
        );
        assert!(send_ix(&mut env.svm, wrong_funding_mint, &env.owner, &[]).is_err());
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 10 * TOKEN);
    }

    #[test]
    fn attacker_cannot_perform_financial_state_or_close_actions() {
        let mut env = TestEnv::new();
        let fixture = env.create_goal(5, 100 * TOKEN);
        let deposit = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            10 * TOKEN,
            false,
        );
        send_ix(&mut env.svm, deposit, &env.owner, &[]).unwrap();
        let owner_before = token_balance(&env.svm, env.owner_token);
        let attacker_before = token_balance(&env.svm, env.attacker_token);

        let attacker_withdraw = token_action_ix(
            env.attacker.pubkey(),
            &fixture,
            env.mint,
            env.attacker_token,
            fixture.vault_token,
            TOKEN,
            true,
        );
        assert!(send_ix(&mut env.svm, attacker_withdraw, &env.attacker, &[]).is_err());
        assert!(send_ix(
            &mut env.svm,
            goal_only_ix(env.attacker.pubkey(), fixture.goal, "pause"),
            &env.attacker,
            &[],
        )
        .is_err());

        send_ix(
            &mut env.svm,
            goal_only_ix(env.owner.pubkey(), fixture.goal, "pause"),
            &env.owner,
            &[],
        )
        .unwrap();
        assert!(send_ix(
            &mut env.svm,
            goal_only_ix(env.attacker.pubkey(), fixture.goal, "resume"),
            &env.attacker,
            &[],
        )
        .is_err());
        send_ix(
            &mut env.svm,
            goal_only_ix(env.owner.pubkey(), fixture.goal, "resume"),
            &env.owner,
            &[],
        )
        .unwrap();

        assert!(send_ix(
            &mut env.svm,
            goal_only_ix(env.attacker.pubkey(), fixture.goal, "cancel"),
            &env.attacker,
            &[],
        )
        .is_err());
        assert!(send_ix(
            &mut env.svm,
            close_goal_ix(env.attacker.pubkey(), &fixture, fixture.vault_token),
            &env.attacker,
            &[],
        )
        .is_err());

        assert_eq!(token_balance(&env.svm, env.owner_token), owner_before);
        assert_eq!(token_balance(&env.svm, env.attacker_token), attacker_before);
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 10 * TOKEN);
        assert!(goal_account(&env.svm, fixture.goal).status == GoalStatus::Active);
    }

    #[test]
    fn vault_substitution_cross_goal_isolation_and_duplicate_goal_are_enforced() {
        let mut env = TestEnv::new();
        let goal_a = env.create_goal(10, 100 * TOKEN);
        let goal_b = env.create_goal(11, 100 * TOKEN);
        assert_ne!(goal_a.goal, goal_b.goal);
        assert_ne!(goal_a.vault_authority, goal_b.vault_authority);
        assert_ne!(goal_a.vault_token, goal_b.vault_token);

        let deposit_a = token_action_ix(
            env.owner.pubkey(),
            &goal_a,
            env.mint,
            env.owner_token,
            goal_a.vault_token,
            10 * TOKEN,
            false,
        );
        send_ix(&mut env.svm, deposit_a, &env.owner, &[]).unwrap();
        assert_eq!(token_balance(&env.svm, goal_a.vault_token), 10 * TOKEN);
        assert_eq!(token_balance(&env.svm, goal_b.vault_token), 0);

        let cross_goal = token_action_ix(
            env.owner.pubkey(),
            &goal_a,
            env.mint,
            env.owner_token,
            goal_b.vault_token,
            TOKEN,
            false,
        );
        assert_custom_error(
            send_ix(&mut env.svm, cross_goal, &env.owner, &[]),
            INVALID_VAULT_TOKEN,
        );

        let substitute = Pubkey::new_unique();
        set_token_account(
            &mut env.svm,
            substitute,
            env.mint,
            goal_a.vault_authority,
            0,
        );
        let substitute_deposit = token_action_ix(
            env.owner.pubkey(),
            &goal_a,
            env.mint,
            env.owner_token,
            substitute,
            TOKEN,
            false,
        );
        assert_custom_error(
            send_ix(&mut env.svm, substitute_deposit, &env.owner, &[]),
            INVALID_VAULT_TOKEN,
        );
        assert_custom_error(
            send_ix(
                &mut env.svm,
                close_goal_ix(env.owner.pubkey(), &goal_a, substitute),
                &env.owner,
                &[],
            ),
            INVALID_VAULT_TOKEN,
        );
        assert!(env.svm.get_account(&goal_a.goal).is_some());
        assert_eq!(token_balance(&env.svm, goal_a.vault_token), 10 * TOKEN);
        assert_eq!(token_balance(&env.svm, goal_b.vault_token), 0);

        let duplicate_vault = Keypair::new();
        let duplicate = create_goal_ix(
            env.owner.pubkey(),
            env.mint,
            goal_a.goal,
            goal_a.vault_authority,
            duplicate_vault.pubkey(),
            10,
            200 * TOKEN,
        );
        assert!(send_ix(&mut env.svm, duplicate, &env.owner, &[&duplicate_vault]).is_err());
        let original = goal_account(&env.svm, goal_a.goal);
        assert_eq!(original.maximum_budget, 100 * TOKEN);
        assert_eq!(original.vault_token, goal_a.vault_token);
        assert_eq!(token_balance(&env.svm, goal_a.vault_token), 10 * TOKEN);
    }

    #[test]
    fn status_transitions_and_cancelled_fund_recovery_are_safe() {
        let mut env = TestEnv::new();
        let fixture = env.create_goal(20, 100 * TOKEN);
        let owner_start = token_balance(&env.svm, env.owner_token);
        let deposit = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            25 * TOKEN,
            false,
        );
        send_ix(&mut env.svm, deposit, &env.owner, &[]).unwrap();

        assert_custom_error(
            send_ix(
                &mut env.svm,
                goal_only_ix(env.owner.pubkey(), fixture.goal, "resume"),
                &env.owner,
                &[],
            ),
            INVALID_STATUS,
        );
        send_ix(
            &mut env.svm,
            goal_only_ix(env.owner.pubkey(), fixture.goal, "pause"),
            &env.owner,
            &[],
        )
        .unwrap();
        assert!(goal_account(&env.svm, fixture.goal).status == GoalStatus::Paused);
        assert_custom_error(
            send_ix(
                &mut env.svm,
                goal_only_ix(env.owner.pubkey(), fixture.goal, "pause"),
                &env.owner,
                &[],
            ),
            INVALID_STATUS,
        );

        let paused_deposit = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            TOKEN,
            false,
        );
        assert_custom_error(
            send_ix(&mut env.svm, paused_deposit, &env.owner, &[]),
            GOAL_NOT_ACTIVE,
        );

        let paused_withdraw = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            5 * TOKEN,
            true,
        );
        send_ix(&mut env.svm, paused_withdraw, &env.owner, &[]).unwrap();
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 20 * TOKEN);

        send_ix(
            &mut env.svm,
            goal_only_ix(env.owner.pubkey(), fixture.goal, "resume"),
            &env.owner,
            &[],
        )
        .unwrap();
        assert!(goal_account(&env.svm, fixture.goal).status == GoalStatus::Active);
        send_ix(
            &mut env.svm,
            goal_only_ix(env.owner.pubkey(), fixture.goal, "cancel"),
            &env.owner,
            &[],
        )
        .unwrap();
        assert!(goal_account(&env.svm, fixture.goal).status == GoalStatus::Cancelled);

        assert_custom_error(
            send_ix(
                &mut env.svm,
                goal_only_ix(env.owner.pubkey(), fixture.goal, "resume"),
                &env.owner,
                &[],
            ),
            INVALID_STATUS,
        );
        assert_custom_error(
            send_ix(
                &mut env.svm,
                goal_only_ix(env.owner.pubkey(), fixture.goal, "cancel"),
                &env.owner,
                &[],
            ),
            INVALID_STATUS,
        );
        let cancelled_deposit = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            TOKEN,
            false,
        );
        assert_custom_error(
            send_ix(&mut env.svm, cancelled_deposit, &env.owner, &[]),
            GOAL_NOT_ACTIVE,
        );

        let recover = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            20 * TOKEN,
            true,
        );
        send_ix(&mut env.svm, recover, &env.owner, &[]).unwrap();
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 0);
        assert_eq!(token_balance(&env.svm, env.owner_token), owner_start);
        assert!(goal_account(&env.svm, fixture.goal).status == GoalStatus::Cancelled);

        let paused_cancel = env.create_goal(21, 100 * TOKEN);
        send_ix(
            &mut env.svm,
            goal_only_ix(env.owner.pubkey(), paused_cancel.goal, "pause"),
            &env.owner,
            &[],
        )
        .unwrap();
        send_ix(
            &mut env.svm,
            goal_only_ix(env.owner.pubkey(), paused_cancel.goal, "cancel"),
            &env.owner,
            &[],
        )
        .unwrap();
        assert!(goal_account(&env.svm, paused_cancel.goal).status == GoalStatus::Cancelled);
    }

    #[test]
    fn close_requires_empty_vault_rejects_attacker_and_closes_both_accounts() {
        let mut env = TestEnv::new();
        let fixture = env.create_goal(30, 100 * TOKEN);
        let deposit = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            12 * TOKEN,
            false,
        );
        send_ix(&mut env.svm, deposit, &env.owner, &[]).unwrap();

        assert_custom_error(
            send_ix(
                &mut env.svm,
                close_goal_ix(env.owner.pubkey(), &fixture, fixture.vault_token),
                &env.owner,
                &[],
            ),
            VAULT_NOT_EMPTY,
        );
        assert!(env.svm.get_account(&fixture.goal).is_some());
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 12 * TOKEN);

        let withdraw = token_action_ix(
            env.owner.pubkey(),
            &fixture,
            env.mint,
            env.owner_token,
            fixture.vault_token,
            12 * TOKEN,
            true,
        );
        send_ix(&mut env.svm, withdraw, &env.owner, &[]).unwrap();
        assert_eq!(token_balance(&env.svm, fixture.vault_token), 0);

        assert!(send_ix(
            &mut env.svm,
            close_goal_ix(env.attacker.pubkey(), &fixture, fixture.vault_token),
            &env.attacker,
            &[],
        )
        .is_err());
        assert!(env.svm.get_account(&fixture.goal).is_some());
        assert!(env.svm.get_account(&fixture.vault_token).is_some());

        let owner_lamports_before = env.svm.get_balance(&env.owner.pubkey()).unwrap();
        send_ix(
            &mut env.svm,
            close_goal_ix(env.owner.pubkey(), &fixture, fixture.vault_token),
            &env.owner,
            &[],
        )
        .unwrap();
        assert!(env.svm.get_account(&fixture.goal).is_none());
        assert!(env.svm.get_account(&fixture.vault_token).is_none());
        assert!(env.svm.get_balance(&env.owner.pubkey()).unwrap() > owner_lamports_before);
    }
}
