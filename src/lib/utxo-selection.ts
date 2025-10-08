import Decimal from 'decimal.js';

export interface UTXO {
  hash: string;
  index: number;
  value: bigint;
  address: string;
  publicKey?: string;
  block_height?: number;
  runes: Record<string, bigint>;
}

export interface SelectionResult {
  selectedUtxos: UTXO[];
  totalValue: bigint;
  totalInputCost: bigint;
  changeValue: bigint;
  efficiency: number; // ratio of target to total selected
}

export interface SelectionOptions {
  target: bigint;
  runeId?: string; // for rune-specific selection
  feeRate: number; // sats per vbyte
  strategy?:
    | 'branch_and_bound'
    | 'knapsack'
    | 'largest_first'
    | 'smallest_first'
    | 'target_aware'
    | 'best_strategy';
  maxInputs?: number;
  dustThreshold?: bigint;
  costOfChange?: bigint; // cost of creating a change output
}

export class UTXOSelector {
  private static readonly INPUT_SIZE = 148; // average input size in vbytes
  private static readonly OUTPUT_SIZE = 34; // average output size in vbytes

  constructor(
    private utxos: UTXO[],
    private options: SelectionOptions,
  ) {
    this.preprocessUtxos();
  }

  /**
   * Preprocess UTXOs to sort optimally by target fit
   */
  private preprocessUtxos(): void {
    this.utxos = this.utxos.sort((a, b) => this.compareUtxosByTargetFit(a, b));
  }

  /**
   * Compare UTXOs by how well they fit the target amount
   */
  private compareUtxosByTargetFit(a: UTXO, b: UTXO): number {
    const targetValue = this.options.target;
    const aValue = this.getUtxoValue(a);
    const bValue = this.getUtxoValue(b);

    // Calculate how close each UTXO is to the ideal size (target amount)
    const aDistance = Math.abs(Number(aValue - targetValue));
    const bDistance = Math.abs(Number(bValue - targetValue));

    // Prefer UTXOs closer to target size
    if (aDistance !== bDistance) {
      return aDistance - bDistance;
    }

    // If distances are equal, prefer confirmed UTXOs
    if (!a.block_height && b.block_height) return 1;
    if (a.block_height && !b.block_height) return -1;

    // Finally, sort by value descending
    return Number(bValue - aValue);
  }

  /**
   * Get the relevant value from a UTXO (rune amount or BTC value)
   */
  private getUtxoValue(utxo: UTXO): bigint {
    if (this.options.runeId && utxo.runes[this.options.runeId]) {
      return utxo.runes[this.options.runeId];
    }
    return utxo.value;
  }

  /**
   * Calculate the cost of including an input in the transaction
   */
  private getInputCost(_utxo: UTXO): bigint {
    return BigInt(Math.ceil(UTXOSelector.INPUT_SIZE * this.options.feeRate));
  }

  /**
   * Select UTXOs using the specified strategy
   */
  public select(): SelectionResult | null {
    const { strategy = 'best_strategy' } = this.options;

    switch (strategy) {
      case 'branch_and_bound':
        return this.branchAndBound();
      case 'knapsack':
        return this.knapsack();
      case 'largest_first':
        return this.largestFirst();
      case 'smallest_first':
        return this.smallestFirst();
      case 'target_aware':
        return this.targetAwareSelection();
      case 'best_strategy':
        return this.selectBestStrategy();
      default:
        throw new Error(`Unknown selection strategy: ${strategy}`);
    }
  }

  /**
   * Target-aware selection that balances input count and UTXO size efficiency
   */
  private targetAwareSelection(): SelectionResult | null {
    const target = this.options.target;
    const maxInputs = this.options.maxInputs || 10;
    const targetTolerance = 2.0;

    // Sort candidates by how close they are to target for single UTXO selection
    const singleCandidates = this.utxos
      .filter((utxo) => {
        const value = this.getUtxoValue(utxo);
        const ratio = Number(new Decimal(value.toString()).div(target.toString()));
        return value >= target && ratio <= targetTolerance;
      })
      .sort((a, b) => {
        const aValue = this.getUtxoValue(a);
        const bValue = this.getUtxoValue(b);
        const aDistance = Math.abs(Number(aValue - target));
        const bDistance = Math.abs(Number(bValue - target));
        return aDistance - bDistance; // Closest to target first
      });

    if (singleCandidates.length > 0) {
      return this.buildResult([singleCandidates[0]]); // Use the closest match
    }

    // If no single UTXO works, use smart multi-UTXO selection
    const smartResult = this.selectMultipleUtxos(target, maxInputs);
    if (smartResult) {
      return smartResult;
    }

    // Fallback: Use greedy selection with all available UTXOs
    return this.greedyFallback(target);
  }

