export function getAllPossibleCombinations<T = any>(
  values: T[],
  maxCount: number,
  current: T[] = [],
): T[][] {
  if (current.length === 0) {
    const combinations = [];

    for (const value of values) {
      combinations.push(...getAllPossibleCombinations(values, maxCount, [value]));
    }

    return combinations;
  }

  const combinations = [];
  const possibleValues = values.filter((value) => {
    return !current.includes(value);
  });

  if (possibleValues.length <= 0 || current.length >= maxCount) {
    return [current];
  }

  for (const value of possibleValues) {
    combinations.push(...getAllPossibleCombinations(values, maxCount, [...current, value]));
  }

  return combinations;
}

const cache: Record<string | number, bigint> = {};
function factorial(n: bigint): bigint {
  let key = n.toString();
  if (!cache[key]) {
    if (n <= BigInt(1)) {
      cache[key] = BigInt(n);
    } else {
      cache[key] = n * factorial(n - BigInt(1));
    }
  }

  return cache[key];
}

export function countOfCombinationsA(arrayLength: number, maxCount: number): number {
  let result = 1;
  // equals to arrayLength! / (arrayLength - maxCount)!
  for (let i = arrayLength - maxCount + 1; i <= arrayLength; i++) {
    result *= i;
  }
  return result;
}

export function getNthCombination<T = any>(values: T[], maxCount: number, n: number): T[] {
  if (maxCount <= 0) {
    return [];
  }

  const combinationsCount = countOfCombinationsA(values.length, maxCount);
  const countOfSameFirstValue = combinationsCount / values.length;

  const firstValueIndex = Math.floor(n / countOfSameFirstValue);
  const firstValue = values[firstValueIndex];
  const leftValues = values.filter((value) => value !== firstValue);
  const nextN = n % countOfSameFirstValue;
  const leftCombination = getNthCombination(leftValues, maxCount - 1, nextN);

  return [firstValue, ...leftCombination];
}
