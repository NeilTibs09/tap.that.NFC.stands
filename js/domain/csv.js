// Minimal RFC 4180 CSV parser/writer. Handles quotes, escaped quotes, CRLF,
// a UTF-8 BOM, and auto-detects comma / semicolon / tab delimiters.

export function detectDelimiter(text) {
  const firstLine = String(text).replace(/^﻿/, '').split(/\r?\n/)[0] || '';
  const counts = [',', ';', '\t'].map((d) => {
    let n = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) n++;
    }
    return [d, n];
  });
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

export function parseCSV(text, delimiter) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty rows
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection when the file is opened in Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV(rows) {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
