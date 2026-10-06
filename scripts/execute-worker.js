'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { assertBoundedWasmMemory } = require('./wasm-limits');
(async () => {
  try {
    assertBoundedWasmMemory(Buffer.from(workerData.bytes));
    const module = await WebAssembly.compile(workerData.bytes);
    if (WebAssembly.Module.imports(module).length) throw new Error('Imports are not allowed');
    const instance = await WebAssembly.instantiate(module);
    const value = instance.exports.compute(...workerData.args);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid output');
    parentPort.postMessage({ value });
  } catch (error) { parentPort.postMessage({ error: error.message }); }
})();
