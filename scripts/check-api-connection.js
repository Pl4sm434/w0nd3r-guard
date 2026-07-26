#!/usr/bin/env node
'use strict';

// Standalone sanity check for the Anthropic API layer, independent of
// the scan pipeline. Run this any time fix suggestions look wrong to
// rule the API in or out in a few seconds.
//
// Usage: node scripts/check-api-connection.js  (or: npm run test:api)

const { ping, MODEL } = require('../src/fixes/anthropic');

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  console.log(`Model: ${MODEL}`);

  if (!apiKey) {
    console.log('FAIL: ANTHROPIC_API_KEY is not set in the environment.');
    process.exitCode = 1;
    return;
  }

  console.log(`API key: set (${apiKey.slice(0, 12)}...${apiKey.slice(-4)})`);
  console.log('Sending a minimal test request...');

  try {
    const start = Date.now();
    const reply = await ping(apiKey);
    const elapsedMs = Date.now() - start;
    console.log(`PASS: got a response in ${elapsedMs}ms`);
    console.log(`Response: ${reply}`);
    process.exitCode = 0;
  } catch (err) {
    console.log(`FAIL: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
