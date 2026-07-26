'use strict';

const COLORS = {
  critical: '\x1b[31m',
  warning: '\x1b[33m',
  clean: '\x1b[32m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const SEVERITY_ORDER = ['critical', 'warning', 'clean'];

function groupBySeverity(findings) {
  const groups = { critical: [], warning: [], clean: [] };
  for (const finding of findings) {
    (groups[finding.severity] || (groups[finding.severity] = [])).push(finding);
  }
  return groups;
}

function printReport(findings) {
  const groups = groupBySeverity(findings);

  for (const severity of SEVERITY_ORDER) {
    const group = groups[severity];
    if (!group || group.length === 0) continue;

    const color = COLORS[severity];
    for (const finding of group) {
      console.log(`${color}${COLORS.bold}[${severity.toUpperCase()}]${COLORS.reset} ${finding.title}`);
      console.log(`${COLORS.dim}${finding.file}:${finding.line}${COLORS.reset}`);
      console.log(finding.fix || 'No fix suggestion available.');
      console.log('');
    }
  }

  const criticalCount = groups.critical.length;
  const warningCount = groups.warning.length;
  const cleanCount = groups.clean.length;

  console.log(`${criticalCount} critical, ${warningCount} warnings, ${cleanCount} clean`);

  return criticalCount > 0 ? 1 : 0;
}

module.exports = { printReport, groupBySeverity, SEVERITY_ORDER };
