import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  Play,
  RotateCcw,
  Square,
  Upload,
} from 'lucide-react';
import {
  MODEL_PROFILES,
  type GeminiModelId,
  type ModelProfileId,
  type ThinkingDepth,
  type UsageMetrics,
} from '../types';
import { escapeCsvCell, parsePromptCsv, type ParsedCsvPromptRow } from '../utils/csv';
import { MarkdownOutput } from './MarkdownOutput';

const SAMPLE_CSV = `label,prompt,system_instruction
AI Summary,"Explain how AI works in a few words","Be concise and clear."
REST vs GraphQL,"Compare REST and GraphQL for a mobile app backend in 3 bullet points.","Respond as a senior backend architect."
Caching Strategy,"When should a web service use Redis instead of in-memory caching?","Keep the explanation practical with concrete examples."
Regex vs Parser,"Why is a dedicated parser preferred over regex for nested JSON or HTML?",""`;

type CellStatus = 'idle' | 'running' | 'done' | 'error';

interface ModelRunResult {
  status: CellStatus;
  output: string;
  durationMs: number | null;
  usage: UsageMetrics | null;
  error: string | null;
}

interface BatchRowState {
  row: ParsedCsvPromptRow;
  primary: ModelRunResult;
  secondary: ModelRunResult | null;
}

function createEmptyResult(): ModelRunResult {
  return {
    status: 'idle',
    output: '',
    durationMs: null,
    usage: null,
    error: null,
  };
}

const BATCH_PROFILES = MODEL_PROFILES.filter((p) => !p.requiresOpenAI);

interface BatchCsvViewProps {
  sessionToken?: string | null;
}

