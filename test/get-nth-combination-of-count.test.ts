import { expect } from 'chai';
import {
  countOfCombinationsA,
  getAllPossibleCombinations,
  getNthCombination,
} from '../src/triangle/get-nth-combination-of-count';

describe('Test', function () {
  it('should count all combinations', () => {
    expect(countOfCombinationsA(3, 2)).equal(6);
    expect(countOfCombinationsA(100, 3)).equal(970200);
    expect(countOfCombinationsA(99, 7)).equal(75030638981760);
    expect(countOfCombinationsA(8000, 3)).equal(511808016000);
    expect(countOfCombinationsA(8822, 3)).equal(686362362840);
  });

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
