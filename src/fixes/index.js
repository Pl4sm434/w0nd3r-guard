'use strict';

const { hashKey, loadCache, saveCache } = require('./cache');
const { requestFix } = require('./anthropic');
const { getFallback } = require('./fallbacks');

async function computeFix(finding, apiKey) {
  if (!apiKey) {
    return { fix: getFallback(finding.rule_id), source: 'fallback' };
  }

  try {
    const fix = await requestFix(finding.rule_id, finding.code_snippet, apiKey);
    return { fix, source: 'ai' };
  } catch {
    return { fix: getFallback(finding.rule_id), source: 'fallback' };
  }
}

async function enrichWithFixes(findings, options = {}) {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const cache = options.cache ?? loadCache();
  const pending = new Map();

  async function resolveFix(finding) {
    const key = hashKey(finding.rule_id, finding.code_snippet);
    if (cache[key]) return cache[key].fix;
    if (pending.has(key)) return pending.get(key);

    const promise = computeFix(finding, apiKey).then(({ fix, source }) => {
      cache[key] = { fix, source, updatedAt: Date.now() };
      return fix;
    });
    pending.set(key, promise);
    return promise;
  }

  const fixes = await Promise.all(findings.map(resolveFix));

  if (!options.skipSave) saveCache(cache);

  return findings.map((finding, i) => ({ ...finding, fix: fixes[i] }));
}

module.exports = { enrichWithFixes, computeFix };
