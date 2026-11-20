'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Ajv2020 = require('ajv/dist/2020').default;
const definition = require('../methodologies/tumbler/2001-v6/definition.json');

test('v6 bulk evidence preserves device items and rejects incomplete items', () => {
  const validate = new Ajv2020({ strict: true }).compile(definition.evidenceInputSchema);
  const item = { certHash: 'ab'.repeat(32), counter: 1, model: 'test',
    payload: { timeStamp: 'ea070101000000', elapsedTick: 1, distance: 0 }, signatureDerBase64: 'AA==' };
  const input = { batchId: 'batch', deviceSerial: 'test-device', certificateDerBase64: 'AA==',
    requestedAmountsMl: [500], items: [item, { ...item, counter: 2, payload: { ...item.payload, elapsedTick: 2, distance: 5 } }] };
  assert.equal(validate(input), true);
  assert.equal(validate({ ...input, items: [{ ...item, signatureDerBase64: undefined }, input.items[1]] }), false);
  assert.equal(validate({ ...input, items: [item] }), false);
  assert.equal(validate({ ...input, certificateDerBase64: '' }), false);
});
