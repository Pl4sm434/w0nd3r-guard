'use strict';

const { walk, calleeName, stringValue, lastSegment, getLine, getSnippet, SENSITIVE_NATIVE_REGEX } = require('./util');

const RULE_ID = 'missing-ace-check';

function collectTriggerFunctions(ast) {
  const registeredEvents = new Set();
  const fns = [];

  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const name = calleeName(node.base);

    if (name === 'RegisterServerEvent' && node.arguments[0] && node.arguments[0].type === 'StringLiteral') {
      registeredEvents.add(stringValue(node.arguments[0]));
    }

    if (
      name === 'AddEventHandler' &&
      node.arguments[0] &&
      node.arguments[0].type === 'StringLiteral' &&
      node.arguments[1] &&
      node.arguments[1].type === 'FunctionDeclaration'
    ) {
      fns.push({ eventName: stringValue(node.arguments[0]), fn: node.arguments[1] });
    }

    if (
      name === 'RegisterCommand' &&
      node.arguments[1] &&
      node.arguments[1].type === 'FunctionDeclaration'
    ) {
      fns.push({ eventName: null, fn: node.arguments[1] });
    }
  });

  return fns.filter((entry) => entry.eventName === null || registeredEvents.has(entry.eventName));
}

function run(ast, filePath, sourceLines) {
  const findings = [];
  const triggerFns = collectTriggerFunctions(ast);

  for (const { fn } of triggerFns) {
    const aceLines = [];
    const sensitiveCalls = [];

    walk(fn.body, (node) => {
      if (node.type !== 'CallExpression') return;
      const name = calleeName(node.base);
      if (name === 'IsPlayerAceAllowed') {
        aceLines.push(getLine(node));
      } else if (SENSITIVE_NATIVE_REGEX.test(lastSegment(name))) {
        sensitiveCalls.push(node);
      }
    });

    for (const call of sensitiveCalls) {
      const callLine = getLine(call);
      const guarded = aceLines.some((aceLine) => aceLine < callLine);
      if (!guarded) {
        findings.push({
          severity: 'critical',
          title: 'Sensitive action reachable from a client trigger without an IsPlayerAceAllowed check',
          file: filePath,
          line: callLine,
          code_snippet: getSnippet(sourceLines, call),
          rule_id: RULE_ID,
        });
      }
    }
  }

  return findings;
}

module.exports = { id: RULE_ID, run };