  /**
   * Smart multi-UTXO selection that prefers reasonably sized UTXOs
   */
  private selectMultipleUtxos(target: bigint, maxInputs: number): SelectionResult | null {
    const minUtxoSize = target / BigInt(maxInputs * 2); // Avoid UTXOs smaller than half the average needed

    // Filter UTXOs into reasonable and small categories
    const reasonableUtxos = this.utxos.filter((utxo) => this.getUtxoValue(utxo) >= minUtxoSize);
    const smallUtxos = this.utxos.filter((utxo) => this.getUtxoValue(utxo) < minUtxoSize);

    // Try with reasonable UTXOs first
    const selected: UTXO[] = [];
    let totalValue = BigInt(0);

    // Phase 1: Use reasonable-sized UTXOs
    for (const utxo of reasonableUtxos) {
      if (selected.length >= maxInputs) break;

      const utxoValue = this.getUtxoValue(utxo);
      selected.push(utxo);
      totalValue += utxoValue;

      if (totalValue >= target) {
        return this.buildResult(selected);
      }
    }

    // Phase 2: If we still need more, add small UTXOs but respect total limit
    const remainingInputs = maxInputs - selected.length;

    let smallUtxosAdded = 0;
    for (const utxo of smallUtxos) {
      if (smallUtxosAdded >= remainingInputs) break; // Respect total maxInputs limit

      const utxoValue = this.getUtxoValue(utxo);
      selected.push(utxo);
      totalValue += utxoValue;
      smallUtxosAdded++;

      if (totalValue >= target) {
        return this.buildResult(selected);
      }
    }

    // If we still can't reach target, return null
    if (totalValue < target) return null;
    return this.buildResult(selected);
  }

  /**
   * Greedy fallback that uses all available UTXOs if needed to reach target
   */
  private greedyFallback(target: bigint): SelectionResult | null {
    const selected: UTXO[] = [];
    let totalValue = BigInt(0);

    // Sort UTXOs by value descending (largest first) for more efficient selection
    const sortedUtxos = [...this.utxos].sort((a, b) => {
      const aValue = this.getUtxoValue(a);
      const bValue = this.getUtxoValue(b);
      return Number(bValue - aValue);
    });

    // Use UTXOs in largest-first order until we reach target
    for (const utxo of sortedUtxos) {
      const utxoValue = this.getUtxoValue(utxo);
      selected.push(utxo);
      totalValue += utxoValue;

      if (totalValue >= target) {
        return this.buildResult(selected);
      }
    }

    // If we still can't reach target with all UTXOs, return null
    if (totalValue < target) return null;
    return this.buildResult(selected);
  }

