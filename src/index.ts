export interface EncodeOptions {
  maxInputBytes?: number;
  maxOutputBytes?: number;
}
export interface DecodeOptions {
  maxInputBytes?: number;
  maxOutputBytes?: number;
}
function limit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff)
    throw new RangeError('Invalid byte budget');
  return value;
}
function bytes(value: Uint8Array): void {
  if (!(value instanceof Uint8Array)) throw new TypeError('Expected Uint8Array');
}
/** Wire format: repeated [value:u8, countLow:u8, countHigh:u8], count 1..65535. */
export function encodeRuns(input: Uint8Array, options: EncodeOptions = {}): Uint8Array {
  bytes(input);
  const maximum = limit(options.maxOutputBytes ?? 48_000_000);
  if (input.length > limit(options.maxInputBytes ?? 16_000_000))
    throw new RangeError('Input budget exceeded');
  let runs = 0;
  for (let i = 0; i < input.length;) {
    const value = input[i]!;
    let count = 1;
    while (count < 65535 && i + count < input.length && input[i + count] === value) count++;
    if (++runs > Math.floor(maximum / 3)) throw new RangeError('Encoded output budget exceeded');
    i += count;
  }
  const out = new Uint8Array(runs * 3);
  for (let i = 0, at = 0; i < input.length;) {
    const value = input[i]!;
    let count = 1;
    while (count < 65535 && i + count < input.length && input[i + count] === value) count++;
    out[at++] = value;
    out[at++] = count & 255;
    out[at++] = count >>> 8;
    i += count;
  }
  return out;
}
export class RunDecoder {
  private readonly inputLimit: number;
  private readonly outputLimit: number;
  private inputCount = 0;
  private outputCount = 0;
  private pending: number[] = [];
  private state: 'open' | 'closed' | 'failed' = 'open';
  constructor(options: DecodeOptions = {}) {
    this.inputLimit = limit(options.maxInputBytes ?? 48_000_000);
    this.outputLimit = limit(options.maxOutputBytes ?? 16_000_000);
  }
  write(chunk: Uint8Array): Uint8Array {
    if (this.state !== 'open') throw new Error('Decoder is closed or failed');
    try {
      bytes(chunk);
      if (chunk.length > this.inputLimit - this.inputCount)
        throw new RangeError('Input budget exceeded');
      const pending = [...this.pending],
        runs: [number, number][] = [];
      let length = 0;
      for (const byte of chunk) {
        pending.push(byte);
        if (pending.length !== 3) continue;
        const count = pending[1]! + pending[2]! * 256;
        if (count === 0) throw new SyntaxError('Zero run length');
        if (count > this.outputLimit - this.outputCount - length)
          throw new RangeError('Decompression budget exceeded');
        length += count;
        runs.push([pending[0]!, count]);
        pending.length = 0;
      }
      const out = new Uint8Array(length);
      let at = 0;
      for (const [value, count] of runs) {
        out.fill(value, at, at + count);
        at += count;
      }
      this.pending = pending;
      this.inputCount += chunk.length;
      this.outputCount += length;
      return out;
    } catch (error) {
      this.state = 'failed';
      this.pending = [];
      throw error;
    }
  }
  finish(): void {
    if (this.state !== 'open') throw new Error('Decoder is closed or failed');
    if (this.pending.length) {
      this.state = 'failed';
      this.pending = [];
      throw new SyntaxError('Truncated run triple');
    }
    this.state = 'closed';
  }
}
export function decodeRuns(input: Uint8Array, options: DecodeOptions = {}): Uint8Array {
  const decoder = new RunDecoder(options),
    output = decoder.write(input);
  decoder.finish();
  return output;
}
