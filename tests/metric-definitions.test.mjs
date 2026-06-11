import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defsPath = path.join(__dirname, '..', 'scripts', 'metric_definitions.json');

const REQUIRED_FIELDS = ['key', 'name', 'category', 'sheet', 'column', 'unit', 'change_mode'];
const VALID_CATEGORIES = new Set([
  'domestic_rates', 'global_rates', 'credit',
  'domestic_equities_fx', 'global_equities', 'fx',
  'crypto', 'commodities', 'investor_flows',
]);
const VALID_CHANGE_MODES = new Set(['rate_bp', 'spread_bp', 'pct', 'flow_abs']);

let defs;

test('metric_definitions.json parses as an array', async () => {
  const raw = await readFile(defsPath, 'utf-8');
  defs = JSON.parse(raw);
  assert.ok(Array.isArray(defs), 'must be a JSON array');
});

test('contains exactly 59 metrics', async () => {
  const raw = await readFile(defsPath, 'utf-8');
  defs = JSON.parse(raw);
  assert.equal(defs.length, 59, `expected 59, got ${defs.length}`);
});

test('all metric keys are unique', async () => {
  const raw = await readFile(defsPath, 'utf-8');
  defs = JSON.parse(raw);
  const keys = defs.map((d) => d.key);
  const unique = new Set(keys);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.equal(unique.size, keys.length, `duplicate keys: ${dupes.join(', ')}`);
});

test('all metrics have required fields with non-empty string values', async () => {
  const raw = await readFile(defsPath, 'utf-8');
  defs = JSON.parse(raw);
  for (const def of defs) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(typeof def[field] === 'string' && def[field].length > 0,
        `metric "${def.key}" field "${field}" is missing or empty`);
    }
  }
});

test('all categories are valid', async () => {
  const raw = await readFile(defsPath, 'utf-8');
  defs = JSON.parse(raw);
  for (const def of defs) {
    assert.ok(VALID_CATEGORIES.has(def.category),
      `metric "${def.key}" has unknown category "${def.category}"`);
  }
});

test('all change_modes are valid', async () => {
  const raw = await readFile(defsPath, 'utf-8');
  defs = JSON.parse(raw);
  for (const def of defs) {
    assert.ok(VALID_CHANGE_MODES.has(def.change_mode),
      `metric "${def.key}" has unknown change_mode "${def.change_mode}"`);
  }
});

test('value_multiplier is a positive finite number when present', async () => {
  const raw = await readFile(defsPath, 'utf-8');
  defs = JSON.parse(raw);
  for (const def of defs) {
    if (def.value_multiplier !== undefined) {
      assert.ok(typeof def.value_multiplier === 'number' && Number.isFinite(def.value_multiplier) && def.value_multiplier > 0,
        `metric "${def.key}" has invalid value_multiplier "${def.value_multiplier}"`);
    }
  }
});
