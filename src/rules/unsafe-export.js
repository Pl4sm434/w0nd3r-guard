'use strict';

const { walk, calleeName, stringValue, lastSegment, getLine, getSnippet, SENSITIVE_NATIVE_REGEX } = require('./util');

const RULE_ID = 'unsafe-export';

function run(ast, filePath, sourceLines) {
  const findings = [];

  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const name = calleeName(node.base);
    if (name !== 'exports') return;

    const exportNameArg = node.arguments[0];
    const fn = node.arguments[1];
    if (!fn || fn.type !== 'FunctionDeclaration') return;

    const exportName = exportNameArg && exportNameArg.type === 'StringLiteral' ? stringValue(exportNameArg) : '<unknown>';

    let hasInvokingResourceCheck = false;
    let sensitiveCall = null;

    walk(fn.body, (inner) => {
      if (inner.type !== 'CallExpression') return;
      const innerName = calleeName(inner.base);
      if (innerName === 'GetInvokingResource') {
        hasInvokingResourceCheck = true;
      } else if (!sensitiveCall && SENSITIVE_NATIVE_REGEX.test(lastSegment(innerName))) {
        sensitiveCall = inner;
      }
    });

    if (sensitiveCall && !hasInvokingResourceCheck) {
      findings.push({
        severity: 'critical',
        title: `Export '${exportName}' changes money/job/permissions with no GetInvokingResource() check`,
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
