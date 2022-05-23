import { delay, from, mergeMap, of, race, shareReplay } from 'rxjs';
import { sleep } from '../src/entities';

describe('Test smart simulation buffer', function () {
  this.timeout(10000);

  it('Test smart simulation buffer', () => {
    const simulations$ = from([0, 1, 2, 3, 4, 5, 6, 7]).pipe(
      mergeMap((i) => {
        console.log(i);
        return of(i * 10).pipe(delay(Math.random() * 1000));
      }),
      shareReplay(1),
    );

    /*simulations$.
    interval(500).pipe(
      bufferTime(1000)
    ).subscribe(console.log);*/

    race([
      //TODO: complete all
      simulations$,
      //TODO: buffer 100ms,
      simulations$,
    ]).subscribe(console.log);

    return sleep(5000);
  });
});
