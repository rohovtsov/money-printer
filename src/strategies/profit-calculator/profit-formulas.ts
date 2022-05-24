import { bigIntSqrt, MarketAction } from '../../entities';
import { MAX_FEE } from '../../uniswap/native-pool/native-pool-utils';

export abstract class ProfitFormulas {
  //Y1 = (A1^2 * L1 * X * K1) / (A1 * Q1 * X * K1 + L1 * Q1^2)
  //Y2 = (A2^2 * L2 * Y1 * K2) / (A2 * Q2 * Y1 * K2 + L2 * Q2^2)
  //Y3 = (A3^2 * L3 * Y2 * K3) / (A3 * Q3 * Y2 * K3 + L3 * Q3^2)

  //T1 = (A1^2 * L1 * K1);
  //M1 = (A1 * Q1 * K1);
  //G1 = (L1 * Q1^2);
  //Y1 = (T1 * X) / (M1 * X + G1)

  //Y1 = (T1 * X) / (M1 * X + G1)
  //Y2 = (T2 * Y1) / (M2 * Y1 + G2)
  //Y3 = (T3 * Y2) / (M3 * Y2 + G3)

  //https://www.wolframalpha.com/input?i=Y1+%3D+%28T1+*+X%29+%2F+%28M1+*+X+%2B+G1%29%2C+for+Y2+%3D+%28T2+*+Y1%29+%2F+%28M2+*+Y1+%2B+G2%29%2C+for+Y3+%3D+%28T3+*+Y2%29+%2F+%28M3+*+Y2+%2B+G3%29
  //Y3 = (T1 * T2 * T3 * X) / (G1 * G2 * G3 + G2 * G3 * M1 * X + G3 * M2 * T1 * X + M3 * T1 * T2 * X);

  private static swapTriangleInternal(
    A1: bigint,
    Q1: bigint,
    L1: bigint,
    F1: bigint,
    A2: bigint,
    Q2: bigint,
    L2: bigint,
    F2: bigint,
    A3: bigint,
    Q3: bigint,
    L3: bigint,
    F3: bigint,
    X: bigint,
  ): bigint {
    const M = MAX_FEE;

    const T1 = (A1 * A1 * L1 * (M - F1)) / M;
    const M1 = (A1 * Q1 * (M - F1)) / M;
    const G1 = L1 * Q1 * Q1;

    const T2 = (A2 * A2 * L2 * (M - F2)) / M;
    const M2 = (A2 * Q2 * (M - F2)) / M;
    const G2 = L2 * Q2 * Q2;

    const T3 = (A3 * A3 * L3 * (M - F3)) / M;
    const M3 = (A3 * Q3 * (M - F3)) / M;
    const G3 = L3 * Q3 * Q3;

    return (
      (T1 * T2 * T3 * X) / (G1 * G2 * G3 + G2 * G3 * M1 * X + G3 * M2 * T1 * X + M3 * T1 * T2 * X)
    );
  }

