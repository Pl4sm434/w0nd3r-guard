'use strict';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function buildPrompt(ruleId, codeSnippet) {
  return [
    `Security scanner rule: ${ruleId}`,
    'Flagged code snippet:',
    codeSnippet,
    '',
    'In 2-3 sentences max, explain in plain English why this specific pattern is risky and what the concrete fix is.',
    'Be specific to FiveM/Lua/QBCore/ESX conventions where relevant. No preamble, no markdown.',
  ].join('\n');
}

async function requestFix(ruleId, codeSnippet, apiKey) {
  const requestBody = {
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: buildPrompt(ruleId, codeSnippet) }],
  };

  if (process.env.W0ND3R_GUARD_DEBUG) {
    const payloadBytes = JSON.stringify(requestBody).length;
    console.error(
      `[w0nd3r-guard debug] API request rule_id=${ruleId} payload_bytes=${payloadBytes} snippet=${JSON.stringify(codeSnippet)}`
    );
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text = data.content && data.content[0] && data.content[0].text;
  if (!text) {
    throw new Error('Anthropic API returned no content');
  }

  return text.trim();
}

async function ping(apiKey) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Say OK if you can read this.' }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text = data.content && data.content[0] && data.content[0].text;
  if (!text) {
    throw new Error('Anthropic API returned no content');
  }

  return text.trim();
}

module.exports = { requestFix, ping, MODEL };
