'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const AdmZip = require('adm-zip');

function freshTokensPath() {
  return path.join(os.tmpdir(), `w0nd3r-guard-tokens-test-${crypto.randomUUID()}.json`);
}

const crypto = require('crypto');

test('tokens: subscription token stays active across multiple scans', () => {
  process.env.W0ND3R_GUARD_TOKENS_PATH = freshTokensPath();
  delete require.cache[require.resolve('../src/web/tokens')];
  const tokens = require('../src/web/tokens');

  const token = tokens.createToken({ customerId: 'cus_1', subscriptionId: 'sub_1', kind: 'subscription' });
  assert.equal(tokens.isTokenActive(token), true);
  tokens.recordScanUsed(token);
  tokens.recordScanUsed(token);
  assert.equal(tokens.isTokenActive(token), true);

  fs.rmSync(process.env.W0ND3R_GUARD_TOKENS_PATH, { force: true });
  delete process.env.W0ND3R_GUARD_TOKENS_PATH;
});

test('tokens: one-time token is spent after a single scan', () => {
  process.env.W0ND3R_GUARD_TOKENS_PATH = freshTokensPath();
  delete require.cache[require.resolve('../src/web/tokens')];
  const tokens = require('../src/web/tokens');

  const token = tokens.createToken({ customerId: 'cus_2', kind: 'one_time' });
  assert.equal(tokens.isTokenActive(token), true);
  tokens.recordScanUsed(token);
  assert.equal(tokens.isTokenActive(token), false);

  fs.rmSync(process.env.W0ND3R_GUARD_TOKENS_PATH, { force: true });
  delete process.env.W0ND3R_GUARD_TOKENS_PATH;
});

test('tokens: deactivateBySubscription revokes all tokens tied to that subscription', () => {
  process.env.W0ND3R_GUARD_TOKENS_PATH = freshTokensPath();
  delete require.cache[require.resolve('../src/web/tokens')];
  const tokens = require('../src/web/tokens');

  const token = tokens.createToken({ customerId: 'cus_3', subscriptionId: 'sub_3', kind: 'subscription' });
  assert.equal(tokens.isTokenActive(token), true);
  tokens.deactivateBySubscription('sub_3');
  assert.equal(tokens.isTokenActive(token), false);

  fs.rmSync(process.env.W0ND3R_GUARD_TOKENS_PATH, { force: true });
  delete process.env.W0ND3R_GUARD_TOKENS_PATH;
});

test('tokens: unknown token is never active', () => {
  process.env.W0ND3R_GUARD_TOKENS_PATH = freshTokensPath();
  delete require.cache[require.resolve('../src/web/tokens')];
  const tokens = require('../src/web/tokens');

  assert.equal(tokens.isTokenActive('does-not-exist'), false);

  fs.rmSync(process.env.W0ND3R_GUARD_TOKENS_PATH, { force: true });
  delete process.env.W0ND3R_GUARD_TOKENS_PATH;
});

test('upload: extractZip rejects a zip-slip path-traversal entry', () => {
  const { extractZip } = require('../src/web/upload');

  // adm-zip's own addFile() sanitizes the entry name on write, so a
  // traversal path never survives that path. To exercise our guard
  // against a genuinely malicious zip (e.g. crafted by a non-adm-zip
  // tool), bypass the writer's sanitization by setting entryName
  // directly on the ZipEntry after adding a placeholder file — the
  // entryName setter itself does no normalization.
  const zip = new AdmZip();
  zip.addFile('placeholder.lua', Buffer.from('print("pwned")'));
  zip.getEntries()[0].entryName = '../../evil.lua';

  const zipPath = path.join(os.tmpdir(), `zip-slip-test-${crypto.randomUUID()}.zip`);
  zip.writeZip(zipPath);

  // Sanity check: confirm the traversal name actually made it into the
  // zip bytes, so this test would fail loudly if adm-zip starts
  // sanitizing entryName assignment in a future version.
  const rawEntries = new AdmZip(zipPath).getEntries();
  assert.equal(rawEntries[0].entryName, '../../evil.lua');

  assert.throws(() => extractZip(zipPath), /escapes the extraction directory/);

  fs.rmSync(zipPath, { force: true });
});

test('upload: extractZip succeeds on a well-formed zip', () => {
  const { extractZip, cleanupPaths } = require('../src/web/upload');

  const zip = new AdmZip();
  zip.addFile('server/main.lua', Buffer.from("print('hi')"));
  const zipPath = path.join(os.tmpdir(), `zip-ok-test-${crypto.randomUUID()}.zip`);
  zip.writeZip(zipPath);

  const destDir = extractZip(zipPath);
  assert.equal(fs.existsSync(path.join(destDir, 'server', 'main.lua')), true);

  fs.rmSync(zipPath, { force: true });
  cleanupPaths(destDir);
});

function withServer(env, callback) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }

  delete require.cache[require.resolve('../src/web/server')];
  const { createServer } = require('../src/web/server');
  const server = createServer();

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      try {
        await callback(port);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
        for (const key of Object.keys(previous)) {
          if (previous[key] === undefined) delete process.env[key];
          else process.env[key] = previous[key];
        }
      }
    });
  });
}

function fetchJson(port, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method: options.method || 'GET', headers: options.headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test('server: /api/config reflects W0ND3R_GUARD_REQUIRE_PAYMENT', async () => {
  await withServer({ W0ND3R_GUARD_REQUIRE_PAYMENT: 'true' }, async (port) => {
    const { status, body } = await fetchJson(port, '/api/config');
    assert.equal(status, 200);
    assert.equal(body.requirePayment, true);
  });
});

test('server: /api/scan (path-based) is blocked when payment is required', async () => {
  await withServer({ W0ND3R_GUARD_REQUIRE_PAYMENT: 'true' }, async (port) => {
    const { status, body } = await fetchJson(port, '/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'D:\\some\\path' }),
    });
    assert.equal(status, 403);
    assert.match(body.error, /disabled on the hosted instance/);
  });
});

test('server: /api/scan (path-based) works when payment is not required', async () => {
  const fixturePath = path.join(__dirname, '..', 'test-fixtures', 'rules', 'sql-string-concat', 'vulnerable.lua');
  await withServer({ W0ND3R_GUARD_REQUIRE_PAYMENT: undefined }, async (port) => {
    const { status, body } = await fetchJson(port, '/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: fixturePath }),
    });
    assert.equal(status, 200);
    assert.equal(body.findings.length, 1);
    assert.equal(body.findings[0].rule_id, 'sql-string-concat');
  });
});
