'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Busboy = require('busboy');
const AdmZip = require('adm-zip');

const MAX_ZIP_BYTES = 25 * 1024 * 1024; // 25MB upload cap
const MAX_UNCOMPRESSED_BYTES = 150 * 1024 * 1024; // zip-bomb guard
const MAX_ENTRY_COUNT = 5000;

// Parses a single-file multipart upload (field name "resource") into a
// temp .zip file. Rejects anything over MAX_ZIP_BYTES.
function receiveZipUpload(req) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_ZIP_BYTES } });
    } catch (err) {
      reject(err);
      return;
    }

    const tmpZipPath = path.join(os.tmpdir(), `w0nd3r-guard-upload-${crypto.randomBytes(8).toString('hex')}.zip`);
    let received = false;
    let tooLarge = false;
    // busboy's own 'finish' fires once it has read all request bytes,
    // which is NOT the same as the piped write stream having flushed
    // those bytes to disk. Track the write stream's completion
    // separately and wait for it before resolving, or extractZip can
    // run against a truncated file.
    let writeFinished = Promise.resolve();

    busboy.on('file', (fieldName, fileStream) => {
      received = true;
      const writeStream = fs.createWriteStream(tmpZipPath);
      fileStream.on('limit', () => {
        tooLarge = true;
      });
      writeFinished = new Promise((resolveWrite, rejectWrite) => {
        writeStream.on('finish', resolveWrite);
        writeStream.on('error', rejectWrite);
      });
      fileStream.pipe(writeStream);
    });

    busboy.on('error', reject);

    busboy.on('finish', async () => {
      if (!received) {
        reject(new Error('No file was uploaded. Attach a .zip of the resource folder.'));
        return;
      }
      try {
        await writeFinished;
      } catch (err) {
        reject(err);
        return;
      }
      if (tooLarge) {
        fs.rm(tmpZipPath, { force: true }, () => {});
        reject(new Error(`Upload exceeds the ${MAX_ZIP_BYTES / (1024 * 1024)}MB limit.`));
        return;
      }
      resolve(tmpZipPath);
    });

    req.pipe(busboy);
  });
}

// Extracts a zip to a fresh temp directory, guarding against zip-slip
// path traversal and zip bombs. Returns the extraction directory.
function extractZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  if (entries.length > MAX_ENTRY_COUNT) {
    throw new Error(`Zip contains too many entries (max ${MAX_ENTRY_COUNT}).`);
  }

  let totalUncompressed = 0;
  for (const entry of entries) {
    totalUncompressed += entry.header.size;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('Zip is too large once uncompressed.');
    }
  }

  const destDir = path.join(os.tmpdir(), `w0nd3r-guard-scan-${crypto.randomBytes(8).toString('hex')}`);
  fs.mkdirSync(destDir, { recursive: true });
  const resolvedDest = fs.realpathSync(destDir);

  for (const entry of entries) {
    const targetPath = path.resolve(destDir, entry.entryName);
    if (!targetPath.startsWith(resolvedDest + path.sep) && targetPath !== resolvedDest) {
      throw new Error(`Zip entry escapes the extraction directory: ${entry.entryName}`);
    }
  }

  zip.extractAllTo(destDir, true);
  return destDir;
}

function cleanupPaths(...paths) {
  for (const p of paths) {
    if (!p) continue;
    fs.rm(p, { recursive: true, force: true }, () => {});
  }
}

module.exports = { receiveZipUpload, extractZip, cleanupPaths, MAX_ZIP_BYTES };
