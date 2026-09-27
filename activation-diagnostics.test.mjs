import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const code = html.split('<script>')[1].split('    const herbs =')[0];
const key = 'zhongyao-license-v3';
const deviceKey = 'zhongyao-device-id-v1';
const secret = 'ZY-PRIVATE-CODE';
function app(options = {}) {
  const store = new Map(Object.entries(options.saved || {}));
  const nodes = Object.fromEntries(['licenseGate', 'licenseInput', 'licenseError', 'licenseBtn'].map(id => [id, {
    hidden: false, value: secret, textContent: '', focus() {}, addEventListener(e, f) { this[e] = f; }
  }]));
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  const ctx = {
    document: { getElementById: id => nodes[id] },
    localStorage: {
      getItem(k) { options.read?.(k); return store.get(k) ?? null; },
      setItem(k, v) { if (options.write?.(k, v) !== false) store.set(k, v); }
    },
    crypto: { randomUUID: () => 'private-test-device' }, AbortController,
    setTimeout(f, ms) { timers.set(++timerId, { f, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, opts) => { calls.push({ url, opts }); return options.response ? options.response(opts) : { ok: true, status: 200, json: async () => ({ ok: true, status: 'activated' }) }; },
    ...options.globals
  };
  vm.runInNewContext(code, ctx);
  return { store, nodes, calls, timers,
    async activate() { await nodes.licenseBtn.click(); },
    expire() { const timer = [...timers.values()].find(t => t.ms === 8000); assert.ok(timer); timer.f(); },
    message: () => nodes.licenseError.textContent
  };
}
function diagnostic(a, stage, category) {
  assert.equal(a.nodes.licenseGate.hidden, false);
  assert.match(a.message(), new RegExp(stage + '/' + category));
  assert.match(a.message(), /v1-actdiag-20260927-1/);
  assert.match(a.message(), /\d{4}-\d\d-\d\dT.*Z/);
  assert.match(a.message(), /耗时 \d+ms/);
  assert.match(a.message(), /诊断 AD-/);
  assert.ok(!a.message().includes(secret));
  assert.ok(!a.message().includes('private-test-device'));
}
const fail = () => { throw Error(secret + ' private-test-device'); };

test('startup storage failure is diagnosed, handler remains usable and no request occurs', async () => {
  const a = app({ read: fail }); diagnostic(a, 'INIT', 'STORAGE');
  await a.activate(); diagnostic(a, 'INIT', 'STORAGE'); assert.equal(a.calls.length, 0);
});
for (const name of ['fetch', 'AbortController']) test(`missing required API ${name}`, async () => {
  const a = app({ globals: { [name]: undefined } }); await a.activate(); diagnostic(a, 'ENV', 'API'); assert.equal(a.calls.length, 0);
});
test('AbortController constructor throws', async () => {
  const a = app({ globals: { AbortController: class { constructor() { fail(); } } } });
  await a.activate(); diagnostic(a, 'ENV', 'API'); assert.equal(a.calls.length, 0);
});
for (const fault of ['read', 'generate', 'write', 'silent-write']) test(`device ${fault} failure stops before fetch`, async () => {
  const opts = fault === 'read' ? { read: k => { if (k === deviceKey) fail(); } }
    : fault === 'generate' ? { globals: { crypto: { randomUUID: fail } } }
    : { write: k => { if (k === deviceKey) { if (fault === 'write') fail(); return false; } } };
  const a = app(opts); await a.activate(); diagnostic(a, 'DEVICE_STORAGE', fault === 'generate' ? 'GENERATE' : 'STORAGE'); assert.equal(a.calls.length, 0);
});
test('missing crypto uses existing supported non-crypto device fallback', async () => {
  const a = app({ globals: { crypto: undefined } }); await a.activate(); assert.equal(a.nodes.licenseGate.hidden, true); assert.ok(a.store.get(deviceKey));
});
test('existing device is preserved and persistence checked before fetch', async () => {
  const a = app({ saved: { [deviceKey]: 'existing-device' }, write: k => { if (k === deviceKey) fail(); } });
  await a.activate(); diagnostic(a, 'DEVICE_STORAGE', 'STORAGE'); assert.equal(a.calls.length, 0); assert.equal(a.store.get(deviceKey), 'existing-device');
});
for (const name of ['TypeError', 'AbortError']) test(`${name} without local timer is NOT timeout`, async () => {
  const a = app({ response: async () => { throw Object.assign(Error(secret), { name }); } });
  await a.activate(); diagnostic(a, 'REQUEST', 'NETWORK_OR_CORS');
});
for (const body of [false, true]) test(`actual timeout during ${body ? 'body' : 'request'} ignores late approval`, { timeout: 1000 }, async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const a = app({ response: async () => body ? { ok: true, status: 200, json: () => pending } : pending });
  const attempt = a.activate(); await Promise.resolve(); await Promise.resolve(); a.expire(); await attempt;
  diagnostic(a, 'REQUEST', 'TIMEOUT');
  resolve(body ? { ok: true, status: 'activated' } : { ok: true, status: 200, json: async () => ({ ok: true, status: 'activated' }) });
  await Promise.resolve(); assert.equal(a.store.get(key), undefined); assert.equal(a.nodes.licenseBtn.disabled, false);
});
for (const status of ['invalid', 'disabled', 'device_limit_reached']) test(`server rejection ${status}`, async () => {
  const a = app({ response: async () => ({ ok: false, status: 403, json: async () => ({ ok: false, status, message: secret }) }) });
  await a.activate(); diagnostic(a, 'SERVER_RESPONSE', status.toUpperCase());
});
test('server HTTP 502, including non-JSON body, is service failure', async () => {
  const a = app({ response: async () => ({ ok: false, status: 502, json: fail }) });
  await a.activate(); diagnostic(a, 'SERVER_RESPONSE', 'SERVICE'); assert.match(a.message(), /HTTP 502/);
});
for (const payload of [null, {}, [], { ok: 'true', status: 'activated' }, { ok: true, status: 'disabled' }, { ok: true, status: 'unknown' }]) test(`malformed payload ${JSON.stringify(payload)}`, async () => {
  const a = app({ response: async () => ({ ok: true, status: 200, json: async () => payload }) });
  await a.activate(); diagnostic(a, 'SERVER_RESPONSE', 'FORMAT');
});
test('bad JSON is format, not network', async () => {
  const a = app({ response: async () => ({ ok: true, status: 200, json: fail }) });
  await a.activate(); diagnostic(a, 'SERVER_RESPONSE', 'FORMAT');
});
test('body network interruption is not a JSON format error', async () => {
  const a = app({ response: async () => ({ ok: true, status: 200, json: async () => { throw new TypeError(secret); } }) });
  await a.activate(); diagnostic(a, 'REQUEST', 'NETWORK_OR_CORS');
});
for (const suffix of ['', '-at', '-mode']) test(`silently discarded approval write ${suffix} stays locked`, async () => {
  const a = app({ write(k, v) { if (k === key + suffix && v !== 'pending') return false; } });
  await a.activate(); diagnostic(a, 'SAVE_APPROVAL', 'STORAGE');
  assert.equal(app({ saved: Object.fromEntries(a.store) }).nodes.licenseGate.hidden, false);
});
for (const part of ['pending', 'at', 'mode', 'commit']) for (const legacy of [false, true]) test(`approval write ${part}, legacy=${legacy}, cannot produce valid partial approval`, async () => {
  const saved = legacy ? { [key]: 'activated', [key + '-mode']: 'fallback', [deviceKey]: 'existing-device' } : {};
  const a = app({ saved, write(k, v) {
    if (part === 'pending' && k === key && v !== 'activated' || part === 'at' && k === key + '-at' || part === 'mode' && k === key + '-mode' || part === 'commit' && k === key && v === 'activated') fail();
  } });
  await a.activate(); diagnostic(a, 'SAVE_APPROVAL', 'STORAGE'); assert.match(a.message(), /验证已通过，但本机保存失败，请联系支持/);
  assert.ok(a.store.get(deviceKey)); assert.equal(app({ saved: Object.fromEntries(a.store) }).nodes.licenseGate.hidden, false);
});
test('valid existing approval opens offline without writing storage or requiring APIs', () => {
  const a = app({ saved: { [key]: 'activated', [key + '-mode']: 'server', [deviceKey]: 'existing-device', 'herb-review-state': 'keep' }, write: fail, globals: { fetch: undefined, AbortController: undefined, crypto: undefined } });
  assert.equal(a.nodes.licenseGate.hidden, true); assert.equal(a.calls.length, 0); assert.equal(a.store.get('herb-review-state'), 'keep');
});
test('successful first activation, unchanged request headers, reload persistence', async () => {
  const a = app(); await a.activate(); assert.equal(a.nodes.licenseGate.hidden, true);
  assert.deepEqual(Object.keys(a.calls[0].opts.headers), ['Content-Type']);
  assert.equal(app({ saved: Object.fromEntries(a.store) }).nodes.licenseGate.hidden, true);
});
