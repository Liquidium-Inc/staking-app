import { describe, it, expect, beforeEach } from 'vitest';

import { selectUtxos, selectRuneUtxos, type UTXO, type SelectionOptions } from './utxo-selection';

describe('UTXOSelector', () => {
  let mockRuneUtxos: UTXO[];

  beforeEach(() => {
    // Mock Rune UTXOs
    mockRuneUtxos = [
      {
        hash: 'rune_tx1',
        index: 0,
        value: BigInt(10000),
        address: 'addr1',
        runes: { 'RUNE•ID•1': BigInt(1000000) }, // 1M rune units
      },
      {
        hash: 'rune_tx2',
        index: 0,
        value: BigInt(10000),
        address: 'addr1',
        runes: { 'RUNE•ID•1': BigInt(500000) }, // 500K rune units
      },
      {
        hash: 'rune_tx3',
        index: 0,
        value: BigInt(10000),
        address: 'addr1',
        runes: { 'RUNE•ID•1': BigInt(2000000) }, // 2M rune units
      },
      {
        hash: 'rune_tx4',
        index: 0,
        value: BigInt(10000),
        address: 'addr1',
        runes: { 'RUNE•ID•1': BigInt(250000) }, // 250K rune units
      },
    ];
  });

  describe('Rune UTXO Selection', () => {
    it('should select rune UTXOs correctly', () => {
      const result = selectRuneUtxos(
        mockRuneUtxos,
        'RUNE•ID•1',
        BigInt(1500000), // 1.5M rune units
        10,
      );

      expect(result).not.toBeNull();
      expect(result!.selectedUtxos.length).toBe(1);
      expect(result!.selectedUtxos[0].hash).toBe('rune_tx3'); // Should select the 2M rune UTXO
      expect(result!.totalValue).toBe(BigInt(2000000));
      expect(result!.changeValue).toBe(BigInt(500000));
    });

    it('should combine multiple rune UTXOs when needed', () => {
      const result = selectRuneUtxos(
        mockRuneUtxos,
        'RUNE•ID•1',
        BigInt(3000000), // 3M rune units
        10,
      );

      expect(result).not.toBeNull();
      expect(result!.selectedUtxos.length).toBe(2);
      expect(result!.totalValue).toBe(BigInt(3000000)); // 2M + 1M
      expect(result!.changeValue).toBe(BigInt(0));
      expect(result!.efficiency).toBe(1.0);
    });

    it('should return null for non-existent rune', () => {
      const result = selectRuneUtxos(mockRuneUtxos, 'NON•EXISTENT•RUNE', BigInt(1000000), 10);

      expect(result).toBeNull();
    });
  });

  describe('Target-Aware Selection', () => {
    it('should prefer single UTXO when close to target', () => {
      const testUtxos: UTXO[] = [
        {
          hash: 'rune_tx1',
          index: 0,
          value: BigInt(10000),
          address: 'addr1',
          runes: { 'RUNE•ID•1': BigInt(1800000) }, // 1.8M rune units
        },
        {
          hash: 'rune_tx2',
          index: 0,
          value: BigInt(10000),
          address: 'addr1',
          runes: { 'RUNE•ID•1': BigInt(2000000) }, // 2M rune units
        },
      ];

      const result = selectRuneUtxos(
        testUtxos,
        'RUNE•ID•1',
        BigInt(1800000), // 1.8M rune units
        10,
      );

      expect(result).not.toBeNull();
      expect(result!.selectedUtxos.length).toBe(1);
      expect(result!.selectedUtxos[0].hash).toBe('rune_tx1'); // Should select exact match
      expect(result!.changeValue).toBe(BigInt(0));
    });

    it('should handle edge cases gracefully', () => {
      const emptyUtxos: UTXO[] = [];

      const result = selectRuneUtxos(emptyUtxos, 'RUNE•ID•1', BigInt(1000000), 10);

      expect(result).toBeNull();
    });
  });

  describe('UTXO Preprocessing', () => {
    it('should sort UTXOs by target fit', () => {
      const mixedUtxos: UTXO[] = [
        {
          hash: 'small1',
          index: 0,
          value: BigInt(10000),
          address: 'addr1',
          runes: {},
        },
        {
          hash: 'perfect1',
          index: 0,
          value: BigInt(50000), // Exactly matches target
          address: 'addr1',
          runes: {},
        },
        {
          hash: 'large1',
          index: 0,
          value: BigInt(200000),
          address: 'addr1',
          runes: {},
        },
      ];

      const options: SelectionOptions = {
        target: BigInt(50000),
        feeRate: 10,
        strategy: 'target_aware',
      };

      const result = selectUtxos(mixedUtxos, options);

      expect(result).not.toBeNull();
      expect(result!.selectedUtxos.length).toBe(1);
      expect(result!.selectedUtxos[0].hash).toBe('perfect1'); // Should select the perfect match
    });
  });

  describe('Performance Tests', () => {
    it('should handle large UTXO sets efficiently with target-aware filtering', () => {
      // Create a large set of UTXOs with varied sizes
      const largeUtxoSet: UTXO[] = Array.from({ length: 1000 }, (_, i) => ({
        hash: `tx_${i}`,
        index: 0,
        value: BigInt(Math.floor(Math.random() * 100000) + 10000),
        address: 'addr1',
        runes: {},
      }));

      const options: SelectionOptions = {
        target: BigInt(500000),
        feeRate: 10,
        strategy: 'target_aware',
        maxInputs: 10, // Conservative limit
      };

      const startTime = Date.now();
      const result = selectUtxos(largeUtxoSet, options);
      const endTime = Date.now();

      expect(result).not.toBeNull();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result!.selectedUtxos.length).toBeLessThanOrEqual(10);
      expect(result!.efficiency).toBeGreaterThan(0.7); // Should be efficient due to filtering
    });
  });
});
