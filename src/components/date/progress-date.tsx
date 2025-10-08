'use client';
import { useEffect, useState } from 'react';

import { Progress } from '../ui/progress';

interface ProgressDateProps {
  begin: Date;
  end: Date;
  className?: string;
}

function calculateProgress(begin: number, end: number, current = Date.now()): number {
  if (begin > end) throw new Error('Begin date must be before end date');
  if (current < begin) return 0;
  if (current > end) return 100;
  const totalDuration = end - begin;
  const elapsedDuration = current - begin;
  return Math.min((elapsedDuration / totalDuration) * 100, 100);
}

export const ProgressDate = ({ begin, end, className }: ProgressDateProps) => {
  const beginTime = new Date(begin).valueOf();
  const endTime = new Date(end).valueOf();

  const [progress, setProgress] = useState(calculateProgress(beginTime, endTime));

  useEffect(() => {
    const totalDuration = endTime - beginTime;
    const tick = totalDuration / 1000;

    const interval = setInterval(() => {
      setProgress(calculateProgress(beginTime, endTime));
    }, tick);
    return () => clearInterval(interval);
  }, [beginTime, endTime]);

  return <Progress max={100} value={progress} className={className} />;
};
