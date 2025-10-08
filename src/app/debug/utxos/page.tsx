/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Props as RectangleProps } from 'recharts/types/shape/Rectangle';

import type { GET as Assigned } from '@/app/api/protocol/utxos/assigned/route';
import type { GET as UTXOs } from '@/app/api/protocol/utxos/route';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { config } from '@/config/public';
import type { ApiOutput } from '@/utils/api-output';

const runeId = config.rune.id;
const stakedId = config.sRune.id;

// Helper function to handle log scale, avoiding log(0)
const safeLog = (value: number) => {
  if (value <= 0) return 0;
  return Math.log10(value);
};

// Helper function to format numbers with proper handling of zero values
const formatNumber = (value: number) => {
  if (value === 0) return '0';
  return value.toLocaleString();
};

const CustomBar = (props: RectangleProps & { payload?: any }) => {
  const { fill, x = 0, y = 0, width = 0, height = 0, payload } = props;

  // For negative values (bars going down), y represents the top of the bar
  // and height is already negative, so we need to adjust y accordingly
  const adjustedY = height < 0 ? y + height : y;
  const adjustedHeight = Math.abs(height);
  const adjustedX = height < 0 ? x - width : x;

  // Create pattern for diagonal lines
  const patternId = `diagonal-pattern-${payload?.id || 'default'}-${fill}`;
  const patternSize = 8; // Size of the pattern

  return (
    <g>
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={patternSize}
          height={patternSize}
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2={patternSize} stroke={fill} strokeWidth="6" />
        </pattern>
      </defs>
      <rect
        x={adjustedX}
        y={adjustedY}
        width={width * 2}
        height={adjustedHeight}
        fill={payload?.block == null ? `url(#${patternId})` : fill}
        stroke={payload?.isAssigned ? '#ef4444' : fill} // red-500 when assigned
        strokeWidth={2}
      />
    </g>
  );
};

export default function SignerPage() {
  const [hideZeroValues, setHideZeroValues] = useState(true);
  const { data: utxos } = useQuery<ApiOutput<typeof UTXOs>>({
    queryKey: ['utxos'],
    queryFn: () => fetch('/api/protocol/utxos').then((res) => res.json()),
    refetchInterval: 5000,
  });

  const { data: assigned } = useQuery<ApiOutput<typeof Assigned>>({
    queryKey: ['assigned'],
    queryFn: () => fetch('/api/protocol/utxos/assigned').then((res) => res.json()),
    refetchInterval: 1000,
  });

  const data = useMemo(() => {
    const assignedMap = new Map(assigned?.map((e) => [e.utxo, e.address]));
    const data = utxos?.data
      .map((utxo) => {
        const output = `${utxo.txid}:${utxo.vout}`;
        const isAssigned = assignedMap.has(output);
        const amount = +utxo.amounts[utxo.rune_ids?.findIndex((id) => id === runeId) ?? -1] || 0;
        const sAmount = +utxo.amounts[utxo.rune_ids?.findIndex((id) => id === stakedId) ?? -1] || 0;

        const shouldHide = hideZeroValues && amount === 0 && sAmount === 0;

        return {
          id: output,
          shouldHide,
          assignedTo: assignedMap.get(output),
          originalAmount: amount,
          originalSAmount: sAmount,
          amount: amount,
          sAmount: sAmount,
          block: utxo.block_height,
          amountLog: safeLog(amount),
          sAmountLog: -safeLog(sAmount),
          others: utxo.rune_ids?.filter((id) => id !== runeId && id !== stakedId),
          isAssigned,
        };
      })
      .filter((d) => !d.shouldHide);
    return data;
  }, [utxos, assigned, hideZeroValues]);

  // Sort data by amount and sAmount
  const sortedData = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      // If block is null, put it last
      if (a.block == null && b.block == null) return 0;
      if (a.block == null) return 1;
      if (b.block == null) return -1;
      return a.block - b.block;
    });
  }, [data]);

  const maxValue = useMemo(() => {
    if (!sortedData.length) return 0;
    return Math.max(
      ...sortedData.map((d) => Math.max(safeLog(d.originalAmount), safeLog(d.originalSAmount))),
    );
  }, [sortedData]);

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">UTXO Distribution (Log Scale)</h3>
              <p className="text-muted-foreground text-sm">
                Green bars (top) represent amount, blue bars (bottom) represent sAmount. Red outline
                indicates assigned UTXOs. Values are shown in logarithmic scale for better
                visibility.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="hide-zero"
                className="bg-white"
                checked={hideZeroValues}
                onCheckedChange={setHideZeroValues}
              />
              <Label htmlFor="hide-zero">Hide zero values</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedData}
                margin={{
                  top: 20,
                  right: 30,
                  left: 50,
                  bottom: 5,
                }}
                barGap={0}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="block" hide />
                <YAxis
                  hide
                  domain={[-maxValue, maxValue]}
                  tickFormatter={(value) => {
                    if (value === 0) return '0';
                    const absValue = Math.abs(value);
                    return `10^${absValue.toFixed(1)}`;
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as (typeof sortedData)[number];
                    return (
                      <div className="bg-background rounded-lg border p-2 shadow-lg">
                        <p className="font-mono text-xs">{data.id}</p>
                        {data.assignedTo && (
                          <p className="text-muted-foreground text-xs">
                            Assigned to: {data.assignedTo}
                          </p>
                        )}
                        <p className="text-xs">Amount: {formatNumber(data.originalAmount)}</p>
                        <p className="text-xs">sAmount: {formatNumber(data.originalSAmount)}</p>
                        {data.block && <p className="text-xs">Block: {data.block}</p>}
                        {data.others && data.others.length > 0 && (
                          <p className="text-xs">Others: {data.others.join(', ')}</p>
                        )}
                      </div>
                    );
                  }}
                />
                {/* Regular bars with custom shape */}
                <Bar
                  dataKey="amountLog"
                  fill="#22c55e"
                  shape={(props: any) => <CustomBar {...props} />}
                />
                <Bar
                  dataKey="sAmountLog"
                  fill="#3b82f6"
                  shape={(props: any) => <CustomBar {...props} />}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
