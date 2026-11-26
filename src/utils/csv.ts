export interface ParsedCsvPromptRow {
  rowNumber: number;
  label: string;
  prompt: string;
  systemInstruction: string;
}

/**
 * Parses RFC-4180 CSV text into rows of string cells.
 * Supports quoted fields, escaped double-quotes (""), and newlines inside quotes.
 */
export function parseCsvMatrix(raw: string): string[][] {
  const input = raw.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.length > 0));
}

export function parsePromptCsv(raw: string): {
  rows: ParsedCsvPromptRow[];
  hasHeader: boolean;
  detectedColumns: string[];
} {
  const matrix = parseCsvMatrix(raw);
  if (matrix.length === 0) {
    return { rows: [], hasHeader: false, detectedColumns: [] };
  }

  const firstRowLower = matrix[0].map((c) => c.toLowerCase().trim());
  const promptColIndex = firstRowLower.findIndex((h) =>
    ['prompt', 'prompts', 'question', 'input', 'query', 'text'].includes(h)
  );
  const labelColIndex = firstRowLower.findIndex((h) =>
    ['label', 'name', 'title', 'id', 'case'].includes(h)
  );
  const systemColIndex = firstRowLower.findIndex((h) =>
    ['system', 'system_instruction', 'systeminstruction', 'instruction'].includes(h)
  );

  const hasHeader =
    promptColIndex !== -1 || labelColIndex !== -1 || systemColIndex !== -1;

  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const effectivePromptCol = promptColIndex !== -1 ? promptColIndex : 0;

  const parsedRows: ParsedCsvPromptRow[] = [];
  dataRows.forEach((cells, idx) => {
    const promptText = (cells[effectivePromptCol] ?? '').trim();
    if (!promptText) return;

    const labelText =
      labelColIndex !== -1 ? (cells[labelColIndex] ?? '').trim() : '';
    const systemText =
      systemColIndex !== -1 ? (cells[systemColIndex] ?? '').trim() : '';

    parsedRows.push({
      rowNumber: idx + 1,
      label: labelText || `Row ${idx + 1}`,
      prompt: promptText,
      systemInstruction: systemText,
    });
  });

  const detectedColumns = hasHeader ? matrix[0] : ['prompt'];
  return { rows: parsedRows, hasHeader, detectedColumns };
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
