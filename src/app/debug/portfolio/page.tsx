'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import Big from 'big.js';
import { Info, Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMemo } from 'react';
import { Area, AreaChart, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import { ResponsiveContainer } from 'recharts';

import { Button } from '@/components/ui/button';
import { CardContent, CardHeader } from '@/components/ui/card';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TokenLogo } from '@/components/ui/token';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { config } from '@/config/public';
import { useProtocol } from '@/hooks/api/useProtocol';
import { useWalletActivity } from '@/hooks/api/useWalletActivity';
import { computeEarnings } from '@/lib/earnings';
import { formatCurrency } from '@/lib/formatCurrency';

interface Entry {
  block: number;
  value: number;
}

function PortfolioPage() {
  const { address } = useLaserEyes();
  const { data: protocol } = useProtocol();
  const { btc, rune, staked } = protocol;

  const { data: fetchedActivity = [] } = useWalletActivity(address);

  const tokenPrice = Big(rune.priceSats ?? 0)
    .times(btc.price)
    .div(100_000_000)
    .toNumber();

  // State for editable tables
  const [txs, setTxs] = useState<Entry[]>([]);
  const [rates, setRates] = useState<Entry[]>([{ block: 0, value: 1 }]);
  const [block, setBlock] = useState('399');
  const [amount, setAmount] = useState('-1100');
  const [rateBlock, setRateBlock] = useState('400');
  const [rateAmount, setRateAmount] = useState('1.2');

  // Initialize state with real data once to avoid re-render loops
  const hydratedTxs = useRef(false);
  const hydratedRates = useRef(false);

  useEffect(() => {
    if (!hydratedTxs.current && fetchedActivity.length > 0) {
      const multiplier = {
        input: -1,
        output: 1,
        'new-allocation': 0,
        mint: 0,
        burn: 0,
      } satisfies Record<(typeof fetchedActivity)[number]['event_type'], number>;

      const newTxs = fetchedActivity
        .map((tx) => ({
          value: multiplier[tx.event_type] * Number(tx.amount) * 10 ** -tx.decimals,
          block: tx.block_height,
        }))
        .reverse();
      setTxs(newTxs);
      setBlock(newTxs[newTxs.length - 1].block + 5 + '');
      hydratedTxs.current = true;
    }
  }, [fetchedActivity]);

  useEffect(() => {
    if (!hydratedRates.current && protocol.historicRates?.length > 0) {
      const newRates = [
        { value: 1, block: 0 },
        ...protocol.historicRates.map(({ rate, block }) => ({ value: Number(rate), block })),
      ];
      setRates(newRates);
      setRateBlock(newRates[newRates.length - 1].block + 5 + '');
      setRateAmount(newRates[newRates.length - 1].value + 0.005 + '');
      hydratedRates.current = true;
    }
  }, [protocol.historicRates]);

  const earnings = useMemo(() => {
    return computeEarnings(txs, rates);
  }, [txs, rates]);

  // Memoize the data transformation
  const exchangeRateData = useMemo(() => {
    if (!protocol.historicRates) return [];
    return protocol.historicRates
      .map((k) => ({ ...k, timestamp: k.timestamp.valueOf() }))
      .sort((a, b) => a.block - b.block);
  }, [protocol.historicRates]);

  const exchangeRate = exchangeRateData[exchangeRateData.length - 1]?.rate || 1;

  // Memoize the chart to prevent unnecessary re-renders
  const chart = useMemo(
    () => (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart>
          <defs>
            <pattern id="square" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="2" height="2" fill="#D9D9D9" opacity="0.8" />
            </pattern>
            <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            hide
            type="number"
            dataKey="block"
            name="Block Height"
            domain={['dataMin', 'dataMax']}
          />
          <YAxis
            hide
            type="number"
            dataKey="rate"
            name="Exchange Rate"
            domain={['dataMin-0.02', 'dataMax']}
          />
          <Area
            type="monotone"
            stroke="#21DC11"
            dataKey="rate"
            data={rates
              .filter(({ block }) => block)
              .map(({ value, block }) => ({
                rate: value,
                block,
                timestamp: block * 60 * 1000,
              }))}
            fill="url(#square)"
          />
          <RechartsTooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-background rounded-lg border p-2 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <TokenLogo logo={rune.symbol} variant="primary" size={16} />
                      <span className="text-sm font-medium">{data.rate.toFixed(4)}</span>
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">Block {data.block}</div>
                  </div>
                );
              }
              return null;
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    ),
    [rates, rune.symbol],
  );

  const addTx = () => {
    const newTxs = [...txs, { block: +block, value: +amount }].sort((a, b) => a.block - b.block);
    setTxs(newTxs);
    setBlock((block) => +block + 1 + '');
    setAmount('0');
  };

  const removeTx = (index: number) => {
    const newTxs = txs.filter((_, i) => i !== index);
    setTxs(newTxs);
  };

  const addRate = () => {
    const newRates = [...rates, { block: +rateBlock, value: +rateAmount }].sort(
      (a, b) => a.block - b.block,
    );
    setRates(newRates);
    setRateBlock((rateBlock) => +rateBlock + 100 + '');
    setRateAmount((rate) => +rate + 0.1 + '');
  };

  const removeRate = (index: number) => {
    const newRates = rates.filter((_, i) => i !== index);
    setRates(newRates);
  };

  const stakedBalance = useMemo(() => {
    return [...earnings.slots].reduce((acc, slot) => acc + slot.value, 0);
  }, [earnings.slots]);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="m-4 flex w-full max-w-md flex-col items-center justify-center space-y-3 md:my-10">
        <Card className="w-full space-y-1">
          <CardHeader className="flex">
            <h3>Total Earned</h3>
            <Tooltip>
              <TooltipTrigger asChild className="ml-auto">
                <Info strokeWidth={1.5} className="opacity-40" size={16} />
              </TooltipTrigger>
              <TooltipContent>
                <span>Liquidium earned since holding staked liquidium</span>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent className="flex items-center space-x-2 px-2">
            <TokenLogo logo={rune.symbol} variant="primary" size={40} />
            <span className="text-4xl font-semibold">
              {formatCurrency(earnings.total, config.rune.decimals)}
            </span>
            <div className="ml-auto rounded-full border-3 border-green-500 bg-green-500/20 px-2 py-1 text-xs text-green-500">
              +{formatCurrency(earnings.percentage)}%
            </div>
          </CardContent>
          <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
            ${formatCurrency(earnings.total * tokenPrice)} USD
          </div>
        </Card>

        <div className="grid w-full grid-cols-2 gap-3">
          <Card className="w-full space-y-1">
            <CardHeader className="flex">
              <h3>{rune.name}</h3>
              <Tooltip>
                <TooltipTrigger asChild className="ml-auto">
                  <Info strokeWidth={1.5} className="opacity-40" size={16} />
                </TooltipTrigger>
                <TooltipContent>
                  <span>The worth of your sLiquidium in Liquidium.</span>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent className="flex items-center space-x-2 px-2">
              <TokenLogo logo={rune.symbol} variant="primary" size={24} />
              <span className="text-xl">
                {formatCurrency(stakedBalance * exchangeRate, staked.decimals)}
              </span>
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              ${formatCurrency(stakedBalance * exchangeRate * tokenPrice)} USD
            </div>
          </Card>

          <Card className="w-full space-y-1">
            <CardHeader className="flex">
              <h3>{staked.name}</h3>
              <Tooltip>
                <TooltipTrigger asChild className="ml-auto">
                  <Info strokeWidth={1.5} className="opacity-40" size={16} />
                </TooltipTrigger>
                <TooltipContent>
                  <span>The amount of sLiquidium tokens in your wallet.</span>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent className="flex items-center space-x-2 px-2">
              <TokenLogo logo={staked.symbol} variant="secondary" size={24} />
              <span className="text-xl">{formatCurrency(stakedBalance, staked.decimals)}</span>
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              ${formatCurrency(stakedBalance * exchangeRate * tokenPrice)} USD
            </div>
          </Card>
        </div>

        <Card className="w-full p-4">
          <CardHeader className="flex">
            <h3>Price</h3>
          </CardHeader>
          <CardContent className="px-2">
            <div className="flex items-center space-x-2">
              <TokenLogo logo={rune.symbol} variant="primary" size={24} />
              <span className="text-xl">{exchangeRate.toFixed(2)}</span>
            </div>
            <div className="h-16 w-full">{chart}</div>
          </CardContent>
        </Card>
      </div>
      <div>
        <div className="flex w-full flex-row gap-4">
          <div>
            <div className="flex flex-col gap-4">
              <span className="text-sm font-medium">Transactions</span>
              <div className="border-border rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 border-border border-b">
                      <th className="p-2 text-left text-xs font-medium">Block</th>
                      <th className="p-2 text-left text-xs font-medium">Amount [sLiq]</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx, index) => (
                      <tr
                        key={`tx-${index}-${tx.block}-${tx.value}`}
                        className="border-border border-b"
                      >
                        <td className="p-2 text-sm">{tx.block}</td>
                        <td className="p-2 text-sm">{tx.value}</td>
                        <td className="w-1 text-sm">
                          <Button variant="ghost" onClick={() => removeTx(index)}>
                            <Trash className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-row gap-2">
                <Input type="text" value={block} onChange={(e) => setBlock(e.target.value)} />
                <Input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Button onClick={addTx}>Add</Button>
              </div>
            </div>
          </div>
          <div>
            <div className="flex flex-col gap-4">
              <span className="text-sm font-medium">Exchange Rates</span>
              <div className="border-border rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 border-border border-b">
                      <th className="p-2 text-left text-xs font-medium">Block</th>
                      <th className="p-2 text-left text-xs font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((rate, index) => (
                      <tr
                        key={`rate-${index}-${rate.block}-${rate.value}`}
                        className="border-border border-b"
                      >
                        <td className="p-2 text-sm">{rate.block}</td>
                        <td className="p-2 text-sm">{rate.value}</td>
                        <td className="w-1 text-sm">
                          <Button variant="ghost" onClick={() => removeRate(index)}>
                            <Trash className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-row gap-2">
                <Input
                  type="text"
                  value={rateBlock}
                  onChange={(e) => setRateBlock(e.target.value)}
                />
                <Input
                  type="text"
                  value={rateAmount}
                  onChange={(e) => setRateAmount(e.target.value)}
                />
                <Button onClick={addRate}>Add</Button>
              </div>
            </div>
          </div>
        </div>

        {!!earnings.slots.size && (
          <div className="my-8 w-full">
            <span className="py-4 font-medium">Remaining Slots</span>
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-border border-b">
                  <th className="p-2 text-left text-xs font-medium">Block</th>
                  <th className="p-2 text-left text-xs font-medium">Rate</th>
                  <th className="p-2 text-left text-xs font-medium">Remaining</th>
                  <th className="p-2 text-left text-xs font-medium">Cost value</th>
                  <th className="p-2 text-left text-xs font-medium">Market value</th>
                </tr>
              </thead>
              <tbody>
                {[...earnings.slots].map((slot, index) => (
                  <tr
                    key={`slot-${index}-${slot.block}-${slot.value}`}
                    className="border-border border-b"
                  >
                    <td className="p-2 text-sm">{slot.block}</td>
                    <td className="p-2 text-sm">{slot.rate}</td>
                    <td className="p-2 text-sm">{slot.value}</td>
                    <td className="p-2 text-sm">{formatCurrency(slot.value * slot.rate)}</td>
                    <td className="p-2 text-sm">{formatCurrency(slot.value * earnings.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default PortfolioPage;
