# W0ND3R Guard

A security scanner for FiveM server resources (QBCore/ESX Lua scripts). It
walks a resource folder, parses each `.lua` file, and flags known
vulnerability patterns — unvalidated server events, missing ACE checks,
SQL string concatenation, hardcoded secrets, and unsafe exports — with a
severity, the exact file/line, and a plain-English fix suggestion.

It runs entirely on your own computer. Nothing about your resources or
your filesystem is sent anywhere, unless you opt into AI-generated fix
suggestions (see below).

## Download and run it

### 1. Install Node.js

You need Node.js version 18 or newer to run this.

- Go to **[nodejs.org](https://nodejs.org)**
- Download and run the **LTS** installer for your OS
- To confirm it installed, open a terminal (Command Prompt, PowerShell,
  or Terminal on macOS) and run:

  ```bash
  node --version
  ```

  You should see something like `v20.x.x` or higher.

### 2. Download this project

- Go to **[github.com/Pl4sm434/w0nd3r-guard](https://github.com/Pl4sm434/w0nd3r-guard)**
- Click the green **Code** button → **Download ZIP**
- Extract the zip somewhere on your computer (e.g. your Desktop)

(If you're comfortable with git, `git clone` works too instead of
downloading the zip.)

### 3. Install its dependencies

Open a terminal, navigate into the folder you extracted, and run:

```bash
cd path\to\w0nd3r-guard
npm install
```

This only needs to be done once.

### 4. Run it

**Option A — command line**, scan a resource folder directly:

```bash
node bin/w0nd3r-guard.js scan "C:\path\to\your\resource"
```

You'll get output like:

```
[CRITICAL] SQL query built with string concatenation in MySQL.query
server/money.lua:76
This SQL query is built by string concatenation, which allows SQL
injection if any part comes from user input. Use a parameterized query
instead, passing values as a separate bound-parameters argument (e.g.
MySQL.query('...WHERE label = @label', { ['@label'] = label })).

1 critical, 0 warnings, 0 clean
```

Exit code is `1` if any critical findings were reported, `0` otherwise —
safe to wire into CI if you use it that way later.

**Option B — browser UI**, point-and-click instead of typing commands:

```bash
npm start
```

Then open **http://localhost:4173** in your browser, paste in the full
path to a resource folder, and click **Scan**.

### Optional: run it as a global command

If you don't want to type `node bin/w0nd3r-guard.js` every time:

```bash
npm link
```

Afterward you can just run `w0nd3r-guard scan <path>` from anywhere.

## AI-generated fix suggestions (optional)

By default, fix suggestions come from a static explanation baked in per
rule — no internet connection or API key needed at all. If you want a
tailored explanation generated per finding instead, set
`ANTHROPIC_API_KEY` in your environment before running a scan:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node bin/w0nd3r-guard.js scan "C:\path\to\your\resource"
```

(On Windows PowerShell: `$env:ANTHROPIC_API_KEY = "sk-ant-..."`)

Only the flagged code snippet and the rule ID are sent to the API — never
the whole file. Responses are cached locally (keyed by a hash of the rule
and snippet) at `~/.w0nd3r-guard/fix-cache.json`, so re-scanning unchanged
code doesn't re-call the API. If the key isn't set, or the API call fails
for any reason, the tool falls back to the static explanation and keeps
working — it has no hard dependency on the API.

## Rules

| Rule ID | What it flags |
| --- | --- |
| `unvalidated-server-event` | A server event handler uses a client-supplied parameter in a state-changing call without validating it first |
| `missing-ace-check` | A sensitive action (job/money/permission change) reachable from a client trigger with no `IsPlayerAceAllowed` check |
| `sql-string-concat` | A SQL query built with string concatenation instead of parameterized values |
| `hardcoded-secret` | A password, API key, or token literal hardcoded in source |
| `unsafe-export` | An `exports(...)` call that changes money/jobs/permissions with no `GetInvokingResource()` check |

## Hosting a paid instance (advanced, optional)

Everything above is for running the tool locally on your own machine,
which is the primary way it's meant to be used. It's also possible to
deploy it as a hosted, paid web service (zip-upload scanning + a Stripe
paywall) — this is a separate, more involved setup for anyone who wants
to actually run it as a product rather than a personal tool.

Setting `W0ND3R_GUARD_REQUIRE_PAYMENT=true` switches the web UI into
hosted mode: path-based scanning is disabled (a remote server can't read
a visitor's local disk), the page switches to a zip-upload form, and
every scan requires a paid access token.

### 1. Set up Stripe

1. Create a Stripe account and switch to test mode.
2. Create two Products:
   - **Single scan** — a one-time price (e.g. $5).
   - **Unlimited** — a recurring monthly price (e.g. $15/mo).
3. Copy each price's ID (`price_...`).
4. Once you're ready to accept real payments, repeat with live prices
   and swap in your live secret key.

### 2. Configure environment variables

Copy [`.env.example`](.env.example) and fill in:

```
ANTHROPIC_API_KEY=...
W0ND3R_GUARD_REQUIRE_PAYMENT=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...        (see step 4)
STRIPE_PRICE_ID_ONE_TIME=price_...
STRIPE_PRICE_ID_SUBSCRIPTION=price_...
```

Set these as actual secret env vars in your hosting provider's dashboard
— never commit a real `.env` file (it's already gitignored).

### 3. Deploy (Railway or Render)

Both platforms auto-detect Node and run `npm start`
(`node bin/w0nd3r-guard.js web`), and both inject a `PORT` env var —
the server binds to it and listens on all interfaces automatically
when `PORT` is set (it only binds to loopback-only in plain local dev).

- **Railway**: create a new project from this repo, add the env vars
  above under Variables, deploy. Note the public URL it gives you.
- **Render**: new Web Service from this repo, build command `npm install`,
  start command `npm start`, add the env vars, deploy. Render's free
  tier spins the service down after inactivity and wakes it back up on
  the next request (not instant, but doesn't require payment on their end).

### 4. Wire up the Stripe webhook

In the Stripe dashboard, add a webhook endpoint pointing at
`https://<your-deployed-url>/api/stripe-webhook`, subscribed to at least
`customer.subscription.updated` and `customer.subscription.deleted`
(this is what revokes access tokens when a subscription is canceled).
Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

### How access tokens work

- A customer completes Stripe Checkout → they're redirected to `/success`,
  which mints a random access token and displays it once.
- They paste that token into the access token field on the scan page.
- One-time-purchase tokens are valid for exactly one scan; subscription
  tokens stay valid until the subscription is canceled (enforced via the
  webhook above).
- Tokens are stored server-side in `~/.w0nd3r-guard/tokens.json` (or
  wherever `W0ND3R_GUARD_TOKENS_PATH` points) — there's no user database,
  login, or password, just a bearer token tied to a Stripe customer.

This is a minimal MVP paywall, not a full billing system, and on most
free hosting tiers the token/cache storage above doesn't persist across
restarts — treat it as a starting point, not a finished SaaS backend.

## Development

```bash
npm install
npm test          # unit tests for all rules, the fix-suggestion layer, and billing/upload logic
npm run test:api  # standalone Anthropic API connectivity check
```
