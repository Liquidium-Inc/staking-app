export const idlFactory: import('@dfinity/candid').IDL.InterfaceFactory = ({ IDL }) => {
  const FingerprintInfo = IDL.Record({ fingerprint: IDL.Text });
  const PoolInfo = IDL.Record({
    xpub: IDL.Text,
    address: IDL.Text,
    fingerprint: IDL.Text,
    index: IDL.Nat32,
  });
  const UnstakeRecord = IDL.Record({
    utxo: IDL.Text,
    user_address: IDL.Text,
    timestamp: IDL.Nat64,
    rune_amount: IDL.Nat,
  });
  const UnstakeUtxo = IDL.Record({
    utxo: IDL.Text,
    prev_utxos: IDL.Vec(IDL.Text),
    timestamp: IDL.Nat64,
  });
  const Result_1 = IDL.Variant({
    Ok: IDL.Tuple(IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat)),
    Err: IDL.Text,
  });
  return IDL.Service({
    get_exchange_rate: IDL.Func([], [IDL.Variant({ Ok: IDL.Float64, Err: IDL.Text })], []),
    get_exchange_rate_components: IDL.Func([], [Result_1], ['query']),
    get_fingerprint: IDL.Func([IDL.Opt(IDL.Nat32)], [FingerprintInfo], []),
    get_pool: IDL.Func([IDL.Opt(IDL.Nat32)], [PoolInfo], []),
    get_pool_address: IDL.Func([IDL.Opt(IDL.Nat32)], [IDL.Text], []),
    get_recent_unstake_records: IDL.Func([], [IDL.Vec(UnstakeRecord)], ['query']),
    get_user_latest_unstake_record: IDL.Func([IDL.Text], [IDL.Opt(UnstakeRecord)], ['query']),
    get_unstake_utxos: IDL.Func([], [IDL.Vec(UnstakeUtxo)], ['query']),
    get_xpub: IDL.Func([IDL.Opt(IDL.Nat32)], [IDL.Text], []),
    stake: IDL.Func([IDL.Text], [IDL.Text], []),
    unstake: IDL.Func([IDL.Text], [IDL.Text], []),
    update_exchange_rate: IDL.Func(
      [IDL.Nat64, IDL.Nat64],
      [IDL.Variant({ Ok: IDL.Null, Err: IDL.Text })],
      [],
    ),
    withdraw: IDL.Func([IDL.Text], [IDL.Text], []),
  });
};
