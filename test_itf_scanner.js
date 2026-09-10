const assert = require('assert');

const ITF_PATTERNS = [
  '00110', '10001', '01001', '11000', '00101',
  '10100', '01100', '00011', '10010', '01010'
];

function decode5Elements(widths) {
  const indexed = widths.map((w, idx) => ({ w, idx }));
  indexed.sort((a, b) => b.w - a.w);
  const bits = ['0', '0', '0', '0', '0'];
  bits[indexed[0].idx] = '1';
  bits[indexed[1].idx] = '1';
  return ITF_PATTERNS.indexOf(bits.join(''));
}

function calcDvGeralFebraban(code44) {
  const digits = code44.slice(0, 4) + code44.slice(5);
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  const dv = 11 - rem;
  if (dv === 0 || dv === 10 || dv === 11) return '1';
  return String(dv);
}

function decodeItfRunLengths(runs) {
  if (!runs || runs.length < 227) return null;

  for (let startIdx = 0; startIdx <= runs.length - 227; startIdx++) {
    if (!runs[startIdx].isBlack) continue;
    const s1 = runs[startIdx].width;
    const s2 = runs[startIdx + 1].width;
    const s3 = runs[startIdx + 2].width;
    const s4 = runs[startIdx + 3].width;

    const avgNarrow = (s1 + s2 + s3 + s4) / 4;
    if (avgNarrow < 1) continue;

    const maxDiff = Math.max(Math.abs(s1 - avgNarrow), Math.abs(s2 - avgNarrow), Math.abs(s3 - avgNarrow), Math.abs(s4 - avgNarrow));
    if (maxDiff > avgNarrow * 0.85) continue;

    let pos = startIdx + 4;
    let code = '';
    let valid = true;

    for (let pair = 0; pair < 22; pair++) {
      if (pos + 10 > runs.length) { valid = false; break; }
      const bars = [];
      const spaces = [];
      for (let j = 0; j < 5; j++) {
        bars.push(runs[pos++].width);
        spaces.push(runs[pos++].width);
      }
      const d1 = decode5Elements(bars);
      const d2 = decode5Elements(spaces);
      if (d1 === -1 || d2 === -1) { valid = false; break; }
      code += String(d1) + String(d2);
    }

    if (valid && code.length === 44) {
      return code;
    }
  }
  return null;
}

// Função para escanear uma linha de pixels (luminância)
function scanPixelRow(rowLuminance) {
  // rowLuminance é array de números 0..255
  if (!rowLuminance || rowLuminance.length < 250) return null;

  // Calcula média de luminância para limiar
  let sum = 0;
  for (let i = 0; i < rowLuminance.length; i++) sum += rowLuminance[i];
  const avgLum = sum / rowLuminance.length;

  // Converte para runs
  const runs = [];
  let isBlack = rowLuminance[0] < avgLum;
  let currentWidth = 0;

  for (let i = 0; i < rowLuminance.length; i++) {
    const pixelIsBlack = rowLuminance[i] < avgLum;
    if (pixelIsBlack === isBlack) {
      currentWidth++;
    } else {
      runs.push({ isBlack, width: currentWidth });
      isBlack = pixelIsBlack;
      currentWidth = 1;
    }
  }
  runs.push({ isBlack, width: currentWidth });

  return decodeItfRunLengths(runs);
}

// Teste de ponta a ponta
const originalCode = '00198981500001475960000000188100000000000000';
console.log('Código original para teste:', originalCode);

// Sintetizar uma linha de pixels com 3 pixels por barra estreita e 8 por larga
let pixels = new Array(50).fill(255); // margem branca inicial
// Start: b s b s
pixels.push(...new Array(3).fill(0), ...new Array(3).fill(255), ...new Array(3).fill(0), ...new Array(3).fill(255));
for (let i = 0; i < originalCode.length; i += 2) {
  const p1 = ITF_PATTERNS[parseInt(originalCode[i], 10)];
  const p2 = ITF_PATTERNS[parseInt(originalCode[i+1], 10)];
  for (let j = 0; j < 5; j++) {
    pixels.push(...new Array(p1[j] === '1' ? 8 : 3).fill(0));
    pixels.push(...new Array(p2[j] === '1' ? 8 : 3).fill(255));
  }
}
// Stop: wide b (8), narrow s (3), narrow b (3)
pixels.push(...new Array(8).fill(0), ...new Array(3).fill(255), ...new Array(3).fill(0));
pixels.push(...new Array(60).fill(255)); // margem branca final

console.log('Total de pixels sintetizados:', pixels.length);
const decoded = scanPixelRow(pixels);
console.log('Decodificado dos pixels:', decoded);
assert.strictEqual(decoded, originalCode, 'Deve decodificar perfeitamente');
console.log('✓ [PASS] Decodificação de pixels para código de barras FEBRABAN validada!');
