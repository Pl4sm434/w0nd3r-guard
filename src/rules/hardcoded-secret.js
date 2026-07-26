'use strict';

const { walk, stringValue, getLine, getSnippet } = require('./util');

const RULE_ID = 'hardcoded-secret';
const SECRET_NAME_REGEX = /(password|secret|api[_-]?key|token|db_pass)/i;

function fieldName(target) {
  if (target.type === 'Identifier') return target.name;
  if (target.type === 'MemberExpression') return target.identifier.name;
  return null;
}

function checkPair(name, value, filePath, sourceLines, node, findings) {
  if (!name || !SECRET_NAME_REGEX.test(name)) return;
  if (!value || value.type !== 'StringLiteral') return;
  const literal = stringValue(value);
  if (!literal || literal.length === 0) return;

  findings.push({
    severity: 'critical',
    title: `Hardcoded secret assigned to '${name}'`,
    file: filePath,
    line: getLine(node),
    code_snippet: getSnippet(sourceLines, node),
    rule_id: RULE_ID,
  });
}

function run(ast, filePath, sourceLines) {
  const findings = [];

  walk(ast, (node) => {
    if (node.type === 'LocalStatement' || node.type === 'AssignmentStatement') {
      node.variables.forEach((variable, i) => {
        checkPair(fieldName(variable), node.init[i], filePath, sourceLines, node, findings);
      });
    }

    if (node.type === 'TableKeyString') {
      checkPair(node.key.name, node.value, filePath, sourceLines, node, findings);
    }
  });

  return findings;
}

module.exports = { id: RULE_ID, run };
