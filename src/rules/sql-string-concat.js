'use strict';

const { walk, calleeName, getLine, getSnippet, containsConcat, SQL_CALL_REGEX } = require('./util');

const RULE_ID = 'sql-string-concat';

function run(ast, filePath, sourceLines) {
  const findings = [];

  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const name = calleeName(node.base);
    if (!SQL_CALL_REGEX.test(name)) return;

    const queryArg = node.arguments[0];
    if (!queryArg) return;

    if (containsConcat(queryArg)) {
      findings.push({
        severity: 'critical',
        title: `SQL query built with string concatenation in ${name}`,
        file: filePath,
        line: getLine(node),
        code_snippet: getSnippet(sourceLines, node),
        rule_id: RULE_ID,
      });
    }
  });

  return findings;
}

module.exports = { id: RULE_ID, run };
