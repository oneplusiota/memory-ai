/**
 * GloveService — on-device semantic embeddings using pre-built GloVe word vectors.
 *
 * Binary format (built by scripts/build-glove-binary.js):
 *   Header: [uint32 dim][uint32 wordCount]
 *   Per entry: [uint16 wordByteLen][utf8 word][float32 × dim]
 *
 * Embedding strategy: average of word vectors (excluding stopwords + OOV words),
 * L2-normalised. Cosine similarity between two L2-normalised vectors = dot product.
 *
 * The model file (~7MB) is downloaded once on demand and cached in the app's
 * document directory. `embed()` is synchronous after `loadVocab()` completes.
 */

import * as FileSystem from 'expo-file-system/legacy';

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * URL of the pre-built binary on GitHub Releases.
 * After running `node scripts/build-glove-binary.js` and uploading the output,
 * replace this with the actual release asset URL.
 */
export const GLOVE_MODEL_URL =
  'https://github.com/oneplusiota/memory-ai/releases/download/v2.0.0-glove/glove-30k-50d.bin';

const MODEL_FILENAME = 'glove-30k-50d.bin';
const modelPath = () => FileSystem.documentDirectory + MODEL_FILENAME;

// ── Module state ───────────────────────────────────────────────────────────

let vocab: Map<string, Float32Array> | null = null;
let vocabDim = 0;
let loadPromise: Promise<void> | null = null;

// ── Stopwords ──────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','was','are','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','shall','can',
  'not','no','nor','so','yet','both','either','neither','each','few','more',
  'most','other','some','such','than','that','these','this','those','very',
  'just','into','about','also','as','it','its','i','me','my','we','us','our',
  'you','your','he','she','they','them','their','what','which','who','how',
]);

// ── Public API ─────────────────────────────────────────────────────────────

export async function isModelDownloaded(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(modelPath());
  return info.exists;
}

export async function downloadModel(
  onProgress?: (progress: number) => void,
): Promise<void> {
  const dest = modelPath();
  const callback = onProgress
    ? ({ totalBytesWritten, totalBytesExpectedToWrite }: FileSystem.DownloadProgressData) => {
        if (totalBytesExpectedToWrite > 0) {
          onProgress(totalBytesWritten / totalBytesExpectedToWrite);
        }
      }
    : undefined;

  const downloadResumable = FileSystem.createDownloadResumable(
    GLOVE_MODEL_URL,
    dest,
    {},
    callback,
  );
  const result = await downloadResumable.downloadAsync();
  if (!result || result.status !== 200) {
    // Clean up partial file
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw new Error(`Model download failed (status ${result?.status ?? 'unknown'})`);
  }
}

export async function deleteModel(): Promise<void> {
  await FileSystem.deleteAsync(modelPath(), { idempotent: true });
  vocab = null;
  vocabDim = 0;
  loadPromise = null;
}

/**
 * Parse the binary vocab file into memory.
 * Idempotent — safe to call multiple times.
 */
export async function loadVocab(): Promise<void> {
  if (vocab !== null) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const path = modelPath();
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      loadPromise = null;
      return;
    }

    // Read binary as base64, decode to ArrayBuffer
    const b64 = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const raw = base64ToArrayBuffer(b64);
    const view = new DataView(raw);

    let offset = 0;
    const dim       = view.getUint32(offset, true); offset += 4;
    const wordCount = view.getUint32(offset, true); offset += 4;

    vocabDim = dim;
    const map = new Map<string, Float32Array>();

    for (let i = 0; i < wordCount; i++) {
      const wordLen = view.getUint16(offset, true); offset += 2;
      const wordBytes = new Uint8Array(raw, offset, wordLen); offset += wordLen;
      const word = decodeUtf8(wordBytes);
      // slice() creates an aligned copy — Float32Array view requires 4-byte aligned byteOffset
      const vecBuf = raw.slice(offset, offset + dim * 4);
      map.set(word, new Float32Array(vecBuf));
      offset += dim * 4;
    }

    vocab = map;
  })();

  return loadPromise;
}

/**
 * Returns true once loadVocab() has completed successfully.
 */
export function isReady(): boolean {
  return vocab !== null;
}

/**
 * Embed text as an L2-normalised average of its word vectors.
 * Returns null if vocab is not loaded or no words are in-vocab.
 * Synchronous after loadVocab() resolves.
 */
export function embed(text: string): Float32Array | null {
  if (!vocab || vocabDim === 0) return null;

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));

  const sum = new Float32Array(vocabDim);
  let count = 0;

  for (const word of words) {
    const vec = vocab.get(word);
    if (!vec) continue;
    for (let i = 0; i < vocabDim; i++) sum[i] += vec[i];
    count++;
  }

  if (count === 0) return null;

  // Average
  for (let i = 0; i < vocabDim; i++) sum[i] /= count;

  // L2-normalise
  return l2Normalise(sum);
}

/**
 * Cosine similarity between two L2-normalised vectors.
 * Pre-normalisation means this is just a dot product.
 */
export function cosineSimilarity(a: Float32Array | number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

// ── Private helpers ────────────────────────────────────────────────────────

function l2Normalise(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b); i++;
    } else if ((b & 0xe0) === 0xc0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2;
    } else {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
      ); i += 3;
    }
  }
  return out;
}
