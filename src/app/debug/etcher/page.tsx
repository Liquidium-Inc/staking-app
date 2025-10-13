'use client';
import { useLaserEyes } from '@omnisat/lasereyes-react';
import { BitcoinNetworkType } from '@orangecrypto/orange-connect';
import { useEffect, useState } from 'react';
import { request } from 'sats-connect';

import { Button } from '@/components/ui/button';
import { config as publicConfig } from '@/config/public';

export default function SignerPage() {
  const { address, paymentAddress } = useLaserEyes();
  const [premine, setPremine] = useState<string>('10000000');
  const [runeName, setRuneName] = useState<string>('ROCKET•TEST');
  const [symbol, setSymbol] = useState<string>('🚀');
  const [divisibility, setDivisibility] = useState<number>(2);
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [output] = useState<string>('');
  const [broadcast, setBroadcast] = useState<boolean>(false);

  useEffect(() => {
    setDestinationAddress(address);
  }, [address]);

  const etch = async () => {
    const response = await request('runes_etch', {
      runeName,
      symbol,
      divisibility,
      premine,
      isMintable: true,
      terms: {
        amount: premine,
        cap: premine,
        heightStart: undefined,
        heightEnd: undefined,
        offsetStart: undefined,
        offsetEnd: undefined,
      },
      destinationAddress,
      feeRate: 8,
      refundAddress: paymentAddress,
      // Basic required fields per sats-connect/types
      network:
        publicConfig.network === 'testnet4'
          ? BitcoinNetworkType.Testnet4
          : BitcoinNetworkType.Mainnet,
      delegateInscriptionId: undefined,
      appServiceFee: undefined,
      appServiceFeeAddress: undefined,
      inscriptionDetails: undefined,
    });
    console.log(response);
  };

  return (
    <div className="flex w-md flex-col gap-4">
      <label>
        Premine
        <input value={premine} onChange={(e) => setPremine(e.target.value)} className="w-full" />
      </label>
      <label>
        Rune name
        <input value={runeName} onChange={(e) => setRuneName(e.target.value)} className="w-full" />
      </label>
      <label>
        Symbol
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-full" />
      </label>
      <label>
        Divisibility
        <input
          value={divisibility}
          onChange={(e) => setDivisibility(Number(e.target.value))}
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
      <label className="flex items-center gap-2">
        Broadcast
        <input
          type="checkbox"
          checked={broadcast}
          onChange={(e) => setBroadcast(e.target.checked)}
        />
      </label>
      <Button onClick={etch}>Sign</Button>
      <output>{output}</output>
    </div>
  );
}
