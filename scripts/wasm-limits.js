'use strict';
const MAX_MEMORY_PAGES = 256;
function readVarUint32(bytes, offset, end) {
  let value = 0;
  for (let shift = 0; shift <= 28; shift += 7) {
    if (offset >= end) throw new Error('Malformed WASM section');
    const byte = bytes[offset++];
    if (shift === 28 && (byte & 0xf0)) throw new Error('Malformed WASM integer');
    value += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return [value, offset];
  }
  throw new Error('Malformed WASM integer');
}
function assertBoundedWasmMemory(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.toString('hex', 0, 8) !== '0061736d01000000') {
    throw new Error('Invalid WASM header');
  }
  let offset = 8; let foundMemory = false;
  while (offset < bytes.length) {
    const id = bytes[offset++]; let size;
    [size, offset] = readVarUint32(bytes, offset, bytes.length);
    const end = offset + size;
    if (end > bytes.length) throw new Error('Malformed WASM section');
    if (id === 5) {
      if (foundMemory) throw new Error('Duplicate WASM memory section');
      foundMemory = true;
      let count;
      [count, offset] = readVarUint32(bytes, offset, end);
      if (count > 1) throw new Error('Only one memory allowed');
      if (count === 1) {
        let flags; let min; let max;
        [flags, offset] = readVarUint32(bytes, offset, end);
        if (flags !== 1) throw new Error('Bounded 32-bit memory maximum required');
        [min, offset] = readVarUint32(bytes, offset, end);
        [max, offset] = readVarUint32(bytes, offset, end);
        if (min > max || max > MAX_MEMORY_PAGES) throw new Error('WASM memory exceeds 16 MiB');
      }
      if (offset !== end) throw new Error('Malformed WASM memory section');
    }
    offset = end;
  }
}
module.exports = { assertBoundedWasmMemory };
