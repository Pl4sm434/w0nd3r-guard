'use strict';

const fs = require('fs');
const path = require('path');
const luaparse = require('luaparse');
const { runRules } = require('./rules/index');
const { toSourceLines } = require('./rules/util');
const { printReport } = require('./report');
const { enrichWithFixes } = require('./fixes/index');

function findLuaFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findLuaFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.lua')) {
      results.push(full);
    }
  }
  return results;
}

// CfxLua extends standard Lua with backtick-delimited hash literals
// (e.g. `WEAPON_UNARMED`), which luaparse doesn't understand. Rewrite
// them to plain string literals before parsing — this only changes the
// quote characters, so line/column positions are unaffected.
function preprocessCfxHashLiterals(source) {
  return source.replace(/`([^`\n]*)`/g, "'$1'");
}

function scanFile(filePath) {
  const rawSource = fs.readFileSync(filePath, 'utf8');
  const source = preprocessCfxHashLiterals(rawSource);
  let ast;
  try {
    ast = luaparse.parse(source, { locations: true, luaVersion: '5.3' });
  } catch (err) {
    console.error(`  parse error in ${filePath}: ${err.message}`);
    return [];
  }

  return runRules(ast, filePath, toSourceLines(source));
}

// Core scan logic with no CLI side effects (no console output, throws
// instead of process.exit) so it can be reused by both the CLI and the
// web server.
async function runScan(targetPath) {
  const absPath = path.resolve(targetPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Path not found: ${absPath}`);
  }

  const stat = fs.statSync(absPath);
  const files = stat.isDirectory() ? findLuaFiles(absPath) : [absPath];

  const rawFindings = files.flatMap(scanFile);
  const findings = await enrichWithFixes(rawFindings);

  return { findings, fileCount: files.length };
}

async function scan(targetPath) {
  let findings;
  try {
    ({ findings } = await runScan(targetPath));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const exitCode = printReport(findings);
  return { findings, exitCode };
}

module.exports = { scan, runScan, findLuaFiles };
