import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { DeliveryMode, GeminiModelId, ResponseFormat, ThinkingDepth } from '../types';

interface CodeSnippetPanelProps {
  prompt: string;
  systemInstruction: string;
  model: GeminiModelId;
  thinkingLevel: ThinkingDepth;
  responseFormat: ResponseFormat;
  deliveryMode: DeliveryMode;
  mode?: 'generate' | 'chat';
}

type CodeLanguage = 'typescript' | 'python';

function escapeJsString(value: string): string {
  return JSON.stringify(value);
}

function escapePyString(value: string): string {
  return JSON.stringify(value);
}

export function CodeSnippetPanel({
  prompt,
  systemInstruction,
  model,
  thinkingLevel,
  responseFormat,
  deliveryMode,
  mode = 'generate',
}: CodeSnippetPanelProps) {
  const [language, setLanguage] = useState<CodeLanguage>('typescript');
  const [snippetKind, setSnippetKind] = useState<'generate' | 'chat'>(mode);
  const [copied, setCopied] = useState(false);

  const hasSystem = systemInstruction.trim().length > 0;
  const hasThinking = thinkingLevel !== 'DEFAULT';
  const hasJson = snippetKind === 'generate' && responseFormat === 'json';
  const hasConfig = hasSystem || hasThinking || hasJson;

  const buildTypeScriptCode = (): string => {
    const imports = hasThinking
      ? 'import { GoogleGenAI, ThinkingLevel } from "@google/genai";'
      : 'import { GoogleGenAI } from "@google/genai";';

    const configLines: string[] = [];
    if (hasSystem) {
      configLines.push(`    systemInstruction: ${escapeJsString(systemInstruction.trim())},`);
    }
    if (hasJson) {
      configLines.push(`    responseMimeType: "application/json",`);
    }
    if (hasThinking) {
      configLines.push(`    thinkingConfig: { thinkingLevel: ThinkingLevel.${thinkingLevel} },`);
    }

    const configBlock = hasConfig ? `\n  config: {\n${configLines.join('\n')}\n  },` : '';

    if (snippetKind === 'chat') {
      return `${imports}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const chat = ai.chats.create({
  model: "${model}",${configBlock}
});

const stream = await chat.sendMessageStream({
  message: ${escapeJsString(prompt || 'Explain how AI works in a few words')},
});

for await (const chunk of stream) {
  process.stdout.write(chunk.text ?? "");
}`;
    }

    if (deliveryMode === 'stream') {
      return `${imports}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const stream = await ai.models.generateContentStream({
  model: "${model}",
  contents: ${escapeJsString(prompt || 'Explain how AI works in a few words')},${configBlock}
});

for await (const chunk of stream) {
  process.stdout.write(chunk.text ?? "");
}`;
    }

    return `${imports}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const response = await ai.models.generateContent({
  model: "${model}",
  contents: ${escapeJsString(prompt || 'Explain how AI works in a few words')},${configBlock}
});

console.log(response.text);`;
  };

  const buildPythonCode = (): string => {
    const needsTypes = hasConfig;
    const header = needsTypes
      ? 'from google import genai\nfrom google.genai import types\n'
      : 'from google import genai\n';

    const configArgs: string[] = [];
    if (hasSystem) {
      configArgs.push(`        system_instruction=${escapePyString(systemInstruction.trim())},`);
    }
    if (hasJson) {
      configArgs.push(`        response_mime_type="application/json",`);
    }
    if (hasThinking) {
      configArgs.push(
        `        thinking_config=types.ThinkingConfig(thinking_level="${thinkingLevel}"),`
      );
    }

    const configBlock = hasConfig
      ? `\n    config=types.GenerateContentConfig(\n${configArgs.join('\n')}\n    ),`
      : '';

    if (snippetKind === 'chat') {
      return `${header}
client = genai.Client()

chat = client.chats.create(
    model="${model}",${configBlock}
)

for chunk in chat.send_message_stream(${escapePyString(prompt || 'Explain how AI works in a few words')}):
    print(chunk.text, end="")`;
    }

    if (deliveryMode === 'stream') {
      return `${header}
client = genai.Client()

for chunk in client.models.generate_content_stream(
    model="${model}",
    contents=${escapePyString(prompt || 'Explain how AI works in a few words')},${configBlock}
):
    print(chunk.text, end="")`;
    }

    return `${header}
client = genai.Client()

response = client.models.generate_content(
    model="${model}",
    contents=${escapePyString(prompt || 'Explain how AI works in a few words')},${configBlock}
)

print(response.text)`;
  };

  const code = language === 'typescript' ? buildTypeScriptCode() : buildPythonCode();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in sandboxed iframe if permissions denied
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-950">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setSnippetKind('chat')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                snippetKind === 'chat'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Multi-turn Chat
            </button>
            <button
              type="button"
              onClick={() => setSnippetKind('generate')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                snippetKind === 'generate'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Single Generate
            </button>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setLanguage('typescript')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                language === 'typescript'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              TypeScript
            </button>
            <button
              type="button"
              onClick={() => setLanguage('python')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                language === 'python'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Python
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy snippet'}</span>
        </button>
      </div>

      <pre className="p-4 text-[13px] leading-relaxed text-slate-100 font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}
