// const q96 = 0x1000000000000000000000000n;
const q96 = 2n ** 96n;
const q32 = 2n ** 32n;
const L = 3253818547719723333727445;
const Ln = 3253818547719723333727445n;
// const sqrtPrice = 1751344134861520439033076463 / 2 ** 96;
const sqrtPrice = 1751344134861520439033076463 / 2 ** 96;
const sqrtPriceX96n = 1751344134861520439033076463n;

const x = L / sqrtPrice;
const y = L * sqrtPrice;

console.log('x', x, 'y', y);
console.log('x2', Ln * 2n ** 96n / sqrtPriceX96n, 'y2', Ln * sqrtPriceX96n / 2n ** 96n);
