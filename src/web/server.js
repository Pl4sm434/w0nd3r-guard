'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { runScan } = require('../scan');
const billing = require('./billing');
const tokens = require('./tokens');
const { receiveZipUpload, extractZip, cleanupPaths } = require('./upload');

const PAGE_PATH = path.join(__dirname, 'index.html');
const DEFAULT_PORT = 4173;

// When true, every scan requires a valid paid access token and only
// the zip-upload flow is available (a raw filesystem path is
// meaningless once this is running on someone else's server).
function requirePayment() {
  return process.env.W0ND3R_GUARD_REQUIRE_PAYMENT === 'true';
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function summarize(findings) {
  return {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    clean: findings.filter((f) => f.severity === 'clean').length,
  };
}

// --- config: tells the page whether to show the paywall/upload UI ---
function handleConfig(req, res) {
  sendJson(res, 200, {
    requirePayment: requirePayment(),
    billingEnabled: billing.isBillingEnabled(),
    subscriptionPriceId: process.env.STRIPE_PRICE_ID_SUBSCRIPTION ? true : false,
    oneTimePriceId: process.env.STRIPE_PRICE_ID_ONE_TIME ? true : false,
  });
}

// --- checkout: create a Stripe Checkout Session and redirect the user ---
async function handleCheckout(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body.' });
    return;
  }

  const plan = body.plan === 'one_time' ? 'one_time' : 'subscription';
  const priceId =
    plan === 'one_time' ? process.env.STRIPE_PRICE_ID_ONE_TIME : process.env.STRIPE_PRICE_ID_SUBSCRIPTION;

  if (!billing.isBillingEnabled() || !priceId) {
    sendJson(res, 500, { error: 'Billing is not configured on this server.' });
    return;
  }

  const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;

  try {
    const session = await billing.createCheckoutSession({
      mode: plan === 'one_time' ? 'payment' : 'subscription',
      priceId,
      successUrl: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/#pricing`,
    });
    sendJson(res, 200, { url: session.url });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

// --- success: after Stripe redirects back, mint an access token ---
async function handleSuccess(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const sessionId = url.searchParams.get('session_id');

  if (!sessionId || !billing.isBillingEnabled()) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Missing or invalid checkout session.');
    return;
  }

  try {
    const session = await billing.retrieveCheckoutSession(sessionId);
    if (session.payment_status !== 'paid') {
      res.writeHead(402, { 'content-type': 'text/plain' });
      res.end('Payment not completed.');
      return;
    }

    const kind = session.mode === 'subscription' ? 'subscription' : 'one_time';
    const token = tokens.createToken({
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      subscriptionId: session.subscription || null,
      kind,
      email: session.customer_details?.email || null,
    });

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Access token</title>
      <style>body{background:#07090a;color:#e8f5ee;font-family:ui-monospace,monospace;padding:60px;line-height:1.6}
      code{background:#0d1210;border:1px solid #1c2620;padding:14px 18px;border-radius:8px;display:block;margin:16px 0;font-size:16px;word-break:break-all}
      a{color:#39ff88}</style></head><body>
      <h2>Payment received.</h2>
      <p>Your access token (save this — it won't be shown again):</p>
      <code>${token}</code>
      <p>Paste it into the access token field on the scan page.</p>
      <p><a href="/">&larr; Back to W0ND3R Guard</a></p>
      </body></html>`);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(`Failed to finalize access: ${err.message}`);
  }
}

// --- webhook: keep local token store in sync with subscription cancellations ---
async function handleWebhook(req, res) {
  let event;
  try {
    const rawBody = await readRawBody(req);
    event = billing.constructWebhookEvent(rawBody, req.headers['stripe-signature']);
  } catch (err) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end(`Webhook error: ${err.message}`);
    return;
  }

  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object;
    if (event.type === 'customer.subscription.updated' && subscription.status === 'active') {
      // still active, nothing to revoke
    } else if (subscription.status !== 'active') {
      tokens.deactivateBySubscription(subscription.id);
    }
  }

  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"received":true}');
}

// --- scan: path-based (local/free mode only) ---
async function handleScanByPath(req, res) {
  if (requirePayment()) {
    sendJson(res, 403, { error: 'Path-based scanning is disabled on the hosted instance. Upload a .zip instead.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON request body.' });
    return;
  }

  const targetPath = typeof body.path === 'string' ? body.path.trim() : '';
  if (!targetPath) {
    sendJson(res, 400, { error: 'Provide a "path" to scan.' });
    return;
  }

  try {
    const { findings, fileCount } = await runScan(targetPath);
    sendJson(res, 200, { findings, summary: summarize(findings), fileCount });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

// --- scan: zip-upload (required for hosted/paid mode, also available locally) ---
async function handleScanByUpload(req, res) {
  const accessToken = req.headers['x-access-token'];

  if (requirePayment()) {
    if (!accessToken || !tokens.isTokenActive(accessToken)) {
      sendJson(res, 402, { error: 'A valid access token is required. Purchase access on the pricing page.' });
      return;
    }
  }

  let zipPath;
  let extractDir;
  try {
    zipPath = await receiveZipUpload(req);
    extractDir = extractZip(zipPath);
    const { findings, fileCount } = await runScan(extractDir);

    if (requirePayment() && accessToken) {
      tokens.recordScanUsed(accessToken);
    }

    sendJson(res, 200, { findings, summary: summarize(findings), fileCount });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  } finally {
    cleanupPaths(zipPath, extractDir);
  }
}

function handleIndex(req, res) {
  fs.readFile(PAGE_PATH, 'utf8', (err, html) => {
    if (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Failed to load page.');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    if (req.method === 'GET' && (url === '/' || url === '/index.html')) return handleIndex(req, res);
    if (req.method === 'GET' && url === '/api/config') return handleConfig(req, res);
    if (req.method === 'GET' && url === '/success') return handleSuccess(req, res);
    if (req.method === 'POST' && url === '/api/checkout') return handleCheckout(req, res);
    if (req.method === 'POST' && url === '/api/stripe-webhook') return handleWebhook(req, res);
    if (req.method === 'POST' && url === '/api/scan') return handleScanByPath(req, res);
    if (req.method === 'POST' && url === '/api/scan-upload') return handleScanByUpload(req, res);

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });
}

function startServer() {
  const server = createServer();
  const port = Number(process.env.PORT) || Number(process.env.W0ND3R_GUARD_PORT) || DEFAULT_PORT;
  // Hosting platforms (Railway/Render) inject PORT; bind all interfaces
  // there. Locally, stay on loopback only — the /api/scan path-based
  // route reads arbitrary local filesystem paths and must never be
  // reachable from the network.
  const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
  server.listen(port, host, () => {
    console.log(`W0ND3R Guard web UI running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  });
  return server;
}

module.exports = { createServer, startServer };
