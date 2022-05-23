console.log('https://etherscan.io/block/14828044');
console.log('Bundle rejected: effective gas price of 0.938744302 is below the current gas floor of 1');
console.log('Simulation successful. profitNet: 0.000101245986972313 profitGross: 0.003880358104106035, gasFees: 0.003542871480864994, coinbase: 0.000236240636268728, - at block: 14828043');

const basePrice = 14.900664859;
const myGasPrice = 15.8942494601;
const myGas = 237766;
const myLimit = 600000;
const debiki = [
  [46605, 55926, 16.400664859, 21.832170518],
  [46626, 55951, 16.400664859, 21.832170518],
  [21000, 21000, 16.400664859, 21.832170518],
  [78569, 97769, 16.400664859, 21.832170518],
  [163639, 182718, 16.400664859, 21.832170518],
  [81986, 81986, 16.400664859, 21.832170518],
  [21000, 21000, 16.400664859, 21.39521944],
  [231778, 307735, 16.400664859, 21.832170518],
]

let totalGas = 0;
let totalGasLimit = 0;
let totalGasFee = 0;
let totalGasPrice = 0;

for (let i = 0; i < debiki.length; i++) {
  const gas = debiki[i][0];
  const gasLimit = debiki[i][1];
  const gasPrice = debiki[i][2];
  const maxGasPrice = debiki[i][3];

  /*if (totalGas >= myLimit) {
    continue;
  }*/

  totalGas += gas;
  totalGasLimit += gasLimit;
  totalGasFee += (gas * gasPrice);
}


totalGasPrice = totalGasFee / totalGas;
console.log(totalGas, '/', totalGasLimit);
console.log(totalGasFee);
console.log(totalGasPrice);
console.log(myGasPrice);
console.log(myGasPrice / totalGasPrice);
