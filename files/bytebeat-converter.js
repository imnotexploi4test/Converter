import { getAudioDataString } from './audio-state.js';

// ---------------------------------------------------------------------------
// This file used to hand the sample-data string to a Python runtime (Pyodide)
// for the actual char-encoding step. That encoding had two real bugs:
//   1. It escaped backslashes/newlines by INSERTING extra characters instead of
//      substituting in place, silently changing the sample count.
//   2. It never escaped/avoided single-quote (') at all, so any sample landing
//      on that character broke the embedding string literal outright.
// Both are fixed here by encoding directly in JS with a fixed, verified
// one-character-per-sample mapping, and by remapping only the handful of
// codes that are actually unsafe to a nearby safe value (never inserting or
// removing characters). No external runtime is needed for this step.
// ---------------------------------------------------------------------------

// ---- INT / "Bytebeat" mode: classic 0-255 byte-per-sample, high fidelity ----
// Only 4 codes are unsafe inside a single-quoted, single-line JS string
// literal: ' (39), \ (92), LF (10), CR (13). Each is nudged to an adjacent
// safe value -- never dropped, never combined with a neighbor -- so the
// output string always has exactly one character per sample.
const INT_UNSAFE_REMAP = { 39: 38, 92: 93, 10: 11, 13: 12 };
function quantizeSampleToByte(sample) {
  let b = Math.round((sample * 127.5) + 128);
  if (b < 0) b = 0;
  if (b > 255) b = 255;
  return b;
}
function intByteToSafeCharCode(byte) {
  return INT_UNSAFE_REMAP.hasOwnProperty(byte) ? INT_UNSAFE_REMAP[byte] : byte;
}

// ---- FLOAT / "Floatbeat" mode: printable letters/digits/symbols palette ----
// All printable ASCII (33-126) except ' and \ (the only two that are ever
// unsafe in a single-quoted literal, since this string never contains raw
// control characters to begin with). 92 levels total.
const FLOATBEAT_CHARS = (function () {
  let s = '';
  for (let c = 33; c <= 126; c++) {
    if (c === 39 || c === 92) continue; // ' and \
    s += String.fromCharCode(c);
  }
  return s;
})();
const FB_LEVELS = FLOATBEAT_CHARS.length; // 92

function floatSampleToChar(sample) {
  const v = Math.max(-1, Math.min(1, sample)); // clamp to the -1..1 range this mode represents
  let level = Math.round(((v + 1) / 2) * (FB_LEVELS - 1));
  if (level < 0) level = 0;
  if (level > FB_LEVELS - 1) level = FB_LEVELS - 1;
  return FLOATBEAT_CHARS[level];
}

// Build the encoded string for a given mode, and verify (not just assume)
// that its length matches the sample count exactly -- no drift in either
// direction.
function buildEncodedString(samples, mode) {
  const n = samples.length;
  const chars = new Array(n);
  if (mode === 'float') {
    for (let i = 0; i < n; i++) chars[i] = floatSampleToChar(samples[i]);
  } else {
    for (let i = 0; i < n; i++) chars[i] = String.fromCharCode(intByteToSafeCharCode(quantizeSampleToByte(samples[i])));
  }
  const str = chars.join('');
  if (str.length !== n) {
    // Should be unreachable given the mapping above always emits exactly one
    // character per input sample -- kept as a hard safety check.
    throw new Error('Internal error: encoded length (' + str.length + ') does not match sample count (' + n + ').');
  }
  return str;
}

function buildFormula(str, mode, format) {
  if (mode === 'float') {
    const paletteLiteral = "'" + FLOATBEAT_CHARS + "'";
    const decodeExpr = (dataVar, paletteVar) =>
      '(' + paletteVar + '.indexOf(' + dataVar + '.charAt(t % ' + dataVar + '.length)) / ' + (FB_LEVELS - 1) + ') * 2 - 1';

    switch (format) {
      case 'alternate':
        return "t||(sampledata='" + str + "',palette=" + paletteLiteral + ")," + decodeExpr('sampledata', 'palette');
      case 'assignment':
        return "(sample_data='" + str + "',sample_palette=" + paletteLiteral + "," + decodeExpr('sample_data', 'sample_palette') + ")";
      case 'default':
      default:
        return "sampledata='" + str + "',palette=" + paletteLiteral + "," + decodeExpr('sampledata', 'palette');
    }
  } else {
    // int / bytebeat mode: the encoded char code IS the sample byte directly.
    const decodeExpr = (dataVar) => dataVar + '.charCodeAt(t % ' + dataVar + '.length)';
    switch (format) {
      case 'alternate':
        return "t||(sampledata='" + str + "')," + decodeExpr('sampledata');
      case 'assignment':
        return "(sample_data='" + str + "'," + decodeExpr('sample_data') + ")";
      case 'default':
      default:
        return "sampledata='" + str + "'," + decodeExpr('sampledata');
    }
  }
}

export async function convertToBytebeat() {
  const audioDataString = getAudioDataString();
  if (!audioDataString) {
    (await import('./utils.js')).showToast('Please convert to sample data first.', 'error');
    return;
  }

  const enableFloat = document.getElementById('enableFloat').checked; // checked = floatbeat, unchecked = bytebeat (int)
  const format = document.querySelector('input[name="format"]:checked').value;
  const mode = enableFloat ? 'float' : 'int';

  try {
    const samples = audioDataString
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => parseFloat(line));

    if (samples.some(v => Number.isNaN(v))) {
      throw new Error('Sample data contains a value that could not be parsed as a number.');
    }

    const encoded = buildEncodedString(samples, mode);
    const formula = buildFormula(encoded, mode, format);

    document.getElementById('output').value = formula;

    const countEl = document.getElementById('outputCount');
    if (countEl) {
      countEl.textContent = encoded.length + ' chars / ' + samples.length + ' samples (' +
        (mode === 'float' ? 'floatbeat, ' + FB_LEVELS + '-level palette' : 'bytebeat, raw 0-255') + ')';
    }

    (await import('./utils.js')).showToast('Bytebeat generated (' + samples.length + ' samples).', 'success');
  } catch (error) {
    console.error('Conversion error:', error);
    document.getElementById('output').value = 'Error: ' + error.message;
    (await import('./utils.js')).showToast('Conversion failed: ' + error.message, 'error');
  }
}