  //https://www.wolframalpha.com/input?i=-1+%2B+%28G1+G2+G3+T1+T2+T3%29%2F%28G1+G2+G3+%2B+G2+G3+M1+x+%2B+G3+M2+T1+x+%2B+M3+T1+T2+x%29%5E2+%3D+0
  private static extremumTriangleInternal(
    A1: bigint,
    Q1: bigint,
    L1: bigint,
    F1: bigint,
    A2: bigint,
    Q2: bigint,
    L2: bigint,
    F2: bigint,
    A3: bigint,
    Q3: bigint,
    L3: bigint,
    F3: bigint,
  ): bigint {
    const M = MAX_FEE;

    const T1 = (A1 * A1 * L1 * (M - F1)) / M;
    const M1 = (A1 * Q1 * (M - F1)) / M;
    const G1 = L1 * Q1 * Q1;

    const T2 = (A2 * A2 * L2 * (M - F2)) / M;
    const M2 = (A2 * Q2 * (M - F2)) / M;
    const G2 = L2 * Q2 * Q2;

    const T3 = (A3 * A3 * L3 * (M - F3)) / M;
    const M3 = (A3 * Q3 * (M - F3)) / M;
    const G3 = L3 * Q3 * Q3;

    const forSQRT =
      G1 * G2 * G2 * G2 * G3 * G3 * G3 * M1 * M1 * T1 * T2 * T3 +
      2n * G1 * G2 * G2 * G3 * G3 * G3 * M1 * M2 * T1 * T1 * T2 * T3 +
      2n * G1 * G2 * G2 * G3 * G3 * M1 * M3 * T1 * T1 * T2 * T2 * T3 +
      G1 * G2 * G3 * G3 * G3 * M2 * M2 * T1 * T1 * T1 * T2 * T3 +
      2n * G1 * G2 * G3 * G3 * M2 * M3 * T1 * T1 * T1 * T2 * T2 * T3 +
      G1 * G2 * G3 * M3 * M3 * T1 * T1 * T1 * T2 * T2 * T2 * T3;
    const SQRT = bigIntSqrt(forSQRT);

    const nominator =
      -G1 * G2 * G2 * G3 * G3 * M1 +
      SQRT -
      G1 * G2 * G3 * G3 * M2 * T1 -
      G1 * G2 * G3 * M3 * T1 * T2;
    const denominator =
      G2 * G2 * G3 * G3 * M1 * M1 +
      2n * G2 * G3 * G3 * M1 * M2 * T1 +
      2n * G2 * G3 * M1 * M3 * T1 * T2 +
      G3 * G3 * M2 * M2 * T1 * T1 +
      2n * G3 * M2 * M3 * T1 * T1 * T2 +
      M3 * M3 * T1 * T1 * T2 * T2;

    return nominator / denominator;
  }

  public static swapTriangle(
    A1: bigint,
    L1: bigint,
    F1: bigint,
    A2: bigint,
    L2: bigint,
    F2: bigint,
    A3: bigint,
    L3: bigint,
    F3: bigint,
    X: bigint,
    actions: MarketAction[],
  ): bigint {
    //TODO: optimize
    type Market = { A: bigint; Q: bigint; L: bigint; F: bigint };
    const Q = 2n ** 96n;
    const ms: Market[] = [
      { A: A1, L: L1, F: F1, Q },
      { A: A2, L: L2, F: F2, Q },
      { A: A3, L: L3, F: F3, Q },
    ];

    for (let i = 0; i < 3; i++) {
      const action = actions[i];

      if (action === 'buy') {
        [ms[i].Q, ms[i].A] = [ms[i].A, ms[i].Q];
      }
    }

    return this.swapTriangleInternal(
      ms[0].A,
      ms[0].Q,
      ms[0].L,
      ms[0].F,
      ms[1].A,
      ms[1].Q,
      ms[1].L,
      ms[1].F,
      ms[2].A,
      ms[2].Q,
      ms[2].L,
      ms[2].F,
      X,
    );
  }

  public static extremumTriangle(
    A1: bigint,
    L1: bigint,
    F1: bigint,
    A2: bigint,
    L2: bigint,
    F2: bigint,
    A3: bigint,
    L3: bigint,
    F3: bigint,
    actions: MarketAction[],
  ): bigint {
    //TODO: optimize
    type Market = { A: bigint; Q: bigint; L: bigint; F: bigint };
    const Q = 2n ** 96n;
    const ms: Market[] = [
      { A: A1, L: L1, F: F1, Q },
      { A: A2, L: L2, F: F2, Q },
      { A: A3, L: L3, F: F3, Q },
    ];

    for (let i = 0; i < 3; i++) {
      const action = actions[i];

      if (action === 'buy') {
        [ms[i].Q, ms[i].A] = [ms[i].A, ms[i].Q];
      }
    }

    return this.extremumTriangleInternal(
      ms[0].A,
      ms[0].Q,
      ms[0].L,
      ms[0].F,
      ms[1].A,
      ms[1].Q,
      ms[1].L,
      ms[1].F,
      ms[2].A,
      ms[2].Q,
      ms[2].L,
      ms[2].F,
    );
  }
}
