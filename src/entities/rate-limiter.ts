export class RateLimiter {
  private readonly emittedAt: number[] = [];

  constructor(private emitsPerSecond: number) {
    this.emittedAt = [];
  }

  private nextTick(): number {
    const now = Date.now();
    this.clearFirstEmits(now);
    const emitsCount: number = this.emittedAt.length;
    const firstEmitAt: number = this.emittedAt?.[0] ?? now;

    if (emitsCount < this.emitsPerSecond) {
      this.emittedAt.push(now);
      return 0;
    } else {
      return Math.max(firstEmitAt + 1000 - now, 0);
    }
  }

  private clearFirstEmits(now: number) {
    let deleteCount = 0;
    for (let i = 0; i < this.emittedAt.length; i++) {
      if (this.emittedAt[i] + 1000 <= now) {
        deleteCount = i + 1;
      } else {
        break;
      }
    }

    if (deleteCount > 0) {
      this.emittedAt.splice(0, deleteCount);
    }
  }

  async emit(): Promise<void> {
    const delay = this.nextTick();

    if (delay > 0) {
      await this.wait(delay);
      return this.emit();
    }
  }

  async wait(delay: number): Promise<void> {
    if (delay > 0) {
      return new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
