'use strict';

const { parentPort, workerData } = require('node:worker_threads');

(async () => {
  const module = await WebAssembly.compile(workerData.wasmBytes);
  if (WebAssembly.Module.imports(module).length) throw new Error('Methodology WASM imports are forbidden');
  const instance = await WebAssembly.instantiate(module);
  const { memory, alloc, dealloc, result_len: resultLen, compute } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || typeof alloc !== 'function' || typeof dealloc !== 'function'
    || typeof resultLen !== 'function' || typeof compute !== 'function') throw new Error('JSON WASM v2 exports are incomplete');
  const input = Buffer.from(workerData.inputBytes);
  const inputPointer = alloc(input.length);
  if (!Number.isInteger(inputPointer) || inputPointer <= 0 || inputPointer + input.length > memory.buffer.byteLength)
    throw new Error('JSON WASM v2 input allocation is invalid');
  let outputPointer = 0;
  let outputLength = 0;
  try {
    new Uint8Array(memory.buffer, inputPointer, input.length).set(input);
    outputPointer = compute(inputPointer, input.length);
    outputLength = resultLen();
    if (!Number.isInteger(outputPointer) || outputPointer <= 0 || !Number.isInteger(outputLength)
      || outputLength < 1 || outputLength > 512 * 1024 || outputPointer + outputLength > memory.buffer.byteLength)
      throw new Error('JSON WASM v2 output allocation is invalid');
    const output = Uint8Array.from(new Uint8Array(memory.buffer, outputPointer, outputLength));
    dealloc(outputPointer, outputLength);
    outputPointer = 0;
    parentPort.postMessage(output);
  } finally {
    if (outputPointer > 0 && outputLength > 0) dealloc(outputPointer, outputLength);
    dealloc(inputPointer, input.length);
  }
})().catch(error => parentPort.postMessage({ error: String(error.message || error) }));
