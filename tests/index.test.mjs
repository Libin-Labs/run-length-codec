import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRuns, decodeRuns, RunDecoder } from '../dist/esm/index.js';
test('wire triples are value, uint16 little endian count, with empty identity', () => {
  const input = Uint8Array.of(7, 7, 7, 9);
  assert.deepEqual(encodeRuns(input), Uint8Array.of(7, 3, 0, 9, 1, 0));
  assert.deepEqual(decodeRuns(encodeRuns(input)), input);
  assert.equal(encodeRuns(new Uint8Array()).length, 0);
  assert.equal(decodeRuns(new Uint8Array()).length, 0);
});
test('runs longer than 65535 split and noncanonical adjacent runs decode', () => {
  const input = new Uint8Array(65536).fill(255),
    packed = encodeRuns(input);
  assert.deepEqual(packed, Uint8Array.of(255, 255, 255, 255, 1, 0));
  assert.deepEqual(decodeRuns(packed, { maxOutputBytes: 65536 }), input);
  assert.deepEqual(decodeRuns(Uint8Array.of(8, 1, 0, 8, 1, 0)), Uint8Array.of(8, 8));
});
test('incremental decoder accepts every boundary and owns pending bytes', () => {
  const wire = Uint8Array.of(2, 3, 0, 4, 2, 0);
  for (let cut = 0; cut <= wire.length; cut++) {
    const d = new RunDecoder(),
      first = wire.slice(0, cut),
      a = d.write(first);
    first.fill(99);
    const b = d.write(wire.slice(cut));
    d.finish();
    assert.deepEqual([...a, ...b], [2, 2, 2, 4, 4]);
    assert.throws(() => d.write(new Uint8Array()), /closed/);
  }
});
test('malformed triples fail terminally; finish cannot be repeated', () => {
  for (const wire of [Uint8Array.of(1), Uint8Array.of(1, 1), Uint8Array.of(1, 0, 0)])
    assert.throws(() => decodeRuns(wire), SyntaxError);
  const d = new RunDecoder();
  d.write(Uint8Array.of(1));
  assert.throws(() => d.finish(), SyntaxError);
  assert.throws(() => d.finish(), /failed/);
  assert.throws(() => d.write(Uint8Array.of(1, 0)), /failed/);
  const closed = new RunDecoder();
  closed.finish();
  assert.throws(() => closed.finish(), /closed/);
});
test('exact cumulative input and decompression budgets, including zero budgets', () => {
  const d = new RunDecoder({ maxInputBytes: 6, maxOutputBytes: 3 });
  assert.deepEqual(d.write(Uint8Array.of(1, 2, 0)), Uint8Array.of(1, 1));
  assert.deepEqual(d.write(Uint8Array.of(2, 1, 0)), Uint8Array.of(2));
  d.finish();
  const over = new RunDecoder({ maxOutputBytes: 2 });
  over.write(Uint8Array.of(1, 2, 0));
  assert.throws(() => over.write(Uint8Array.of(2, 1, 0)), RangeError);
  assert.throws(() => over.write(new Uint8Array()), /failed/);
  assert.throws(() => decodeRuns(Uint8Array.of(1, 1, 0), { maxInputBytes: 2 }));
  assert.throws(() => encodeRuns(Uint8Array.of(1), { maxOutputBytes: 2 }));
  assert.throws(() => encodeRuns(Uint8Array.of(1), { maxInputBytes: 0 }));
  assert.equal(encodeRuns(new Uint8Array(), { maxOutputBytes: 0, maxInputBytes: 0 }).length, 0);
  assert.equal(decodeRuns(new Uint8Array(), { maxOutputBytes: 0, maxInputBytes: 0 }).length, 0);
});
test('types and malformed budgets reject; outputs do not alias input', () => {
  assert.throws(() => encodeRuns([1]));
  assert.throws(() => decodeRuns([1, 1, 0]));
  for (const n of [-1, NaN, Infinity, 0.5, 0x100000000]) {
    assert.throws(() => new RunDecoder({ maxOutputBytes: n }));
    assert.throws(() => encodeRuns(new Uint8Array(), { maxInputBytes: n }));
  }
  const input = Uint8Array.of(3, 3),
    packed = encodeRuns(input),
    decoded = decodeRuns(packed);
  input.fill(9);
  packed.fill(0);
  assert.deepEqual(decoded, Uint8Array.of(3, 3));
});
test('seeded byte-array oracle checks binary run structure and randomized chunks', () => {
  let seed = 357;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 8;
  };
  for (let trial = 0; trial < 150; trial++) {
    const input = [];
    for (let i = 0; i < 30; i++) {
      const count = 1 + (random() % 50),
        value = random() % 256;
      for (let j = 0; j < count; j++) input.push(value);
    }
    const packed = encodeRuns(Uint8Array.from(input)),
      oracle = [];
    for (let i = 0; i < packed.length; i += 3)
      for (let n = 0; n < packed[i + 1] + packed[i + 2] * 256; n++) oracle.push(packed[i]);
    assert.deepEqual(oracle, input);
    const d = new RunDecoder(),
      output = [];
    for (let at = 0; at < packed.length;) {
      const end = Math.min(packed.length, at + 1 + (random() % 7));
      output.push(...d.write(packed.slice(at, end)));
      at = end;
    }
    d.finish();
    assert.deepEqual(output, input);
  }
});