export function BatchCsvView({ sessionToken = null }: BatchCsvViewProps) {
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [primaryProfileId, setPrimaryProfileId] = useState<ModelProfileId>('flash-chat');
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [secondaryProfileId, setSecondaryProfileId] = useState<ModelProfileId>('flash-lite');
  const [sharedSystemInstruction, setSharedSystemInstruction] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [resultsByRow, setResultsByRow] = useState<Record<number, BatchRowState>>({});
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const primaryProfile = useMemo(
    () => BATCH_PROFILES.find((p) => p.profileId === primaryProfileId) ?? BATCH_PROFILES[0],
    [primaryProfileId]
  );

  const secondaryProfile = useMemo(
    () => BATCH_PROFILES.find((p) => p.profileId === secondaryProfileId) ?? BATCH_PROFILES[0],
    [secondaryProfileId]
  );

  const parsedCsv = useMemo(() => parsePromptCsv(csvText), [csvText]);

  const tableRows: BatchRowState[] = useMemo(() => {
    return parsedCsv.rows.map((row) => {
      const existing = resultsByRow[row.rowNumber];
      if (existing && existing.row.prompt === row.prompt) {
        return existing;
      }
      return {
        row,
        primary: createEmptyResult(),
        secondary: compareEnabled ? createEmptyResult() : null,
      };
    });
  }, [compareEnabled, parsedCsv.rows, resultsByRow]);

  const completedCount = useMemo(() => {
    return tableRows.filter(
      (r) =>
        (r.primary.status === 'done' || r.primary.status === 'error') &&
        (!compareEnabled ||
          r.secondary?.status === 'done' ||
          r.secondary?.status === 'error')
    ).length;
  }, [compareEnabled, tableRows]);

  const summaryStats = useMemo(() => {
    let primaryLatencySum = 0;
    let primaryLatencyCount = 0;
    let primaryTokensSum = 0;

    let secondaryLatencySum = 0;
    let secondaryLatencyCount = 0;
    let secondaryTokensSum = 0;

    for (const item of tableRows) {
      if (item.primary.status === 'done' && item.primary.durationMs !== null) {
        primaryLatencySum += item.primary.durationMs;
        primaryLatencyCount += 1;
      }
      if (item.primary.usage?.totalTokens) {
        primaryTokensSum += item.primary.usage.totalTokens;
      }
      if (item.secondary?.status === 'done' && item.secondary.durationMs !== null) {
        secondaryLatencySum += item.secondary.durationMs;
        secondaryLatencyCount += 1;
      }
      if (item.secondary?.usage?.totalTokens) {
        secondaryTokensSum += item.secondary.usage.totalTokens;
      }
    }

    return {
      primaryAvgMs:
        primaryLatencyCount > 0 ? Math.round(primaryLatencySum / primaryLatencyCount) : null,
      primaryTokensSum,
      secondaryAvgMs:
        secondaryLatencyCount > 0 ? Math.round(secondaryLatencySum / secondaryLatencyCount) : null,
      secondaryTokensSum,
    };
  }, [tableRows]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setCsvText(content);
      setFileName(file.name);
      setFileError(null);
      setResultsByRow({});
    } catch {
      setFileError('Could not read the selected CSV file.');
    } finally {
      e.target.value = '';
    }
  };

  const runSingleModelCall = async (params: {
    prompt: string;
    systemInstruction: string;
    model: GeminiModelId;
    thinkingLevel: ThinkingDepth;
    signal: AbortSignal;
  }): Promise<ModelRunResult> => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
      }
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers,
        credentials: 'include',
        signal: params.signal,
        body: JSON.stringify({
          prompt: params.prompt,
          systemInstruction: params.systemInstruction,
          model: params.model,
          thinkingLevel: params.thinkingLevel,
          responseFormat: 'text',
          stream: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      return {
        status: 'done',
        output: typeof data.text === 'string' ? data.text : '',
        durationMs: typeof data.durationMs === 'number' ? data.durationMs : null,
        usage: data.usage ?? null,
        error: null,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      return {
        status: 'error',
        output: '',
        durationMs: null,
        usage: null,
        error: err instanceof Error ? err.message : 'Request failed.',
      };
    }
  };

  const stopBatch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsBatchRunning(false);
  };

  const runBatch = async (onlyRowNumber?: number) => {
    const targetRows =
      onlyRowNumber !== undefined
        ? parsedCsv.rows.filter((r) => r.rowNumber === onlyRowNumber)
        : parsedCsv.rows;

    if (targetRows.length === 0) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsBatchRunning(true);

    // Initialize target rows
    setResultsByRow((prev) => {
      const next = onlyRowNumber === undefined ? {} : { ...prev };
      for (const row of targetRows) {
        next[row.rowNumber] = {
          row,
          primary: { ...createEmptyResult(), status: 'idle' },
          secondary: compareEnabled ? { ...createEmptyResult(), status: 'idle' } : null,
        };
      }
      return next;
    });

    try {
      for (const row of targetRows) {
        if (controller.signal.aborted) break;

        const effectiveSystem = row.systemInstruction || sharedSystemInstruction;

        // Mark row running
        setResultsByRow((prev) => ({
          ...prev,
          [row.rowNumber]: {
            row,
            primary: { ...createEmptyResult(), status: 'running' },
            secondary: compareEnabled ? { ...createEmptyResult(), status: 'running' } : null,
          },
        }));

        const primaryPromise = runSingleModelCall({
          prompt: row.prompt,
          systemInstruction: effectiveSystem,
          model: primaryProfile.workbenchModel,
          thinkingLevel: primaryProfile.defaultThinking,
          signal: controller.signal,
        });

        const secondaryPromise = compareEnabled
          ? runSingleModelCall({
              prompt: row.prompt,
              systemInstruction: effectiveSystem,
              model: secondaryProfile.workbenchModel,
              thinkingLevel: secondaryProfile.defaultThinking,
              signal: controller.signal,
            })
          : Promise.resolve(null);

        const [primaryResult, secondaryResult] = await Promise.all([
          primaryPromise,
          secondaryPromise,
        ]);

        setResultsByRow((prev) => ({
          ...prev,
          [row.rowNumber]: {
            row,
            primary: primaryResult,
            secondary: secondaryResult,
          },
        }));
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setFileError(err instanceof Error ? err.message : 'Batch execution interrupted.');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsBatchRunning(false);
    }
  };

  const handleExportCsv = () => {
    const headers = compareEnabled
      ? [
          'row',
          'label',
          'prompt',
          'system_instruction',
          `${primaryProfile.label}_output`,
          `${primaryProfile.label}_latency_ms`,
          `${primaryProfile.label}_tokens`,
          `${secondaryProfile.label}_output`,
          `${secondaryProfile.label}_latency_ms`,
          `${secondaryProfile.label}_tokens`,
        ]
      : [
          'row',
          'label',
          'prompt',
          'system_instruction',
          `${primaryProfile.label}_output`,
          `${primaryProfile.label}_latency_ms`,
          `${primaryProfile.label}_tokens`,
        ];

    const lines = [headers.map(escapeCsvCell).join(',')];

    for (const item of tableRows) {
      const cells: Array<string | number | null | undefined> = [
        item.row.rowNumber,
        item.row.label,
        item.row.prompt,
        item.row.systemInstruction || sharedSystemInstruction,
        item.primary.error ? `ERROR: ${item.primary.error}` : item.primary.output,
        item.primary.durationMs,
        item.primary.usage?.totalTokens ?? null,
      ];
      if (compareEnabled) {
        cells.push(
          item.secondary?.error
            ? `ERROR: ${item.secondary.error}`
            : item.secondary?.output ?? '',
          item.secondary?.durationMs ?? null,
          item.secondary?.usage?.totalTokens ?? null
        );
      }
      lines.push(cells.map(escapeCsvCell).join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `talash-ai-batch-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    stopBatch();
    setCsvText(SAMPLE_CSV);
    setFileName(null);
    setFileError(null);
    setResultsByRow({});
  };

  return (
    <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 text-slate-100">
      {/* Header & Primary Batch Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Batch CSV Runner</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Upload or paste a CSV of prompts, run every row automatically, and compare model outputs side by side.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleFileUpload(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#081229] border border-sky-500/30 hover:border-sky-400 hover:text-white rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Upload CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={tableRows.length === 0 || completedCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#081229] border border-sky-500/30 hover:border-sky-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Download CSV</span>
          </button>

          {isBatchRunning ? (
            <button
              type="button"
              onClick={stopBatch}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600/90 hover:bg-red-600 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Batch</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={parsedCsv.rows.length === 0}
              onClick={() => void runBatch()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white talash-neon-btn disabled:opacity-45 disabled:cursor-not-allowed rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run All ({parsedCsv.rows.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Configuration & CSV Input Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* CSV Input Editor (7 cols) */}
        <section className="lg:col-span-7 talash-glass-card rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-sky-500/20 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <FileSpreadsheet className="w-4 h-4 text-sky-400" />
              <span className="font-semibold text-white text-sm">CSV Input</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{parsedCsv.rows.length} prompts detected</span>
              {fileName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-cyan-300">{fileName}</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Load Sample</span>
            </button>
          </div>

          <div className="p-4 flex-1 flex flex-col gap-3">
            <textarea
              rows={7}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'label,prompt,system_instruction\nTest 1,"Explain how AI works in a few words","Be concise"'}
              className="w-full flex-1 px-3.5 py-2.5 font-mono text-xs leading-relaxed bg-[#040916]/90 border border-sky-500/30 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400 resize-y"
            />
            <p className="text-xs text-slate-400">
              Supports header columns <code className="font-mono text-cyan-300">prompt</code>, optional{' '}
              <code className="font-mono text-cyan-300">label</code>, and optional{' '}
              <code className="font-mono text-cyan-300">system_instruction</code>, or one prompt per line.
            </p>
            {fileError && (
              <div className="p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{fileError}</span>
              </div>
            )}
          </div>
        </section>

        {/* Model Comparison Controls (5 cols) */}
        <section className="lg:col-span-5 talash-glass-card rounded-2xl p-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="primary-model-select" className="block text-xs font-semibold text-white">
                Primary Model
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[#040916] border border-sky-500/25 rounded-xl">
                {BATCH_PROFILES.map((profile) => (
                  <button
                    key={profile.profileId}
                    type="button"
                    onClick={() => setPrimaryProfileId(profile.profileId)}
                    className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate cursor-pointer ${
                      primaryProfileId === profile.profileId
                        ? 'talash-neon-btn text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {profile.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">
                Uses <span className="font-mono text-cyan-300">{primaryProfile.workbenchModel}</span> ·{' '}
                {primaryProfile.defaultThinking} thinking
              </p>
            </div>

            <div className="pt-3 border-t border-sky-500/20 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-white">
                  Compare Second Model Side-by-Side
                </span>
                <button
                  type="button"
                  onClick={() => setCompareEnabled((prev) => !prev)}
                  className={`px-3 py-1 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                    compareEnabled
                      ? 'talash-neon-btn text-white border-sky-400/50'
                      : 'bg-[#040916] text-slate-400 border-sky-500/25 hover:text-white'
                  }`}
                >
                  {compareEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {compareEnabled && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[#040916] border border-sky-500/25 rounded-xl">
                  {BATCH_PROFILES.map((profile) => (
                    <button
                      key={profile.profileId}
                      type="button"
                      onClick={() => setSecondaryProfileId(profile.profileId)}
                      className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate cursor-pointer ${
                        secondaryProfileId === profile.profileId
                          ? 'talash-neon-btn text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {profile.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-sky-500/20 space-y-1.5">
              <label htmlFor="batch-shared-system" className="block text-xs font-semibold text-white">
                Fallback System Instruction
              </label>
              <textarea
                id="batch-shared-system"
                rows={2}
                value={sharedSystemInstruction}
                onChange={(e) => setSharedSystemInstruction(e.target.value)}
                placeholder="Applied to any CSV row that leaves system_instruction blank..."
                className="w-full px-3 py-2 text-xs leading-relaxed bg-[#040916]/90 border border-sky-500/30 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400 resize-y"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-sky-500/20 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 tabular-nums">
            <div>
              <span className="text-slate-400 mr-1.5">Progress</span>
              <span className="font-mono font-medium text-white">
                {completedCount}/{tableRows.length} rows
              </span>
            </div>
            {summaryStats.primaryAvgMs !== null && (
              <div>
                <span className="text-slate-400 mr-1.5">{primaryProfile.label} avg</span>
                <span className="font-mono font-medium text-cyan-300">
                  {summaryStats.primaryAvgMs} ms
                </span>
              </div>
            )}
            {compareEnabled && summaryStats.secondaryAvgMs !== null && (
              <div>
                <span className="text-slate-400 mr-1.5">{secondaryProfile.label} avg</span>
                <span className="font-mono font-medium text-cyan-300">
                  {summaryStats.secondaryAvgMs} ms
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Side-by-Side Comparison Results Table */}
      <section className="talash-glass-card rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-sky-500/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <h2 className="font-semibold text-white text-sm">Side-by-Side Comparison Table</h2>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{tableRows.length} rows</span>
          </div>

          {summaryStats.primaryTokensSum > 0 && (
            <div className="flex items-center gap-4 text-xs text-slate-400 tabular-nums">
              <span>
                {primaryProfile.label}:{' '}
                <strong className="font-mono text-cyan-300">
                  {summaryStats.primaryTokensSum}
                </strong>{' '}
                tokens
              </span>
              {compareEnabled && summaryStats.secondaryTokensSum > 0 && (
                <span>
                  {secondaryProfile.label}:{' '}
                  <strong className="font-mono text-cyan-300">
                    {summaryStats.secondaryTokensSum}
                  </strong>{' '}
                  tokens
                </span>
              )}
            </div>
          )}
        </div>

        {tableRows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-white">No prompts found in CSV</p>
            <p className="text-xs text-slate-400">
              Upload a CSV file or paste prompt rows above, or click Load Sample to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse align-top">
              <thead>
                <tr className="border-b border-sky-500/25 bg-[#081229] text-xs font-semibold text-slate-200">
                  <th className="py-3 px-4 w-12 tabular-nums">#</th>
                  <th className="py-3 px-4 min-w-[240px]">Prompt</th>
                  <th className="py-3 px-4 min-w-[300px]">
                    {primaryProfile.label} ({primaryProfile.workbenchModel})
                  </th>
                  {compareEnabled && (
                    <th className="py-3 px-4 min-w-[300px]">
                      {secondaryProfile.label} ({secondaryProfile.workbenchModel})
                    </th>
                  )}
                  <th className="py-3 px-4 text-right whitespace-nowrap w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-500/15 text-sm">
                {tableRows.map((item) => {
                  const rowBusy =
                    item.primary.status === 'running' ||
                    item.secondary?.status === 'running';

                  return (
                    <tr key={`${item.row.rowNumber}-${item.row.prompt.slice(0, 24)}`} className="hover:bg-sky-500/5">
                      <td className="py-4 px-4 font-mono text-xs text-slate-400 tabular-nums">
                        {item.row.rowNumber}
                      </td>

                      <td className="py-4 px-4 space-y-1.5 max-w-xs">
                        <p className="text-xs font-semibold text-white">{item.row.label}</p>
                        <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
                          {item.row.prompt}
                        </p>
                        {(item.row.systemInstruction || sharedSystemInstruction) && (
                          <p className="text-[11px] text-slate-400 leading-snug pt-1">
                            <span className="font-medium text-sky-300">System: </span>
                            {item.row.systemInstruction || sharedSystemInstruction}
                          </p>
                        )}
                      </td>

                      <td className="py-4 px-4 max-w-md">
                        <ResultCell result={item.primary} />
                      </td>

                      {compareEnabled && (
                        <td className="py-4 px-4 max-w-md">
                          <ResultCell result={item.secondary ?? createEmptyResult()} />
                        </td>
                      )}

                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isBatchRunning || rowBusy}
                          onClick={() => void runBatch(item.row.rowNumber)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#081229] border border-sky-500/30 hover:border-sky-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current text-sky-400" />
                          <span>Run</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function ResultCell({ result }: { result: ModelRunResult }) {
  if (result.status === 'idle') {
    return <span className="text-xs text-slate-400">Queued — click Run All to execute</span>;
  }

  if (result.status === 'running') {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-sky-300">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
        <span>Generating...</span>
      </div>
    );
  }

  if (result.status === 'error') {
    return (
      <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <span>{result.error || 'Generation failed.'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="text-xs leading-relaxed text-slate-200">
        <MarkdownOutput content={result.output} />
      </div>
      <div className="pt-2 border-t border-sky-500/20 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 tabular-nums">
        {result.durationMs !== null && (
          <span>
            <span className="text-slate-400 mr-1">Latency</span>
            <span className="font-mono font-medium text-cyan-300">{result.durationMs} ms</span>
          </span>
        )}
        {result.usage?.totalTokens !== null && result.usage?.totalTokens !== undefined && (
          <span>
            <span className="text-slate-400 mr-1">Tokens</span>
            <span className="font-mono font-medium text-cyan-300">
              {result.usage.totalTokens}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