  /**
   * Try multiple strategies and return the best result
   */
  private selectBestStrategy(): SelectionResult | null {
    const strategies: Array<() => SelectionResult | null> = [
      () => this.targetAwareSelection(),
      () => this.branchAndBound(),
      () => this.knapsack(),
      () => this.largestFirst(),
      () => this.smallestFirst(),
    ];

    let bestResult: SelectionResult | null = null;
    let bestScore = -1;

    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result) {
          const score = this.scoreResult(result);
          if (score > bestScore) {
            bestScore = score;
            bestResult = result;
          }
        }
      } catch {
        // Strategy failed, continue with next
        continue;
      }
    }

    return bestResult;
  }

  /**
   * Score a selection result (higher is better) - optimized for balanced selection
   */
  private scoreResult(result: SelectionResult): number {
    const efficiencyWeight = 0.35;
    const inputCountWeight = 0.4; // Increased weight for input count
    const changeWeight = 0.15;
    const sizeBalanceWeight = 0.1; // New factor for UTXO size balance

    // Efficiency: closer to 1.0 is better
    const efficiencyScore = Math.min(result.efficiency, 1.0);

    // Input count: fewer inputs is better (normalized, with stronger penalty for many inputs)
    const maxInputs = this.options.maxInputs || 100;
    const inputRatio = result.selectedUtxos.length / Math.min(maxInputs, 10); // Cap at 10 for scoring
    const inputCountScore = Math.max(0, 1.0 - Math.pow(inputRatio, 1.5)); // Exponential penalty

    // Change: smaller change is better (normalized)
    const changeScore =
      result.changeValue === BigInt(0)
        ? 1.0
        : 1.0 - Math.min(Number(result.changeValue) / Number(this.options.target), 1.0);

    // Size balance: prefer UTXOs that are reasonably sized relative to target
    let sizeBalanceScore = 1.0;
    if (result.selectedUtxos.length > 0) {
      const avgUtxoSize = result.totalValue / BigInt(result.selectedUtxos.length);
      const targetSize = this.options.target;
      const sizeRatio = Number(new Decimal(avgUtxoSize.toString()).div(targetSize.toString()));

      // Optimal ratio is around 0.5-2.0 times the target
      if (sizeRatio >= 0.5 && sizeRatio <= 2.0) {
        sizeBalanceScore = 1.0;
      } else if (sizeRatio < 0.5) {
        sizeBalanceScore = sizeRatio / 0.5; // Penalty for too small UTXOs
      } else {
        sizeBalanceScore = Math.max(0.1, 2.0 / sizeRatio); // Penalty for too large UTXOs
      }
    }

    return (
      efficiencyWeight * efficiencyScore +
      inputCountWeight * inputCountScore +
      changeWeight * changeScore +
      sizeBalanceWeight * sizeBalanceScore
    );
  }

  /**
   * Branch and Bound algorithm - optimal for exact matches
   */
  private branchAndBound(): SelectionResult | null {
    const target = this.options.target;
    const costOfChange =
      this.options.costOfChange ||
      BigInt(Math.ceil(UTXOSelector.OUTPUT_SIZE * this.options.feeRate));

    let bestSelection: UTXO[] | null = null;
    let bestWaste = BigInt(Number.MAX_SAFE_INTEGER);

    const search = (
      index: number,
      currentSelection: UTXO[],
      currentValue: bigint,
      currentCost: bigint,
    ) => {
      if (currentValue >= target) {
        const excess = currentValue - target;
        const waste = excess < costOfChange ? excess + costOfChange : excess;

        if (waste < bestWaste) {
          bestWaste = waste;
          bestSelection = [...currentSelection];
        }
        return;
      }

      if (index >= this.utxos.length) return;
      if (currentSelection.length >= (this.options.maxInputs || 100)) return;

      const utxo = this.utxos[index];
      const utxoValue = this.getUtxoValue(utxo);
      const inputCost = this.getInputCost(utxo);

      // Pruning: if even with all remaining UTXOs we can't reach target, skip
      const remainingValue = this.utxos
        .slice(index)
        .reduce((sum, u) => sum + this.getUtxoValue(u), BigInt(0));
      if (currentValue + remainingValue < target) return;

      // Try including this UTXO
      search(
        index + 1,
        [...currentSelection, utxo],
        currentValue + utxoValue,
        currentCost + inputCost,
      );

      // Try not including this UTXO
      search(index + 1, currentSelection, currentValue, currentCost);
    };

    search(0, [], BigInt(0), BigInt(0));

    if (!bestSelection) return null;

    return this.buildResult(bestSelection);
  }

  /**
   * Knapsack algorithm - good balance of efficiency and speed
   */
  private knapsack(): SelectionResult | null {
    const target = this.options.target;
    const n = Math.min(this.utxos.length, this.options.maxInputs || 100);

    // Use smaller target for DP to avoid memory issues
    const scaleFactor = 1000000n; // Scale down by 1M for DP
    const scaledTarget = Number(target / scaleFactor);

    if (scaledTarget <= 0) return this.largestFirst(); // Fallback for very small targets

    const dp: boolean[][] = Array(n + 1)
      .fill(null)
      .map(() => Array(scaledTarget + 1).fill(false));
    dp[0][0] = true;

    for (let i = 1; i <= n; i++) {
      const utxo = this.utxos[i - 1];
      const value = Number(this.getUtxoValue(utxo) / scaleFactor);

      for (let w = 0; w <= scaledTarget; w++) {
        dp[i][w] = dp[i - 1][w];
        if (w >= value && dp[i - 1][w - value]) {
          dp[i][w] = true;
        }
      }
    }

    // Find the minimum weight that satisfies the target
    let bestWeight = -1;
    for (let w = scaledTarget; w <= scaledTarget; w++) {
      if (dp[n][w]) {
        bestWeight = w;
        break;
      }
    }

    if (bestWeight === -1) {
      // No exact solution found, find closest
      for (let w = scaledTarget + 1; w <= Math.min(scaledTarget * 2, dp[0].length - 1); w++) {
        if (dp[n][w]) {
          bestWeight = w;
          break;
        }
      }
    }

    if (bestWeight === -1) return null;

    // Backtrack to find the selected UTXOs
    const selected: UTXO[] = [];
    let w = bestWeight;
    for (let i = n; i > 0 && w > 0; i--) {
      if (!dp[i - 1][w]) {
        const utxo = this.utxos[i - 1];
        selected.push(utxo);
        w -= Number(this.getUtxoValue(utxo) / scaleFactor);
      }
    }

    return this.buildResult(selected);
  }

  /**
   * Largest First algorithm - simple and effective for minimizing inputs
   */
  private largestFirst(): SelectionResult | null {
    const target = this.options.target;
    const selected: UTXO[] = [];
    let totalValue = BigInt(0);

    for (const utxo of this.utxos) {
      if (selected.length >= (this.options.maxInputs || 100)) break;

      selected.push(utxo);
      totalValue += this.getUtxoValue(utxo);

      if (totalValue >= target) break;
    }

    if (totalValue < target) return null;
    return this.buildResult(selected);
  }

  /**
   * Smallest First algorithm - good for UTXO consolidation
   */
  private smallestFirst(): SelectionResult | null {
    const target = this.options.target;
    const sortedUtxos = [...this.utxos].sort((a, b) =>
      Number(this.getUtxoValue(a) - this.getUtxoValue(b)),
    );

    const selected: UTXO[] = [];
    let totalValue = BigInt(0);

    for (const utxo of sortedUtxos) {
      if (selected.length >= (this.options.maxInputs || 100)) break;

      selected.push(utxo);
      totalValue += this.getUtxoValue(utxo);

      if (totalValue >= target) break;
    }

    if (totalValue < target) return null;
    return this.buildResult(selected);
  }

  /**
   * Build the final result object
   */
  private buildResult(selectedUtxos: UTXO[]): SelectionResult {
    const totalValue = selectedUtxos.reduce(
      (sum, utxo) => sum + this.getUtxoValue(utxo),
      BigInt(0),
    );
    const totalInputCost = selectedUtxos.reduce(
      (sum, utxo) => sum + this.getInputCost(utxo),
      BigInt(0),
    );
    const changeValue =
      totalValue > this.options.target ? totalValue - this.options.target : BigInt(0);
    const efficiency = Number(
      new Decimal(this.options.target.toString()).div(totalValue.toString()).toNumber(),
    );

    return {
      selectedUtxos,
      totalValue,
      totalInputCost,
      changeValue,
      efficiency,
    };
  }
}

/**
 * Convenience function for UTXO selection
 */
export function selectUtxos(utxos: UTXO[], options: SelectionOptions): SelectionResult | null {
  const selector = new UTXOSelector(utxos, options);
  return selector.select();
}

/**
 * Select UTXOs for rune transactions with optimized target-aware defaults
 */
export function selectRuneUtxos(
  utxos: UTXO[],
  runeId: string,
  targetAmount: bigint,
  feeRate: number,
  strategy?: SelectionOptions['strategy'],
): SelectionResult | null {
  return selectUtxos(utxos, {
    target: targetAmount,
    runeId,
    feeRate,
    strategy: strategy || 'target_aware',
    maxInputs: 10, // Conservative limit to minimize fees
    costOfChange: BigInt(Math.ceil(34 * feeRate)),
  });
}
