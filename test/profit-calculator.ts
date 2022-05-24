import { getAffectedRanges } from '../src/strategies/profit-calculator';
import { expect } from 'chai';

describe('ProfitCalculator', function () {
  function rangeIn(from: bigint, to: bigint | null) {
    return {
      fromInput: from,
      toInput: to,
      fromOutput: 0n,
      toOutput: 0n,
      constants: [],
    };
  }

  function rangeOut(from: bigint, to: bigint) {
    return {
      fromInput: 0n,
      toInput: 0n,
      fromOutput: from,
      toOutput: to,
      constants: [],
    };
  }

  it('ProfitCalculator - affectedRanges', function () {
    expect(
      getAffectedRanges(rangeOut(0n, 10n), [rangeIn(0n, 10n), rangeIn(10n, 333n)]).length,
    ).to.equal(1);
    expect(
      getAffectedRanges(rangeOut(0n, 11n), [rangeIn(0n, 10n), rangeIn(10n, 333n)]).length,
    ).to.equal(2);
    expect(
      getAffectedRanges(rangeOut(10n, 16n), [rangeIn(0n, 10n), rangeIn(10n, null)]).length,
    ).to.equal(1);
    expect(
      getAffectedRanges(rangeOut(10n, 26n), [
        rangeIn(0n, 5n),
        rangeIn(5n, 10n),
        rangeIn(10n, 15n),
        rangeIn(15n, 25n),
        rangeIn(25n, null),
      ]).length,
    ).to.equal(3);
  });
});
