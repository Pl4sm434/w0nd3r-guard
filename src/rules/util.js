'use strict';

function walk(node, visit) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (node.type) visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'range' || key === 'loc') continue;
    walk(node[key], visit);
  }
}

function calleeName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return `${calleeName(node.base)}${node.indexer}${node.identifier.name}`;
  if (node.type === 'IndexExpression') return `${calleeName(node.base)}[]`;
  return '';
}

function stringValue(node) {
  if (!node || node.type !== 'StringLiteral') return null;
  if (typeof node.value === 'string') return node.value;
  const raw = node.raw;
  if (!raw) return null;
  const quote = raw[0];
  if (quote === '"' || quote === "'") return raw.slice(1, -1);
  return raw;
}

function lastSegment(name) {
  const parts = name.split(/[.:]/);
  return parts[parts.length - 1];
}

function getLine(node) {
  return node && node.loc ? node.loc.start.line : 0;
}

function getSnippet(sourceLines, node) {
  const line = getLine(node);
  if (!line || !sourceLines[line - 1]) return '';
  return sourceLines[line - 1].trim();
}

function toSourceLines(source) {
  return source.split(/\r\n|\r|\n/);
}

function findCalls(root, predicate) {
  const matches = [];
  walk(root, (node) => {
    if (node.type === 'CallExpression' && predicate(calleeName(node.base), node)) {
      matches.push(node);
    }
  });
  return matches;
}

function collectIdentifierNames(node) {
  const names = new Set();
  walk(node, (n) => {
    if (n.type === 'Identifier') names.add(n.name);
  });
  return names;
}

function containsConcat(node) {
  let found = false;
  walk(node, (n) => {
    if (n.type === 'BinaryExpression' && n.operator === '..') found = true;
  });
  return found;
}

function referencesAnyName(node, names) {
  let found = false;
  walk(node, (n) => {
    if (n.type === 'Identifier' && names.has(n.name)) found = true;
  });
  return found;
}

const SENSITIVE_NATIVE_REGEX = /^(set(Job|Group|Money|Grade|Permission)|add(Money)|removeMoney)$/i;
const SQL_CALL_REGEX = /^(MySQL\.|exports\.oxmysql)/i;

module.exports = {
  walk,
  calleeName,
  stringValue,
  lastSegment,
  getLine,
  getSnippet,
  toSourceLines,
  findCalls,
  collectIdentifierNames,
  containsConcat,
  referencesAnyName,
  SENSITIVE_NATIVE_REGEX,
  SQL_CALL_REGEX,
};
