function calcMod10(seq) {
  let mult = 2;
  let sum = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    let mul = parseInt(seq[i], 10) * mult;
    if (mul > 9) mul = Math.floor(mul / 10) + (mul % 10);
    sum += mul;
    mult = mult === 2 ? 1 : 2;
  }
  const rem = sum % 10;
  return rem === 0 ? '0' : String(10 - rem);
}

function decodeFebrabanBoletoRobust(rawText) {
  const result = {
    code: '',
    formattedCode: '',
    dueDate: '',
    amount: '',
    beneficiary: '',
    bankName: ''
  };

  const bankNames = {
    '001': 'Banco do Brasil',
    '033': 'Santander',
    '104': 'Caixa Econômica Federal',
    '237': 'Bradesco',
    '341': 'Itaú Unibanco',
    '748': 'Sicredi',
    '756': 'Sicoob',
    '260': 'Nubank',
    '077': 'Banco Inter',
    '212': 'Banco Original',
    '041': 'Banrisul'
  };

  if (!rawText) return result;

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Procura bloco padrão de 5 grupos (47 dígitos bancários)
  const block5Regex = /(\d{5})[.\s-]*(\d{5})\s+(\d{5})[.\s-]*(\d{6})\s+(\d{5})[.\s-]*(\d{6})\s+(\d)\s+(\d{14})/;
  for (const line of lines) {
    const cleanLine = line
      .replace(/[oO]/g, '0')
      .replace(/[lI\|]/g, '1')
      .replace(/[sS]/g, '5')
      .replace(/[bB]/g, '8')
      .replace(/[zZ]/g, '2');

    const m = cleanLine.match(block5Regex);
    if (m) {
      const c = m[1] + m[2] + m[3] + m[4] + m[5] + m[6] + m[7] + m[8];
      result.code = c;
      result.formattedCode = m[1] + '.' + m[2] + ' ' + m[3] + '.' + m[4] + ' ' + m[5] + '.' + m[6] + ' ' + m[7] + ' ' + m[8];
      const bankCode = m[1].slice(0, 3);
      result.bankName = bankNames[bankCode] || ('Banco ' + bankCode);

      const factor = parseInt(m[8].slice(0, 4), 10);
      if (factor >= 1000) {
        if (factor < 3000) {
          const base2025 = new Date(2025, 1, 22);
          const d = new Date(base2025.getTime() + (factor - 1000) * 86400000);
          result.dueDate = d.toISOString().slice(0, 10);
        } else {
          const base1997 = new Date(1997, 9, 7);
          const d = new Date(base1997.getTime() + factor * 86400000);
          result.dueDate = d.toISOString().slice(0, 10);
        }
      }

      const valCentavos = parseInt(m[8].slice(4, 14), 10);
      if (valCentavos > 0) {
        result.amount = (valCentavos / 100).toFixed(2);
      }
      break;
    }
  }

  // 2. Procura 4 blocos de concessionárias (48 dígitos: 4 blocos de 11 dígitos + 1 DV)
  if (!result.code) {
    const block4Regex = /(\d{11})[.\s-]*(\d)\s+(\d{11})[.\s-]*(\d)\s+(\d{11})[.\s-]*(\d)\s+(\d{11})[.\s-]*(\d)/;
    for (const line of lines) {
      const cleanLine = line.replace(/[oO]/g, '0').replace(/[lI\|]/g, '1');
      const m = cleanLine.match(block4Regex);
      if (m) {
        const c = m[1] + m[2] + m[3] + m[4] + m[5] + m[6] + m[7] + m[8];
        if (c.length === 48 && c.startsWith('8')) {
          result.code = c;
          result.formattedCode = m[1] + '-' + m[2] + ' ' + m[3] + '-' + m[4] + ' ' + m[5] + '-' + m[6] + ' ' + m[7] + '-' + m[8];
          result.beneficiary = 'Concessionária / Tributo';
          const valCentavos = parseInt(c.slice(4, 11) + c.slice(12, 16), 10);
          if (valCentavos > 0) {
            result.amount = (valCentavos / 100).toFixed(2);
          }
          break;
        }
      }
    }
  }

  // 3. Fallback visual para valor: ignora Desconto, Multa, Mora, etc.
  if (!result.amount) {
    const valorRegex = /(?:valor\s*(?:do\s*documento|cobrado|total|líquido|a\s*pagar)|total\s*a\s*pagar)[:\s]*R?\$?\s*([\d\.]+(?:,\d{2}))/i;
    for (const line of lines) {
      if (/desconto|abatimento|mora|multa|dedu[cç]/i.test(line)) continue;
      const vm = line.match(valorRegex);
      if (vm) {
        const parsed = parseFloat(vm[1].replace(/\./g, '').replace(',', '.'));
        if (parsed > 0) {
          result.amount = parsed.toFixed(2);
          break;
        }
      }
    }
  }

  return result;
}

// Teste 1: Boleto bancário com ruído no topo
const t1 = 'BANCO SANTANDER 033-7\n03399.88776 55443.322110 99887.766554 8 98150000043288\nBeneficiario: KALA COMERCIO\nValor do Documento: 432,88';
console.log('Teste 1:', decodeFebrabanBoletoRobust(t1));

// Teste 2: Concessionária Copel
const t2 = 'COPEL DISTRIBUICAO S.A.\n84670000004-9 58501092026-9 62862660001-9 00000000000-9\nVencimento: 19/09/2026\nValor a pagar: 458,50';
console.log('Teste 2:', decodeFebrabanBoletoRobust(t2));

// Teste 3: Apenas texto com desconto de 0,00 e valor de 1.475,96
const t3 = 'Cedente: JOGA LTDA\n(-) Desconto / Abatimento: 0,00\n(+) Mora / Multa: 2,00%\n(=) Valor do Documento: 1.475,96';
console.log('Teste 3:', decodeFebrabanBoletoRobust(t3));
