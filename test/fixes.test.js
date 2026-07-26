'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { enrichWithFixes } = require('../src/fixes/index');
const { hashKey, loadCache } = require('../src/fixes/cache');
const { getFallback } = require('../src/fixes/fallbacks');

const finding = {
  severity: 'critical',
  title: 'SQL query built with string concatenation',
  file: 'server/money.lua',
  line: 76,
  code_snippet: "MySQL.query('UPDATE ... WHERE label = ''..label..'''')",
  rule_id: 'sql-string-concat',
};

function mockFetchOnce(implementation) {
  const original = global.fetch;
  global.fetch = implementation;
  return () => {
    global.fetch = original;
  };
}

test('falls back to the static explanation when no API key is set', async () => {
  const restore = mockFetchOnce(() => {
    throw new Error('fetch should not be called without an API key');
  });
  try {
    const [result] = await enrichWithFixes([finding], { apiKey: undefined, cache: {}, skipSave: true });
    assert.equal(result.fix, getFallback('sql-string-concat'));
  } finally {
    restore();
  }
});

test('uses the Anthropic response when the API call succeeds', async () => {
  let callCount = 0;
  const restore = mockFetchOnce(async (url, opts) => {
    callCount += 1;
    const body = JSON.parse(opts.body);
    assert.equal(body.messages[0].content.includes(finding.rule_id), true);
    assert.equal(body.messages[0].content.includes(finding.code_snippet), true);
    return {
      ok: true,
      json: async () => ({ content: [{ text: 'Concatenated SQL enables injection; use bound parameters.' }] }),
    };
  });
  try {
    const [result] = await enrichWithFixes([finding], { apiKey: 'test-key', cache: {}, skipSave: true });
    assert.equal(result.fix, 'Concatenated SQL enables injection; use bound parameters.');
    assert.equal(callCount, 1);
  } finally {
    restore();
  }
});

test('falls back to the static explanation when the API call fails', async () => {
  const restore = mockFetchOnce(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' }));
  try {
    const [result] = await enrichWithFixes([finding], { apiKey: 'test-key', cache: {}, skipSave: true });
    assert.equal(result.fix, getFallback('sql-string-concat'));
  } finally {
    restore();
  }
});

test('dedupes identical findings within a single scan into one API call', async () => {
  let callCount = 0;
  const restore = mockFetchOnce(async () => {
    callCount += 1;
    return { ok: true, json: async () => ({ content: [{ text: 'shared fix' }] }) };
  });
  try {
    const results = await enrichWithFixes([finding, { ...finding }], {
      apiKey: 'test-key',
      cache: {},
      skipSave: true,
    });
    assert.equal(callCount, 1);
    assert.equal(results[0].fix, 'shared fix');
    assert.equal(results[1].fix, 'shared fix');
  } finally {
    restore();
  }
});

test('caches by hash(rule_id + code_snippet) so a re-scan skips the API call', async () => {
  const tmpFile = path.join(os.tmpdir(), `w0nd3r-guard-cache-test-${Date.now()}.json`);
  const previousEnv = process.env.W0ND3R_GUARD_CACHE_PATH;
  process.env.W0ND3R_GUARD_CACHE_PATH = tmpFile;

  let callCount = 0;
  const restore = mockFetchOnce(async () => {
    callCount += 1;
    return { ok: true, json: async () => ({ content: [{ text: 'first-run fix' }] }) };
  });

  try {
    await enrichWithFixes([finding], { apiKey: 'test-key' });
    assert.equal(callCount, 1);

    const cache = loadCache();
    const key = hashKey(finding.rule_id, finding.code_snippet);
    assert.equal(cache[key].fix, 'first-run fix');

    restore();
    const restoreSecond = mockFetchOnce(() => {
      throw new Error('fetch should not be called on a cache hit');
    });

    try {
      const [second] = await enrichWithFixes([finding], { apiKey: 'test-key' });
      assert.equal(second.fix, 'first-run fix');
      assert.equal(callCount, 1);
    } finally {
      restoreSecond();
    }
  } finally {
    if (previousEnv === undefined) delete process.env.W0ND3R_GUARD_CACHE_PATH;
    else process.env.W0ND3R_GUARD_CACHE_PATH = previousEnv;
    fs.rmSync(tmpFile, { force: true });
  }
});
