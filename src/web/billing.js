'use strict';

const Stripe = require('stripe');

function isBillingEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function getStripeClient() {
  if (!isBillingEnabled()) {
    throw new Error('STRIPE_SECRET_KEY is not set.');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// mode: 'subscription' | 'payment' (one-time)
async function createCheckoutSession({ mode, priceId, successUrl, cancelUrl }) {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.create({
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

async function retrieveCheckoutSession(sessionId) {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer'] });
}

async function retrieveSubscription(subscriptionId) {
  const stripe = getStripeClient();
  return stripe.subscriptions.retrieve(subscriptionId);
}

function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

module.exports = {
  isBillingEnabled,
  createCheckoutSession,
  retrieveCheckoutSession,
  retrieveSubscription,
  constructWebhookEvent,
};
