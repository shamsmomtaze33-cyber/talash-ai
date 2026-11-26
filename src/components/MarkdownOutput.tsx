import React from 'react';

interface MarkdownOutputProps {
  content: string;
  isJson?: boolean;
  dir?: 'ltr' | 'rtl';
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const tokens = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[13px] border border-slate-200"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch && isSafeHttpUrl(linkMatch[2])) {
      return (
        <a
          key={idx}
          href={linkMatch[2].trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#0e8f6e] hover:underline underline-offset-2"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  const cells = splitTableRow(trimmed);
  return cells.length >= 2 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

export function MarkdownOutput({
  content,
  isJson = false,
  dir = 'ltr',
}: MarkdownOutputProps) {
  if (!content) {
    return null;
  }

  if (isJson) {
    let formatted = content;
    try {
      const parsed = JSON.parse(content);
      formatted = JSON.stringify(parsed, null, 2);
    } catch {
      // Keep raw stream text until JSON completes
    }
    return (
      <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 font-mono text-[13px] leading-relaxed overflow-x-auto border border-slate-800">
        <code>{formatted}</code>
      </pre>
    );
  }

  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <div
          key={`code-${i}`}
          dir="ltr"
          className="my-3 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 text-left"
        >
          {lang && (
            <div className="px-3.5 py-1.5 text-[11px] font-mono text-slate-400 border-b border-slate-800 bg-slate-950">
              {lang}
            </div>
          )}
          <pre className="p-4 text-[13px] leading-relaxed text-slate-100 font-mono overflow-x-auto">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      i += 1;
      continue;
    }

    // Markdown Table (header row + separator row + body rows)
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headers = splitTableRow(line);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        bodyRows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div
          key={`tbl-${i}`}
          className="my-3.5 w-full overflow-x-auto rounded-xl border border-slate-200 bg-white"
        >
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    className={`px-3.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap ${
                      dir === 'rtl' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {renderInlineFormatting(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70">
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className={`px-3.5 py-2.5 text-slate-700 align-top ${
                        dir === 'rtl' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {renderInlineFormatting(row[cIdx] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${i}`} className="my-4 border-slate-200" />);
      i += 1;
      continue;
    }

    // Blockquote (e.g. Quranic verse / Hadith highlight)
    if (line.trimStart().startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
        quoteLines.push(lines[i].trimStart().slice(2));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className="my-3.5 px-4 py-3 rounded-xl bg-slate-50/90 border border-slate-200/90 text-slate-800 text-[15px] leading-[1.75]"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx} className={idx > 0 ? 'mt-2' : ''}>
              {renderInlineFormatting(ql)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Bullet list
    if (/^\s*[-*•]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-2.5 space-y-1.5 ps-5 list-disc text-slate-700">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const listItems: string[] = [];
      const firstNumMatch = line.match(/^\s*(\d+)[.)]\s+/);
      const startNum = firstNumMatch ? parseInt(firstNumMatch[1], 10) : 1;
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol
          key={`ol-${i}`}
          start={Number.isFinite(startNum) && startNum > 0 ? startNum : 1}
          className="my-2.5 space-y-2 ps-6 list-decimal text-slate-700"
        >
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Headings
    if (line.startsWith('#### ')) {
      blocks.push(
        <h5 key={`h5-${i}`} className="mt-4 mb-1.5 text-[14.5px] font-semibold text-slate-900">
          {renderInlineFormatting(line.slice(5))}
        </h5>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={`h4-${i}`} className="mt-4.5 mb-1.5 text-[15.5px] font-semibold text-slate-900">
          {renderInlineFormatting(line.slice(4))}
        </h4>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={`h3-${i}`} className="mt-5 mb-2 text-[17px] font-semibold text-slate-900">
          {renderInlineFormatting(line.slice(3))}
        </h3>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('# ')) {
      blocks.push(
        <h2 key={`h2-${i}`} className="mt-5 mb-2.5 text-[19px] font-semibold text-slate-900">
          {renderInlineFormatting(line.slice(2))}
        </h2>
      );
      i += 1;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Paragraph
    blocks.push(
      <p key={`p-${i}`} className="my-3 text-[16px] sm:text-[16.5px] leading-[1.82] text-slate-800">
        {renderInlineFormatting(line)}
      </p>
    );
    i += 1;
  }

  return (
    <div dir={dir} className={`w-full ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
      {blocks}
    </div>
  );
}
