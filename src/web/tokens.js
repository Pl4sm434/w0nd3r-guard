'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function storePath() {
  return process.env.W0ND3R_GUARD_TOKENS_PATH || path.join(os.homedir(), '.w0nd3r-guard', 'tokens.json');
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(storePath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveStore(store) {
  const filePath = storePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

// Creates a new access token tied to a Stripe customer/subscription (or
// a one-time payment) and marks it active.
function createToken({ customerId, subscriptionId, kind, email }) {
  const token = crypto.randomBytes(24).toString('hex');
  const store = loadStore();
  store[token] = {
    customerId: customerId || null,
    subscriptionId: subscriptionId || null,
    kind, // 'subscription' | 'one_time'
    email: email || null,
    status: 'active',
    scansUsed: 0,
    createdAt: Date.now(),
  };
  saveStore(store);
  return token;
}

function getToken(token) {
  const store = loadStore();
  return store[token] || null;
}

function isTokenActive(token) {
  const entry = getToken(token);
  if (!entry) return false;
  if (entry.status !== 'active') return false;
  // One-time-purchase tokens are good for a single scan.
  if (entry.kind === 'one_time' && entry.scansUsed >= 1) return false;
  return true;
}

function recordScanUsed(token) {
  const store = loadStore();
  if (store[token]) {
    store[token].scansUsed = (store[token].scansUsed || 0) + 1;
    saveStore(store);
  }
}

function deactivateBySubscription(subscriptionId) {
  const store = loadStore();
  let changed = false;
  for (const entry of Object.values(store)) {
    if (entry.subscriptionId === subscriptionId) {
      entry.status = 'revoked';
      changed = true;
    }
  }
  if (changed) saveStore(store);
}

module.exports = {
  storePath,
  createToken,
  getToken,
  isTokenActive,
  recordScanUsed,
  deactivateBySubscription,
};
