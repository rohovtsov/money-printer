// const q96 = 0x1000000000000000000000000n;
const q96 = 2n ** 96n;
const q32 = 2n ** 32n;
const L = 3253818547719723333727445;
// const sqrtPrice = 1751344134861520439033076463 / 2 ** 96;
const sqrtPrice = 1751344134861520439033076463 / 2 ** 96;

const x = L / sqrtPrice;
const y = L * sqrtPrice;

console.log('x', x, 'y', y);
