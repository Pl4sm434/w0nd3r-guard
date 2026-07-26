'use strict';

const {
  walk,
  calleeName,
  stringValue,
  lastSegment,
  getLine,
  getSnippet,
  containsConcat,
  referencesAnyName,
  SENSITIVE_NATIVE_REGEX,
  SQL_CALL_REGEX,
} = require('./util');

const RULE_ID = 'unvalidated-server-event';

function isSensitiveUse(node, paramNames) {
  if (node.type === 'CallExpression') {
    const name = calleeName(node.base);
    const last = lastSegment(name);
    if (SENSITIVE_NATIVE_REGEX.test(last) || name === 'TriggerClientEvent' || SQL_CALL_REGEX.test(name)) {
      return node.arguments.some((arg) => referencesAnyName(arg, paramNames) || containsConcat(arg) && referencesAnyName(arg, paramNames));
    }
  }
  return false;
}

function isValidated(handlerFn, paramNames) {
  let validated = false;
  walk(handlerFn.body, (node) => {
    if (node.type === 'IfStatement') {
      for (const clause of node.clauses) {
        if (clause.condition && referencesAnyName(clause.condition, paramNames)) {
          validated = true;
        }
      }
    }
  });
  return validated;
}

function run(ast, filePath, sourceLines) {
  const findings = [];
  const registeredEvents = new Set();
  const handlers = [];

  walk(ast, (node) => {
    if (node.type === 'CallExpression') {
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
        handlers.push({ eventName: stringValue(node.arguments[0]), fn: node.arguments[1] });
      }
    }
  });

  for (const { eventName, fn } of handlers) {
    if (!registeredEvents.has(eventName)) continue;

    const paramNames = new Set(
      fn.parameters.filter((p) => p.type === 'Identifier').map((p) => p.name)
    );
    if (paramNames.size === 0) continue;

    if (isValidated(fn, paramNames)) continue;

    walk(fn.body, (node) => {
      if (isSensitiveUse(node, paramNames)) {
        findings.push({
          severity: 'critical',
          title: `Unvalidated parameter from server event '${eventName}' used in a state-changing call`,
          file: filePath,
          line: getLine(node),
          code_snippet: getSnippet(sourceLines, node),
          rule_id: RULE_ID,
        });
      }
    });
  }

  return findings;
}

module.exports = { id: RULE_ID, run };
