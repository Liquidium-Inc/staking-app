import { describe, test, expect, vi, afterEach } from 'vitest';

import { BIS } from './bestinslot';

const axios = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('axios', () => ({
  default: { create: vi.fn(() => axios) },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('BIS.runes.ticker (getRuneTicker)', () => {
  test('should fetch rune ticker info by rune_id', async () => {
    const mockResponse = {
      data: {
        rune_id: 'abc123',
        rune_number: '1',
        rune_name: 'TEST',
        spaced_rune_name: 'T E S T',
        symbol: 'TST',
        decimals: 8,
        per_mint_amount: '1000',
        mint_cnt: '10',
        mint_cnt_limit: '100',
        premined_supply: '10000',
        total_minted_supply: '20000',
        burned_supply: '1000',
        circulating_supply: '19000',
        mint_progress: 0.2,
        mint_start_block: null,
        mint_end_block: null,
        genesis_block: 123456,
        deploy_ts: '2024-01-01T00:00:00Z',
        deploy_txid: 'txid123',
        auto_upgrade: false,
        holder_count: 10,
        event_count: 5,
        mintable: true,
        icon_inscr_ib: null,
        icon_delegate_id: null,
        icon_content_url: null,
        icon_render_url: null,
        avg_unit_price_in_sats: 100,
        min_listed_unit_price_in_sats: 90,
        min_listed_unit_price_unisat: 80,
        listed_supply: 1000,
        listed_supply_ratio: 0.05,
        marketcap: 100000,
        total_sale_info: {
          sale_count: 1,
          sale_count_3h: 1,
          sale_count_6h: 1,
          sale_count_9h: 1,
          sale_count_12h: 1,
          sale_count_1d: 1,
          sale_count_3d: 1,
          sale_count_7d: 1,
          sale_count_30d: 1,
          sale_amount: 1000,
          vol_3h: 10,
          vol_6h: 20,
          vol_9h: 30,
          vol_12h: 40,
          vol_1d: 50,
          vol_3d: 60,
          vol_7d: 70,
          vol_30d: 80,
          vol_total: 100,
        },
      },
      block_height: 999999,
    };

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const params = { rune_id: 'abc123' };
    const data = await BIS.runes.ticker(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/runes/ticker_info', { params });
    expect(data).toEqual(mockResponse);
    expect(data.data.rune_id).toBe('abc123');
    expect(data.data.rune_name).toBe('TEST');
    expect(data.block_height).toBe(999999);
  });

  test('should fetch rune ticker info by rune_name', async () => {
    const mockResponse = {
      data: {
        rune_id: 'def456',
        rune_number: '2',
        rune_name: 'FOO',
        spaced_rune_name: 'F O O',
        symbol: 'FOO',
        decimals: 6,
        per_mint_amount: '500',
        mint_cnt: '5',
        mint_cnt_limit: '50',
        premined_supply: '5000',
        total_minted_supply: '10000',
        burned_supply: '500',
        circulating_supply: '9500',
        mint_progress: 0.1,
        mint_start_block: 100000,
        mint_end_block: 200000,
        genesis_block: 654321,
        deploy_ts: '2024-02-01T00:00:00Z',
        deploy_txid: 'txid456',
        auto_upgrade: true,
        holder_count: 5,
        event_count: 2,
        mintable: false,
        icon_inscr_ib: null,
        icon_delegate_id: null,
        icon_content_url: null,
        icon_render_url: null,
        avg_unit_price_in_sats: null,
        min_listed_unit_price_in_sats: null,
        min_listed_unit_price_unisat: null,
        listed_supply: 500,
        listed_supply_ratio: 0.1,
        marketcap: null,
        total_sale_info: {
          sale_count: 0,
          sale_count_3h: 0,
          sale_count_6h: 0,
          sale_count_9h: 0,
          sale_count_12h: 0,
          sale_count_1d: 0,
          sale_count_3d: 0,
          sale_count_7d: 0,
          sale_count_30d: 0,
          sale_amount: 0,
          vol_3h: 0,
          vol_6h: 0,
          vol_9h: 0,
          vol_12h: 0,
          vol_1d: 0,
          vol_3d: 0,
          vol_7d: 0,
          vol_30d: 0,
          vol_total: 0,
        },
      },
      block_height: 888888,
    };

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const params = { rune_name: 'FOO' };
    const data = await BIS.runes.ticker(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/runes/ticker_info', { params });
    expect(data).toEqual(mockResponse);
    expect(data.data.rune_id).toBe('def456');
    expect(data.data.rune_name).toBe('FOO');
    expect(data.block_height).toBe(888888);
  });

  test('should throw if API call fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('API error'));
    const params = { rune_id: 'fail' };
    await expect(BIS.runes.ticker(params)).rejects.toThrow('API error');
  });
});

describe('BIS.runes.walletBalances (getWalletBalances)', () => {
  test('should fetch wallet balances with address', async () => {
    const mockResponse = {
      data: [
        {
          pkscript: '0014abcd',
          wallet_addr: 'bc1qxyz',
          rune_id: 'rune1',
          total_balance: '1000',
          rune_name: 'RUNE1',
          spaced_rune_name: 'R U N E 1',
          decimals: 8,
          avg_unit_price_in_sats: 100,
          min_listed_unit_price_in_sats: 90,
          min_listed_unit_price_unisat: 80,
        },
      ],
      block_height: 123456,
    };

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const params = { address: 'bc1qxyz' };
    const data = await BIS.runes.walletBalances(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/runes/wallet_balances', { params });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].wallet_addr).toBe('bc1qxyz');
    expect(data.data[0].rune_id).toBe('rune1');
    expect(data.block_height).toBe(123456);
  });

  test('should fetch wallet balances with pkscript and custom sort', async () => {
    const mockResponse = {
      data: [
        {
          pkscript: '0014efgh',
          wallet_addr: 'bc1qabc',
          rune_id: 'rune2',
          total_balance: '500',
          rune_name: 'RUNE2',
          spaced_rune_name: 'R U N E 2',
          decimals: 6,
          avg_unit_price_in_sats: 200,
          min_listed_unit_price_in_sats: 180,
          min_listed_unit_price_unisat: 170,
        },
      ],
      block_height: 654321,
    };

    const params = {
      pkscript: '0014efgh',
      sort_by: 'total_balance',
      order: 'desc',
      offset: 5,
      count: 2,
    } as const;

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const data = await BIS.runes.walletBalances(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/runes/wallet_balances', { params });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].pkscript).toBe('0014efgh');
    expect(data.data[0].rune_id).toBe('rune2');
    expect(data.block_height).toBe(654321);
  });

  test('should throw if API call fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('API error'));
    const params = { address: 'bc1qfail' };
    await expect(BIS.runes.walletBalances(params)).rejects.toThrow('API error');
  });
});

describe('BIS.runes.holders (getRuneHolders)', () => {
  test('should fetch rune holders with default params', async () => {
    const mockResponse = {
      data: [
        {
          pkscript: '0014abcd',
          wallet_addr: 'bc1qholder',
          rune_id: 'rune1',
          total_balance: '1000',
          rune_name: 'RUNE1',
          spaced_rune_name: 'R U N E 1',
          decimals: 8,
        },
        {
          pkscript: '0014efgh',
          wallet_addr: 'bc1qholder2',
          rune_id: 'rune1',
          total_balance: '500',
          rune_name: 'RUNE1',
          spaced_rune_name: 'R U N E 1',
          decimals: 8,
        },
      ],
      block_height: 123456,
    };

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const params = { rune_id: 'rune1' };
    const data = await BIS.runes.holders(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/runes/holders', {
      params: { ...params, sort_by: 'balance', order: 'desc', offset: 0, count: 100 },
    });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].wallet_addr).toBe('bc1qholder');
    expect(data.data[1].total_balance).toBe('500');
    expect(data.block_height).toBe(123456);
  });

  test('should fetch rune holders with custom sort and count', async () => {
    const mockResponse = {
      data: [
        {
          pkscript: '0014ijkl',
          wallet_addr: 'bc1qcustom',
          rune_id: 'rune2',
          total_balance: '2000',
          rune_name: 'RUNE2',
          spaced_rune_name: 'R U N E 2',
          decimals: 6,
        },
      ],
      block_height: 654321,
    };

    const params = {
      rune_name: 'RUNE2',
      sort_by: 'balance',
      order: 'asc',
      offset: 10,
      count: 5,
    } as const;

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const data = await BIS.runes.holders(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/runes/holders', { params });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].wallet_addr).toBe('bc1qcustom');
    expect(data.data[0].rune_id).toBe('rune2');
    expect(data.block_height).toBe(654321);
  });

  test('should throw if API call fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('API error'));
    const params = { rune_number: 1 };
    await expect(BIS.runes.holders(params)).rejects.toThrow('API error');
  });
});

describe('BIS.runes.walletActivity (getRunesActivity)', () => {
  test('should fetch runes activity with default params', async () => {
    const mockResponse = {
      data: [
        {
          event_type: 'output',
          txid: 'txid1',
          outpoint: 'outpoint1',
          pkscript: '0014abcd',
          wallet_addr: 'bc1qxyz',
          rune_id: 'rune1',
          amount: '100',
          block_height: 123456,
          block_timestamp: '2024-01-01T00:00:00Z',
          rune_name: 'RUNE1',
          spaced_rune_name: 'R U N E 1',
          decimals: 8,
          sale_info: null,
          icon_content_url: 'https://icon.url/1',
          icon_render_url: null,
        },
      ],
      block_height: 123456,
    };

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const params = { address: 'bc1qxyz' };
    const data = await BIS.runes.walletActivity(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/runes/wallet_activity', {
      params: {
        ...params,
        sort_by: 'ts',
        order: 'desc',
        offset: 0,
        count: 2000,
        runes_filter_only_wallet: true,
      },
    });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].wallet_addr).toBe('bc1qxyz');
    expect(data.data[0].event_type).toBe('output');
    expect(data.block_height).toBe(123456);
  });

  test('should fetch runes activity with custom params', async () => {
    const mockResponse = {
      data: [
        {
          event_type: 'mint',
          txid: 'txid2',
          outpoint: 'outpoint2',
          pkscript: '0014efgh',
          wallet_addr: 'bc1qabc',
          rune_id: 'rune2',
          amount: '500',
          block_height: 654321,
          block_timestamp: '2024-02-01T00:00:00Z',
          rune_name: 'RUNE2',
          spaced_rune_name: 'R U N E 2',
          decimals: 6,
          sale_info: {
            sale_price: 1000,
            sold_to_pkscript: '0014ijkl',
            sold_to_wallet_addr: 'bc1qsold',
            marketplace: 'unisat',
          },
          icon_content_url: 'https://icon.url/2',
          icon_render_url: null,
        },
      ],
      block_height: 654321,
    };

    const params = {
      pkscript: '0014efgh',
      rune_id: 'rune2',
      sort_by: 'ts',
      order: 'asc',
      offset: 10,
      count: 5,
      runes_filter_only_wallet: false,
    } as const;

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const data = await BIS.runes.walletActivity(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/runes/wallet_activity', {
      params,
    });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].wallet_addr).toBe('bc1qabc');
    expect(data.data[0].event_type).toBe('mint');
    expect(data.data[0].sale_info?.marketplace).toBe('unisat');
    expect(data.block_height).toBe(654321);
  });

  test('should throw if API call fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('API error'));
    const params = { address: 'bc1qfail' };
    await expect(BIS.runes.walletActivity(params)).rejects.toThrow('API error');
  });
});

