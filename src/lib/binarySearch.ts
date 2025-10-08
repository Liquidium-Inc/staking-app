/**
 * Binary search for an array of objects. In case of no exact match, it returns the closest (but not higher) match.
 * @param array - The array to search
 * @param callback - The callback function to get the value to search for
 * @param target - The target value to search for
 * @returns The object that matches the target value
 */
export const binarySearch = <T>(array: T[], callback: (param: T) => number, target: number) => {
  let left = 0;
  let right = array.length - 1;

  if (array.length === 0) {
    return undefined;
  }

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (callback(array[mid]) === target) {
      return array[mid];
    }
    if (callback(array[mid]) < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return array[right];
};
