/**
 * High-performance Fixed-size Ring Buffer for real-time sensor stream
 * Avoids GC pauses and array allocations at 100 Hz
 */

export class RingBuffer<T> {
  private buffer: (T | null)[];
  private capacity: number;
  private head: number = 0;
  private size: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
  }

  public push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  public clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.size = 0;
  }

  public getSize(): number {
    return this.size;
  }

  public getCapacity(): number {
    return this.capacity;
  }

  /**
   * Return the latest item
   */
  public getLatest(): T | null {
    if (this.size === 0) return null;
    const index = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[index];
  }

  /**
   * Return an array of items ordered from oldest to newest
   */
  public toArray(): T[] {
    const result: T[] = new Array(this.size);
    if (this.size === 0) return result;

    const start = (this.head - this.size + this.capacity) % this.capacity;
    for (let i = 0; i < this.size; i++) {
      result[i] = this.buffer[(start + i) % this.capacity] as T;
    }
    return result;
  }
}
