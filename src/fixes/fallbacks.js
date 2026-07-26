'use strict';

const FALLBACKS = {
  'unvalidated-server-event':
    "This server event handler uses a client-supplied parameter directly in a state-changing call without validating it first, so a malicious client can trigger the event with an arbitrary value. Add a server-side check on the parameter (e.g. compare it against the calling player's own data) before acting on it.",
  'missing-ace-check':
    "This sensitive action (job/money/permission change) is reachable from a client-triggered event or command with no IsPlayerAceAllowed check, so any player can invoke it directly. Add an IsPlayerAceAllowed(source, 'your.permission') check before performing the action.",
  'sql-string-concat':
    'This SQL query is built by string concatenation, which allows SQL injection if any part comes from user input. Use a parameterized query instead, passing values as a separate bound-parameters argument (e.g. MySQL.query(\'...WHERE label = @label\', { [\'@label\'] = label })).',
  'hardcoded-secret':
    "A credential or secret is hardcoded directly in source, so it ships to anyone with resource access and can't be rotated without a code change. Move it to a convar, environment variable, or a config file excluded from version control.",
  'unsafe-export':
    'This export changes money, jobs, or permissions with no GetInvokingResource() check, so any other installed resource can call it directly. Add a check against an allowlist of trusted resource names before running the sensitive logic.',
};

const DEFAULT_FALLBACK =
  'This pattern is flagged as a potential security risk. Review the code and validate any client-controlled input before it reaches a sensitive operation.';

function getFallback(ruleId) {
  return FALLBACKS[ruleId] || DEFAULT_FALLBACK;
}

module.exports = { FALLBACKS, DEFAULT_FALLBACK, getFallback };