describe('BIS.mempool.runicUTXOs (getMempoolRunicUTXOs)', () => {
  test('should fetch mempool runic UTXOs for a wallet', async () => {
    const mockResponse = {
      data: [
        {
          txid: 'txid123',
          vout: 0,
          block_height: 123456,
          value: '10000',
          address: 'bc1qwallet',
          script: '0014abcd',
          script_type: 'witness_v0_keyhash',
          inscriptions_ids: ['insc1', 'insc2'],
          satpoints: null,
          rune_ids: ['rune1', 'rune2'],
          amounts: ['100', '200'],
          txfee: null,
          vsize: null,
          utxo: 'txid123:0',
        },
      ],
      block_height: 123456,
    };

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const params = { wallet_addr: 'bc1qwallet' };
    const data = await BIS.mempool.runicUTXOs(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/mempool/runic_utxos_of_wallet', { params });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].address).toBe('bc1qwallet');
    expect(data.data[0].rune_ids).toEqual(['rune1', 'rune2']);
    expect(data.block_height).toBe(123456);
  });

  test('should fetch mempool runic UTXOs with null fields', async () => {
    const mockResponse = {
      data: [
        {
          txid: 'txid456',
          vout: 1,
          block_height: null,
          value: '5000',
          address: 'bc1qnull',
          script: '0014efgh',
          script_type: 'witness_v0_keyhash',
          inscriptions_ids: null,
          satpoints: null,
          rune_ids: null,
          amounts: [],
          txfee: null,
          vsize: null,
          utxo: 'txid456:1',
        },
      ],
      block_height: null,
    };

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const params = { wallet_addr: 'bc1qnull' };
    const data = await BIS.mempool.runicUTXOs(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/mempool/runic_utxos_of_wallet', { params });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].address).toBe('bc1qnull');
    expect(data.data[0].rune_ids).toBeNull();
    expect(data.block_height).toBeNull();
  });

  test('should throw if API call fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('API error'));
    const params = { wallet_addr: 'bc1qfail' };
    await expect(BIS.mempool.runicUTXOs(params)).rejects.toThrow('API error');
  });
});

describe('BIS.mempool.cardinalUTXOs (getMempoolCardinalUTXOs)', () => {
  test('should fetch mempool cardinal UTXOs for a wallet', async () => {
    const mockResponse = {
      data: [
        {
          txid: 'txid789',
          vout: 2,
          block_height: 222222,
          value: '15000',
          address: 'bc1qcardinal',
          script: '0014card',
          script_type: 'witness_v0_keyhash',
          inscriptions_ids: null,
          satpoints: null,
          rune_ids: null,
          amounts: null,
          txfee: null,
          vsize: null,
          utxo: 'txid789:2',
        },
      ],
      block_height: 222222,
    };

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const params = { wallet_addr: 'bc1qcardinal' };
    const data = await BIS.mempool.cardinalUTXOs(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/mempool/cardinal_utxos_of_wallet', { params });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].address).toBe('bc1qcardinal');
    expect(data.data[0].inscriptions_ids).toBeNull();
    expect(data.data[0].amounts).toBeNull();
    expect(data.block_height).toBe(222222);
  });

  test('should fetch mempool cardinal UTXOs with null block_height', async () => {
    const mockResponse = {
      data: [
        {
          txid: 'txid000',
          vout: 3,
          block_height: null,
          value: '25000',
          address: 'bc1qnullcard',
          script: '0014null',
          script_type: 'witness_v0_keyhash',
          inscriptions_ids: null,
          satpoints: null,
          rune_ids: null,
          amounts: null,
          txfee: null,
          vsize: null,
          utxo: 'txid000:3',
        },
      ],
      block_height: null,
    };

    axios.get.mockResolvedValueOnce({ data: mockResponse });

    const params = { wallet_addr: 'bc1qnullcard' };
    const data = await BIS.mempool.cardinalUTXOs(params);

    expect(axios.get).toHaveBeenCalledWith('/v3/mempool/cardinal_utxos_of_wallet', { params });
    expect(data).toEqual(mockResponse);
    expect(data.data[0].address).toBe('bc1qnullcard');
    expect(data.block_height).toBeNull();
  });
});
