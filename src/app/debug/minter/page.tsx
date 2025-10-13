'use client';
import { useLaserEyes } from '@omnisat/lasereyes-react';
import { BitcoinNetworkType } from '@orangecrypto/orange-connect';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { request } from 'sats-connect';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { config } from '@/config/public';
import { showErrorToast } from '@/lib/normalizeErrorMessage';

const rune_name = config.rune.name;

export default function SignerPage() {
  const { address, paymentAddress } = useLaserEyes();
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [repeats, setRepeats] = useState<number>(1);
  const [feeRate, setFeeRate] = useState<number>(6);
  const [runeName, setRuneName] = useState<string>(rune_name);
  const [output, setOutput] = useState<string>('');
  const networkType: BitcoinNetworkType =
    config.network === 'testnet4' ? BitcoinNetworkType.Testnet4 : BitcoinNetworkType.Mainnet;

  useEffect(() => {
    setDestinationAddress(address);
  }, [address]);

  const mint = async () => {
    const response = await request('runes_mint', {
      network: networkType,
      destinationAddress,
      repeats,
      refundAddress: paymentAddress,
      feeRate,
      runeName,
      appServiceFee: undefined,
      appServiceFeeAddress: undefined,
    });
    console.log(response);
    if (response.status === 'success') {
      toast.success('Minted successfully');
      setOutput(response.result.fundTransactionId);
    } else {
      showErrorToast('Failed to mint');
    }
  };

  return (
    <div className="flex w-md flex-col gap-4">
      <label>
        Rune name
        <input
          disabled
          value={runeName}
          onChange={(e) => setRuneName(e.target.value)}
          className="w-full"
        />
      </label>
      <label>
        Repeats
        <input
          disabled
          type="number"
          value={repeats}
          onChange={(e) => setRepeats(Number(e.target.value))}
          className="w-full"
        />
      </label>
      <label>
        Fee Rate
        <input
          type="number"
          value={feeRate}
          onChange={(e) => setFeeRate(Number(e.target.value))}
          className="w-full"
        />
      </label>
      <label>
        Destination address
        <input
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          className="w-full"
        />
      </label>
      <Button onClick={mint}>Mint</Button>
      <Link
        href={`https://mempool.space/testnet4/tx/${output}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <output>{output}</output>
      </Link>
    </div>
  );
}
