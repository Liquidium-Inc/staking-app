export const TelemetryScope = {
  StakeConfirm: 'stake_confirm',
  UnstakeConfirm: 'unstake_confirm',
  WithdrawConfirm: 'withdraw_confirm',
} as const;

export type TelemetryScope = (typeof TelemetryScope)[keyof typeof TelemetryScope];
