#!/usr/bin/env node
/**
 * build-glove-binary.js
 *
 * Downloads GloVe 6B 50d from Stanford, filters to the top 30k words by rank
 * (the file is already sorted by frequency), and writes a compact binary:
 *
 *   Header (8 bytes):
 *     [uint32 dim][uint32 wordCount]
 *
 *   Per word entry:
 *     [uint16 byteLen][utf8 word bytes][float32 × dim]
 *
 * Output: glove-30k-50d.bin (~7MB)
 * Upload this file to a GitHub release and paste the URL into GloveService.ts.
 *
 * Usage:
 *   node scripts/build-glove-binary.js
 *
 * Requirements: Node 18+ (uses fetch). No npm packages needed.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const GLOVE_URL = 'https://nlp.stanford.edu/data/glove.6B.zip';
const DIM = 50;
const TOP_K = 30000;
const OUT_FILE = path.join(__dirname, '..', 'glove-30k-50d.bin');
const TMP_ZIP = path.join(__dirname, '..', 'glove.6B.zip');
const TARGET_FILE = 'glove.6B.50d.txt';

// ── Stopwords to exclude from vocab (saves space, not useful for similarity) ──
const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','was','are','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','shall','can',
  'not','no','nor','so','yet','both','either','neither','each','few','more',
  'most','other','some','such','than','that','these','this','those','very',
  'just','into','about','also','as','it','its','i','me','my','we','us','our',
  'you','your','he','she','they','them','their','what','which','who','how',
]);

function download(url, dest, _redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (_redirectCount === 0) console.log(`Downloading ${url} …`);
    const file = fs.createWriteStream(dest);
    let received = 0;
    const lib = url.startsWith('https') ? https : require('http');
    lib.get(url, (res) => {
      // Follow redirects (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        if (_redirectCount > 10) return reject(new Error('Too many redirects'));
        console.log(`  Redirecting to ${res.headers.location}`);
        return download(res.headers.location, dest, _redirectCount + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total) {
          process.stdout.write(`\r  ${(received / 1e6).toFixed(1)} MB / ${(total / 1e6).toFixed(1)} MB`);
        } else {
          process.stdout.write(`\r  ${(received / 1e6).toFixed(1)} MB downloaded…`);
        }
      });
      res.pipe(file);
      file.on('finish', () => { console.log(''); file.close(resolve); });
    }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

function extractGloveText(zipPath, targetFile) {
  return new Promise((resolve, reject) => {
    console.log(`Extracting ${targetFile} from zip…`);
    // Use unzip system command for simplicity
    const { execSync } = require('child_process');
    const outDir = path.dirname(zipPath);
    try {
      execSync(`unzip -p "${zipPath}" "${targetFile}" > "${path.join(outDir, targetFile)}"`, { stdio: 'inherit' });
      resolve(path.join(outDir, targetFile));
    } catch (e) {
      reject(new Error(`unzip failed: ${e.message}. Make sure unzip is installed.`));
    }
  });
}

async function buildBinary(txtPath) {
  console.log(`Building binary from ${txtPath} (top ${TOP_K} words, ${DIM}d)…`);
  const lines = fs.readFileSync(txtPath, 'utf8').split('\n');
  const entries = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(' ');
    const word = parts[0];
    if (STOPWORDS.has(word)) continue;
    if (parts.length !== DIM + 1) continue;
    const vec = parts.slice(1).map(Number);
    entries.push({ word, vec });
    if (entries.length >= TOP_K) break;
  }

  console.log(`  Collected ${entries.length} words.`);

  // Header: [uint32 dim][uint32 wordCount]
  const wordCount = entries.length;
  const buffers = [];
  const header = Buffer.alloc(8);
  header.writeUInt32LE(DIM, 0);
  header.writeUInt32LE(wordCount, 4);
  buffers.push(header);

  for (const { word, vec } of entries) {
    const wordBytes = Buffer.from(word, 'utf8');
    const entryBuf = Buffer.alloc(2 + wordBytes.length + DIM * 4);
    entryBuf.writeUInt16LE(wordBytes.length, 0);
    wordBytes.copy(entryBuf, 2);
    for (let i = 0; i < DIM; i++) {
      entryBuf.writeFloatLE(vec[i], 2 + wordBytes.length + i * 4);
    }
    buffers.push(entryBuf);
  }

  const out = Buffer.concat(buffers);
  fs.writeFileSync(OUT_FILE, out);
  console.log(`\nWritten: ${OUT_FILE} (${(out.length / 1e6).toFixed(2)} MB)`);
}

(async () => {
  try {
    const txtPath = path.join(path.dirname(TMP_ZIP), TARGET_FILE);

    if (!fs.existsSync(txtPath)) {
      if (!fs.existsSync(TMP_ZIP)) {
        await download(GLOVE_URL, TMP_ZIP);
      }
      await extractGloveText(TMP_ZIP, TARGET_FILE);
    } else {
      console.log(`Using existing ${txtPath}`);
    }

    await buildBinary(txtPath);

    // Cleanup temp files
    [TMP_ZIP, txtPath].forEach(f => { try { fs.unlinkSync(f); } catch {} });

    console.log('\nDone! Upload glove-30k-50d.bin to a GitHub release and');
    console.log('paste the download URL into src/services/search/GloveService.ts');
  } catch (e) {
    console.error('\nError:', e.message);
    process.exit(1);
  }
})();
