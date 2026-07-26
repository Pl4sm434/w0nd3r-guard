#!/usr/bin/env node
'use strict';

const { scan } = require('../src/scan');
const { startServer } = require('../src/web/server');

const [, , command, targetPath] = process.argv;

function printUsage() {
  console.error('Usage: w0nd3r-guard scan <path>');
  console.error('       w0nd3r-guard web');
}

if (command === 'scan') {
  if (!targetPath) {
    printUsage();
    process.exit(1);
  }
  scan(targetPath).then(({ exitCode }) => {
    process.exit(exitCode);
  });
} else if (command === 'web') {
  startServer();
} else {
  printUsage();
  process.exit(1);
}
