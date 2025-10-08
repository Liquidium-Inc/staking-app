import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiOutput<T extends (...args: any[]) => Promise<NextResponse<unknown>>> =
  Awaited<ReturnType<T>> extends NextResponse<infer R>
    ? R extends { error: unknown }
      ? never
      : R
    : never;
