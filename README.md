# @lp-labs/run-length-codec

A real byte-run binary codec with explicit triples, bounded decompression and incremental decoding.

## Install

```sh
npm install @lp-labs/run-length-codec
```

Version 0.1.0. MIT. Zero runtime, peer, or sibling dependencies. Node >=18;
browser-compatible ES2022 runtime without browser-global reads. ESM and CommonJS
exports have separate matching declarations.

## Quick start

```js
import { encodeRuns, decodeRuns, RunDecoder } from '@lp-labs/run-length-codec';
const wire = encodeRuns(Uint8Array.of(7, 7, 7, 9));
const plain = decodeRuns(wire, { maxOutputBytes: 4 });
if (plain.join() !== '7,7,7,9') throw new Error('decode');
const stream = new RunDecoder({ maxOutputBytes: 4 });
const first = stream.write(wire.subarray(0, 2));
const second = stream.write(wire.subarray(2));
stream.finish();
console.log(first.length, second.length); // 0, 4
```

## Contract, customization, errors and ownership

Wire format has no header: repeated three-byte records [value:u8, countLow:u8, countHigh:u8], an unsigned little-endian 16-bit count in 1..65535. Empty input encodes as empty bytes. Encoder splits longer runs at 65535; decoder also accepts adjacent equal-value records (noncanonical but valid). No escape markers, character encoding, compression ratio guarantee or compatibility with unrelated RLE formats.

`encodeRuns(Uint8Array, EncodeOptions)`: maxInputBytes defaults 16,000,000, maxOutputBytes 48,000,000. It pre-counts records before allocating exact output and rejects overflow before returning anything. `decodeRuns(Uint8Array, DecodeOptions)` uses the same decoder lifecycle as RunDecoder. Decoder defaults are maxInputBytes 48,000,000, maxOutputBytes 16,000,000. Every byte budget is an integer 0..2^32-1. Zero budgets allow empty data. Invalid budgets/overflows throw RangeError; invalid byte input throws TypeError.

`RunDecoder.write(chunk)` accepts arbitrary chunk boundaries, retains at most two pending bytes by value, and returns a fresh Uint8Array containing all runs completed in that call. Input/output budgets are cumulative across calls. It validates the whole chunk and output count before allocating/committing that call. Previously returned chunks remain valid if a later call fails. Any write failure puts the decoder in a terminal failed state; output from the failing call is not exposed. `finish()` closes an open stream, or throws SyntaxError and marks failed for a truncated triple. Zero counts throw SyntaxError. Repeated finish/write after closed/failed throws Error. No reset/recovery.

Outputs never alias input chunks. Runtime O(input bytes + decoded output); encode scans input twice. Whole-buffer decoding allocates its output plus run descriptors; incremental memory is current chunk run descriptors/output plus <=2 pending bytes. Budget before processing untrusted data; compressed input may expand by 65535/3 per record. Byte ownership is synchronous; do not mutate buffers concurrently from another thread.

## Complete public declaration contract

Runtime exports and all exported types are listed below. Internal storage members
are omitted. Optional settings are constructor/function options, not globals.

```ts
export interface EncodeOptions {
  maxInputBytes?: number;
  maxOutputBytes?: number;
}
export interface DecodeOptions {
  maxInputBytes?: number;
  maxOutputBytes?: number;
}
/** Wire format: repeated [value:u8, countLow:u8, countHigh:u8], count 1..65535. */
export declare function encodeRuns(input: Uint8Array, options?: EncodeOptions): Uint8Array;
export declare class RunDecoder {
  constructor(options?: DecodeOptions);
  write(chunk: Uint8Array): Uint8Array;
  finish(): void;
}
export declare function decodeRuns(input: Uint8Array, options?: DecodeOptions): Uint8Array;
```

## Development

```sh
npm ci --offline
npm run build
npm run typecheck
npm test
npm run format:check
```

TypeScript ^5.9.3 and Prettier ^3.6.2 are development-only. Offline installation
requires their locked packages already in the local npm cache. Build emits
dist/esm and dist/cjs with separate declarations; tests exercise runtime behavior
and bare-package ESM/CommonJS type consumers with negative checks. No publish
step is needed to build or test.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
