import { bigIntSqrtFast } from '../../entities';

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
  public static swapTriangle(
    T1: bigint,
    M1: bigint,
    G1: bigint,
    T2: bigint,
    M2: bigint,
    G2: bigint,
    T3: bigint,
    M3: bigint,
    G3: bigint,
    X: bigint,
  ): bigint {
    return (
      (T1 * T2 * T3 * X) / (G1 * G2 * G3 + G2 * G3 * M1 * X + G3 * M2 * T1 * X + M3 * T1 * T2 * X)
    );
  }

  //https://www.wolframalpha.com/input?i=-1+%2B+%28G1+G2+G3+T1+T2+T3%29%2F%28G1+G2+G3+%2B+G2+G3+M1+x+%2B+G3+M2+T1+x+%2B+M3+T1+T2+x%29%5E2+%3D+0
  public static extremumTriangle(
    T1: bigint,
    M1: bigint,
    G1: bigint,
    T2: bigint,
    M2: bigint,
    G2: bigint,
    T3: bigint,
    M3: bigint,
    G3: bigint,
  ): bigint {
    const forSQRT =
      G1 * G2 * G2 * G2 * G3 * G3 * G3 * M1 * M1 * T1 * T2 * T3 +
      2n * G1 * G2 * G2 * G3 * G3 * G3 * M1 * M2 * T1 * T1 * T2 * T3 +
      2n * G1 * G2 * G2 * G3 * G3 * M1 * M3 * T1 * T1 * T2 * T2 * T3 +
      G1 * G2 * G3 * G3 * G3 * M2 * M2 * T1 * T1 * T1 * T2 * T3 +
      2n * G1 * G2 * G3 * G3 * M2 * M3 * T1 * T1 * T1 * T2 * T2 * T3 +
      G1 * G2 * G3 * M3 * M3 * T1 * T1 * T1 * T2 * T2 * T2 * T3;
    const SQRT = bigIntSqrtFast(forSQRT);

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

  public static zeroTriangle(
    T1: bigint,
    M1: bigint,
    G1: bigint,
    T2: bigint,
    M2: bigint,
    G2: bigint,
    T3: bigint,
    M3: bigint,
    G3: bigint,
  ): bigint {
    const nominator = T1 * T2 * T3 - G1 * G2 * G3;
    const denominator = G2 * G3 * M1 + G3 * M2 * T1 + M3 * T1 * T2;
    return nominator / denominator;
  }

  //https://www.wolframalpha.com/input?i=Y1+%3D+%28T1+*+X%29+%2F+%28M1+*+X+%2B+G1%29%2C+for+Y2+%3D+%28T2+*+Y1%29+%2F+%28M2+*+Y1+%2B+G2%29
  public static duoangleSwap(
    T1: bigint,
    M1: bigint,
    G1: bigint,
    T2: bigint,
    M2: bigint,
    G2: bigint,
    X: bigint,
  ): bigint {
    return (T1 * T2 * X) / (G1 * G2 + G2 * M1 * X + M2 * T1 * X);
  }

  //https://www.wolframalpha.com/input?i=-1+%2B+%28G1+G2+T1+T2%29%2F%28G1+G2+%2B+G2+M1+X+%2B+M2+T1+X%29%5E2+%3D+0
  public static duoangleExtremum(
    T1: bigint,
    M1: bigint,
    G1: bigint,
    T2: bigint,
    M2: bigint,
    G2: bigint,
  ): bigint {
    const forSQRT =
      G1 * G2 * G2 * G2 * M1 * M1 * T1 * T2 +
      2n * G1 * G2 * G2 * M1 * M2 * T1 * T1 * T2 +
      G1 * G2 * M2 * M2 * T1 * T1 * T1 * T2;

    const SQRT = bigIntSqrtFast(forSQRT);

    const nominator = -G1 * G2 * G2 * M1 + SQRT - G1 * G2 * M2 * T1;
    const denominator = G2 * G2 * M1 * M1 + 2n * G2 * M1 * M2 * T1 + M2 * M2 * T1 * T1;

    return nominator / denominator;
  }
}
