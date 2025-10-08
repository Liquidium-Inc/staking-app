# Event tracking report

This document lists all PostHog events that have been automatically added to your Next.js application.

## Events by File

### src/app/(stake)/portfolio/page.tsx

- **portfolio_info_tooltip_opened**: User opened an informational tooltip on the portfolio page to learn more about a specific metric.

### src/app/(stake)/stake/page.tsx

- **stake_max_button_clicked**: User clicks the 'Max' button to fill the stake amount with their available balance.
- **stake_submitted**: User clicks the 'Stake' button to initiate a staking transaction.

### src/app/(stake)/unstake/page.tsx

- **unstake_max_amount_clicked**: User clicked the 'Max' button to fill the unstake amount with their available balance.
- **unstake_submitted**: User clicked the 'Unstake' button to initiate an unstaking transaction.

### src/components/cards/unstake.tsx

- **unstake_transaction_link_clicked**: Fired when a user clicks the external link to view the unstake transaction on a block explorer.
- **unstake_withdraw_clicked**: Fired when a user clicks the 'Withdraw' button to claim their unstaked assets after the cooldown period.

### src/components/layout/login-button.tsx

- **wallet_connection_attempt**: Fired when a user clicks on a wallet to connect. Tracks which wallet was chosen, whether it was installed, and the resulting action (connect or open install URL).

### src/components/layout/user-menu.tsx

- **user_menu_copy_address**: Fired when a user clicks the button to copy either their main wallet address or their payment address from the user menu popover.
- **user_menu_disconnect_wallet**: Fired when a user clicks the 'Disconnect' button in the user menu popover to disconnect their wallet.

### src/components/ui/fee-selector.tsx

- **fee_speed_selected**: Fired when a user selects a new transaction fee speed (slow, medium, or fast).

### src/hooks/api/useStakeMutation.ts

- **stake_successful**: Fired when the staking process completes successfully.
- **stake_failed**: Fired when any step in the staking process fails.

### src/hooks/api/useUnstakeMutation.ts

- **unstake_request_succeeded**: Fired when the user's request to unstake has been successfully processed and sent.
- **unstake_request_failed**: Fired when any step in the unstaking process fails, including transaction generation, signing, or submission.

### src/hooks/api/useWithdrawMutation.ts

- **withdrawal_initiated**: Fired when a user starts the withdrawal process.
- **withdrawal_succeeded**: Fired when the withdrawal transaction is successfully sent.
- **withdrawal_failed**: Fired when any step in the withdrawal process fails.

## Events still awaiting implementation

- (human: you can fill these in)

---

## Next Steps

1. Review the changes made to your files
2. Test that events are being captured correctly
3. Create insights and dashboards in PostHog
4. Make a list of events we missed above. Knock them out yourself, or give this file to an agent.

Learn more about what to measure with PostHog and why: https://posthog.com/docs/new-to-posthog/getting-hogpilled
