import { CSV_COLUMNS } from './constants.js';

export function toCSV(points) {
  const esc = v => `"${String(v ?? '').replaceAll('"', '""')}"`;

  return [
    CSV_COLUMNS.join(','),
    ...points.map(p =>
      CSV_COLUMNS.map(c => esc(p[c])).join(',')
    )
  ].join('\n');
}

export function downloadCSV(points, name = 'santiset.csv') {
  const blob = new Blob([toCSV(points)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');

  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();

  URL.revokeObjectURL(a.href);
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCSVLine(lines.shift()).map(h => h.trim());

  return lines
    .filter(line => line.trim())
    .map(line => {
      const values = parseCSVLine(line);
      const row = {};

      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });

      return row;
    });
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}
