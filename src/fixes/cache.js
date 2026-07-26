'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function cachePath() {
  return process.env.W0ND3R_GUARD_CACHE_PATH || path.join(os.homedir(), '.w0nd3r-guard', 'fix-cache.json');
}

function hashKey(ruleId, codeSnippet) {
  return crypto.createHash('sha256').update(`${ruleId}::${codeSnippet}`).digest('hex');
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  const filePath = cachePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
}

module.exports = { cachePath, hashKey, loadCache, saveCache };
