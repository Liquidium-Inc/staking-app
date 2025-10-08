import { describe, it, expect } from 'vitest';

import { pick } from './pick';

describe('pick', () => {
  it('should pick a single key from an object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = pick(obj, 'a');

    expect(result).toEqual({ a: 1 });
  });

  it('should pick multiple keys from an object', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const result = pick(obj, 'a', 'c');

    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('should return empty object when no keys are provided', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = pick(obj);

    expect(result).toEqual({});
  });

  it('should handle empty source object', () => {
    const obj = {} as Record<string, unknown>;
    const result = pick(obj, 'a');

    expect(result).toEqual({});
  });

  it('should handle objects with different value types', () => {
    const obj = {
      string: 'hello',
      number: 42,
      boolean: true,
      array: [1, 2, 3],
      object: { nested: 'value' },
      null: null,
      undefined: undefined,
    };

    const result = pick(obj, 'string', 'number', 'array', 'null');

    expect(result).toEqual({
      string: 'hello',
      number: 42,
      array: [1, 2, 3],
      null: null,
    });
  });

  it('should preserve undefined values when explicitly picked', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    const result = pick(obj, 'b');

    expect(result).toEqual({ b: undefined });
    expect(result.hasOwnProperty('b')).toBe(true);
  });

  it('should not modify the original object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const original = { ...obj };

    pick(obj, 'a', 'b');

    expect(obj).toEqual(original);
  });

  it('should create a new object reference', () => {
    const obj = { a: 1, b: 2 };
    const result = pick(obj, 'a', 'b');

    expect(result).not.toBe(obj);
    expect(result).toEqual(obj);
  });

  it('should work with complex nested objects', () => {
    const obj = {
      user: {
        id: 1,
        name: 'John',
        profile: {
          email: 'john@example.com',
        },
      },
      settings: {
        theme: 'dark',
      },
      metadata: {
        createdAt: new Date('2023-01-01'),
      },
    };

    const result = pick(obj, 'user', 'metadata');

    expect(result).toEqual({
      user: {
        id: 1,
        name: 'John',
        profile: {
          email: 'john@example.com',
        },
      },
      metadata: {
        createdAt: new Date('2023-01-01'),
      },
    });
  });

  it('should maintain reference equality for picked object values', () => {
    const nestedObj = { nested: 'value' };
    const obj = { a: nestedObj, b: 'string' };

    const result = pick(obj, 'a');

    expect(result.a).toBe(nestedObj);
  });

  it('should handle duplicate keys gracefully', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = pick(obj, 'a', 'a', 'b');

    expect(result).toEqual({ a: 1, b: 2 });
  });
});
