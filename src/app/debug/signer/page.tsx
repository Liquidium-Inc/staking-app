'use client';
import { useLaserEyes } from '@omnisat/lasereyes-react';
import { useState } from 'react';
import { request } from 'sats-connect';

import { Button } from '@/components/ui/button';

export default function SignerPage() {
  const { address } = useLaserEyes();
  const [psbt, setPsbt] = useState<string>('');
  const [signInputs, setSignInputs] = useState<string>('');
  const [output] = useState<string>('');
  const [broadcast, setBroadcast] = useState<boolean>(false);

  const sign = async () => {
    const response = await request('signPsbt', {
      psbt,
      signInputs: {
        [address]: signInputs.split(',').map(Number),
        //[paymentAddress]: signInputs.split(',').map(Number),
      },
      broadcast,
    });
    console.log(response);
  };

  return (
    <div className="flex w-md flex-col gap-4">
      <label>
        PSBT
        <textarea value={psbt} onChange={(e) => setPsbt(e.target.value)} className="h-96 w-full" />
      </label>
      <label>
        Sign inputs
        <input
          value={signInputs}
          onChange={(e) => setSignInputs(e.target.value)}
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
      <Button onClick={sign}>Sign</Button>
      <output>{output}</output>
    </div>
  );
}
