import { describe, test, expect } from 'vitest';

import { binarySearch } from './binarySearch';

describe('binarySearch', () => {
  test('should find an exact match in a sorted array of numbers', () => {
    const array = [1, 2, 3, 4, 5];
    const result = binarySearch(array, (num) => num, 3);
    expect(result).toBe(3);
  });

  test('should find an exact match in a sorted array of objects', () => {
    const array = [
      { id: 1, value: 'a' },
      { id: 2, value: 'b' },
      { id: 3, value: 'c' },
      { id: 4, value: 'd' },
      { id: 5, value: 'e' },
    ];
    const result = binarySearch(array, (obj) => obj.id, 3);
    expect(result).toEqual({ id: 3, value: 'c' });
  });

  test('should return the closest (but not higher) match when no exact match is found', () => {
    const array = [1, 3, 5, 7, 9];

    // Target 4 should return 3 (array[right] when no exact match)
    const result1 = binarySearch(array, (num) => num, 4);
    expect(result1).toBe(3);

    // Target 6 should return 5
    const result2 = binarySearch(array, (num) => num, 6);
    expect(result2).toBe(5);
  });

  test('should handle an empty array', () => {
    const array: number[] = [];
    const result = binarySearch(array, (num) => num, 5);
    expect(result).toBeUndefined();
  });

  test('should handle array with a single element', () => {
    const array = [42];

    // Exact match
    const result1 = binarySearch(array, (num) => num, 42);
    expect(result1).toBe(42);

    // No match
    const result2 = binarySearch(array, (num) => num, 100);
    expect(result2).toBe(42);
  });

  test('should find the first element in the array', () => {
    const array = [10, 20, 30, 40, 50];
    const result = binarySearch(array, (num) => num, 10);
    expect(result).toBe(10);
  });

  test('should find the last element in the array', () => {
    const array = [10, 20, 30, 40, 50];
    const result = binarySearch(array, (num) => num, 50);
    expect(result).toBe(50);
  });

  test('should work with custom callback functions', () => {
    const array = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
    const result = binarySearch(array, (str) => str.length, 5);
    expect(result).toBe('apple');
  });
});
