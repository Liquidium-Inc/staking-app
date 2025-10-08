/**
 * Shared type definitions for the application
 */

/**
 * Transaction status from mempool.js library
 * Based on @mempool/mempool.js TxStatus interface
 */
export type TxStatus =
  | {
      confirmed: true;
      block_height: number;
      block_hash: string;
      block_time: number;
    }
  | {
      confirmed: false;
    };

/**
 * Transaction info with proper typing for status
 */
export type TxInfo = {
  fee: number;
  locktime: number;
  size: number;
  status: TxStatus;
  txid?: string;
};
