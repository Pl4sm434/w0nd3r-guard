'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const luaparse = require('luaparse');

const rules = require('../src/rules');
const { toSourceLines } = require('../src/rules/util');

const FIXTURES_DIR = path.join(__dirname, '..', 'test-fixtures', 'rules');

function loadFindings(rule, ruleId, fixtureName) {
  const filePath = path.join(FIXTURES_DIR, ruleId, fixtureName);
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = luaparse.parse(source, { locations: true });
  return rule.run(ast, filePath, toSourceLines(source));
}

for (const rule of rules.rules) {
  test(`${rule.id}: flags the vulnerable fixture`, () => {
    const findings = loadFindings(rule, rule.id, 'vulnerable.lua');
    assert.ok(findings.length > 0, 'expected at least one finding on the vulnerable fixture');
    for (const finding of findings) {
      assert.equal(finding.rule_id, rule.id);
      assert.ok(['critical', 'warning', 'clean'].includes(finding.severity));
      assert.ok(finding.line > 0);
      assert.ok(finding.code_snippet.length > 0);
      assert.equal(finding.file, path.join(FIXTURES_DIR, rule.id, 'vulnerable.lua'));
    }
  });

  test(`${rule.id}: does not flag the clean fixture`, () => {
    const findings = loadFindings(rule, rule.id, 'clean.lua');
    assert.deepEqual(findings, [], 'expected no findings on the clean fixture');
  });
}
