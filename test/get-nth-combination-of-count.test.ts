import { expect } from 'chai';

function getAllPossibleCombinations<T = any>(
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

function factorial(n: number): number {
  if (n <= 1) {
    return 1;
  }

  return n * factorial(n - 1);
}

function countOfCombinationsC(arrayLength: number, maxCount: number): number {
  return factorial(arrayLength) / (factorial(maxCount) * factorial(arrayLength - maxCount));
}

function countOfCombinationsA(arrayLength: number, maxCount: number): number {
  return factorial(arrayLength) / factorial(arrayLength - maxCount);
}

function getNthCombination<T = any>(values: T[], maxCount: number, n: number): T[] {
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

describe('Test', function () {
  it('Test', async function () {
    const values = ['a', 'b', 'c', 'd'];
    const maxCount = 3;
    const n = 13;

    const combinations = getAllPossibleCombinations(values, maxCount);
    const combinationA = combinations[n];
    const combinationB = getNthCombination(values, maxCount, n);

    expect(combinationA.length).equal(combinationB.length);

    for (let i = 0; i < Math.min(combinationA.length, combinationB.length); i++) {
      expect(combinationA[i].length).equal(combinationB[i].length);
    }

    console.log(combinations);
    console.log(combinationA);
    console.log(combinationB);
  });
});
