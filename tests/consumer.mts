import {
  encodeRuns,
  decodeRuns,
  RunDecoder,
  type EncodeOptions,
  type DecodeOptions,
} from '@lp-labs/run-length-codec';
const options: EncodeOptions = { maxOutputBytes: 6 };
const encoded: Uint8Array = encodeRuns(Uint8Array.of(1), options);
const limits: DecodeOptions = { maxOutputBytes: 2 };
const decoder = new RunDecoder(limits);
const decoded: Uint8Array = decodeRuns(encoded, limits);
decoder.write(encoded);
decoder.finish();
// @ts-expect-error byte array required
encodeRuns([1]);
// @ts-expect-error numeric budget required
new RunDecoder({ maxOutputBytes: '1' });
void decoded;
