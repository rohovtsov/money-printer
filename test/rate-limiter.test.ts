import { RateLimiter } from '../src/entities';
import { expect } from 'chai';

describe('Rate limiter', function () {
  this.timeout(5000);

  it('Rate limit', async function () {
    const emitsPeerSecond = 8;
    const rateLimit = new RateLimiter(emitsPeerSecond);
    const maxSpeed = 1000 / emitsPeerSecond;

    let id = 0;
    let start = Date.now();
    let count = 0;
    setInterval(async () => {
      id++;
      await rateLimit.emit();
      count++;
      const time = Date.now() - start;
      expect(time / count).to.be.lt(maxSpeed);
    }, 50);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 3000);
    });
  });
});
