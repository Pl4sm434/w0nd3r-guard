'use strict';

const unvalidatedServerEvent = require('./unvalidated-server-event');
const missingAceCheck = require('./missing-ace-check');
const sqlStringConcat = require('./sql-string-concat');
const hardcodedSecret = require('./hardcoded-secret');
const unsafeExport = require('./unsafe-export');

const rules = [unvalidatedServerEvent, missingAceCheck, sqlStringConcat, hardcodedSecret, unsafeExport];

function runRules(ast, filePath, sourceLines) {
  return rules.flatMap((rule) => rule.run(ast, filePath, sourceLines));
}

module.exports = { rules, runRules };
