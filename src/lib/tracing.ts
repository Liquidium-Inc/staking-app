import { Span, SpanStatusCode, Tracer, trace } from '@opentelemetry/api';

export async function spanWrap<F>(
  tracer: Tracer | string,
  name: string,
  fn: (span: Span) => F | Promise<F>,
): Promise<F> {
  if (typeof tracer === 'string') {
    tracer = trace.getTracer(tracer);
  }

  return tracer.startActiveSpan(name, async (span: Span) => {
    try {
      return await fn(span);
    } catch (error: unknown) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
