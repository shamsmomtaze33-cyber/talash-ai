export type QueryDomain =
  | 'islamic'
  | 'coding'
  | 'translation'
  | 'research'
  | 'large_batch'
  | 'general';

export type QueryComplexity = 'simple' | 'standard' | 'deep';

export interface LargeRequestInfo {
  isLarge: boolean;
  totalTarget: number | null;
  startIndex: number;
  endIndex: number | null;
  chunkSize: number;
  itemLabel: string;
}

export interface SafetyEvaluation {
  allowed: boolean;
  refusalMessage?: string;
}

export interface ContinuationMetadata {
  totalTarget: number | null;
  completedCount: number;
  nextStart: number;
  hasMore: boolean;
  duplicateWarnings: number;
}

export interface ServerCapabilities {
  gemini: {
    connected: boolean;
    models: string[];
  };
  openai: {
    connected: boolean;
    models: string[];
    envVar: string;
  };
  googleSearchGrounding: boolean;
}

export function getServerCapabilities(): ServerCapabilities {
  const geminiConnected = Boolean(process.env.GEMINI_API_KEY?.trim());
  const openaiConnected = Boolean(process.env.OPENAI_API_KEY?.trim());

  return {
    gemini: {
      connected: geminiConnected,
      models: geminiConnected ? ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] : [],
    },
    openai: {
      connected: openaiConnected,
      models: openaiConnected ? ['gpt-4o-mini', 'gpt-4o'] : [],
      envVar: 'OPENAI_API_KEY',
    },
    googleSearchGrounding: geminiConnected,
  };
}

export function detectLanguageHint(text: string): 'ps' | 'ar' | 'en' {
  if (!text) return 'en';
  // Pashto-specific letters
  if (/[\u067C\u067E\u0681\u0685\u0686\u0689\u0693\u0696\u0698\u069A\u06AB\u06AF\u06BC\u06D0\u06CD]/.test(text)) {
    return 'ps';
  }
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  if (arabicChars > 3) {
    // Check common Pashto words even when written without Pashto-specific glyphs
    if (/(څنګه|پښتو|دي|دی|ده|کې|او|له|څخه|ته|لپاره|ولې|کوم|حدیث|لمونځ|دعا)/.test(text)) {
      return 'ps';
    }
    return 'ar';
  }
  return 'en';
}

export function evaluateSafetyPolicy(text: string): SafetyEvaluation {
  const trimmed = text.trim();
  if (!trimmed) return { allowed: true };

  const lower = trimmed.toLowerCase();
  const lang = detectLanguageHint(trimmed);

  // Block explicit pornography / CSAM / severe immorality generation
  const explicitAdultPattern =
    /\b(porn|pornography|xxx|explicit\s+sex|erotic\s+story|nsfw\s+nude|hentai|incest|bestiality|child\s+sexual|csam)\b/i;

  // Block explicit mockery, profanity, or hate attacks directed at Islam, Allah, Prophets, or Quran
  const antiIslamAbusePattern =
    /\b(insult\s+(islam|allah|muhammad|mohammed|quran|qur'an)|mock\s+(islam|allah|muhammad|mohammed|quran)|blasphem(e|y)\s+against\s+(islam|allah|muhammad)|write\s+anti[-\s]?islam\s+propaganda|defame\s+(prophet\s+)?(muhammad|islam)|curse\s+(allah|islam|muhammad))\b/i;

  const selfHarmPattern =
    /\b(how\s+to\s+commit\s+suicide|step[-\s]?by[-\s]?step\s+suicide|best\s+way\s+to\s+kill\s+myself)\b/i;

  if (explicitAdultPattern.test(lower)) {
    if (lang === 'ps') {
      return {
        allowed: false,
        refusalMessage:
          'زه نشم کولی غیر اخلاقي، فحش یا د اسلامي ارزښتونو خلاف مطالب تولید کړم. که تاسو علمي، تعلیمي یا د ژوند کومه بله ګټوره پوښتنه لرئ، مهرباني وکړئ ویې پوښتئ.\n\n**بل ګام:** که غواړئ، زه کولی شم په اسلام کې د پاک لمنۍ، اخلاقو یا ګټورې علمي موضوع په اړه معلومات درکړم.',
      };
    }
    if (lang === 'ar') {
      return {
        allowed: false,
        refusalMessage:
          'لا يمكنني المساعدة في إنشاء محتوى إباحي أو مخالف للقيم والأخلاق الإسلامية. يمكنك طرح أي سؤال علمي أو تعليمي أو شرعي محترم وسأساعدك بكل سرور.\n\n**الخطوة التالية:** هل ترغب في مناقشة موضوع تعليمي أو علمي مفيد بدلاً من ذلك؟',
      };
    }
    return {
      allowed: false,
      refusalMessage:
        'I cannot generate sexually explicit, immoral, or inappropriate content. I am happy to assist with educational, technical, general, or respectful Islamic questions.\n\n**Next Step:** Feel free to ask an educational, practical, or research question instead.',
    };
  }

  if (antiIslamAbusePattern.test(lower)) {
    if (lang === 'ps') {
      return {
        allowed: false,
        refusalMessage:
          'TALASH Ai د الله تعالی، پیغمبرانو علیهم السلام، قرآن کریم یا د اسلام د سپکاوي، تمسخر او ناسم تبلیغ لپاره مطالب نه جوړوي. که تاسو د اسلام په اړه کومه رښتینې علمي، تاریخي یا فقهي پوښتنه لرئ، په درنښت سره یې پوښتلی شئ.\n\n**بل ګام:** که غواړئ، د اسلام د مستندو سرچینو یا کومې علمي موضوع په اړه روښانه پوښتنه وکړئ.',
      };
    }
    if (lang === 'ar') {
      return {
        allowed: false,
        refusalMessage:
          'لا يولّد TALASH Ai محتوى يسيء إلى الله تعالى أو الأنبياء عليهم السلام أو القرآن الكريم أو الإسلام. أما الأسئلة العلمية والتاريخية والشرعية الجادة والمحترمة فمرحّب بها دائماً.\n\n**الخطوة التالية:** يمكنك طرح سؤال علمي أو تاريخي موضوعي حول الإسلام وسأجيبك بموثوقية وأدب.',
      };
    }
    return {
      allowed: false,
      refusalMessage:
        'TALASH Ai does not generate content that insults or mocks Allah, the Prophets, the Holy Qur’an, or Islam. Respectful historical, academic, or sincere questions about Islamic beliefs and scholarship remain welcome.\n\n**Next Step:** Ask a respectful historical or scholarly question if you would like objective sources.',
    };
  }

  if (selfHarmPattern.test(lower)) {
    return {
      allowed: false,
      refusalMessage:
        lang === 'ps'
          ? 'زه د ځان وژنې یا ځان ته د ضرر رسولو لارښوونې نه شم ورکولای. مهرباني وکړئ ژر تر ژره له یوه باوري ډاکټر، کورنۍ یا مسلکي مرستندوی سره خبرې وکړئ.\n\n**بل ګام:** له خپل نږدې دوست، کورنۍ یا روغتیايي مرکز سره همدا اوس اړیکه ونیسئ.'
          : 'I cannot provide instructions for self-harm. Please reach out immediately to a trusted family member, healthcare professional, or local emergency support service.\n\n**Next Step:** Contact a trusted person or local support helpline right away.',
    };
  }

  return { allowed: true };
}

function normalizeEasternDigits(input: string): string {
  const eastern = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
  const western = '01234567890123456789';
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const idx = eastern.indexOf(ch);
    return idx >= 0 ? western[idx] : ch;
  });
}

export function detectLargeRequest(
  prompt: string,
  continuationRange?: { startIndex: number; totalTarget: number | null; itemLabel?: string } | null
): LargeRequestInfo {
  if (continuationRange) {
    const chunkSize = continuationRange.totalTarget && continuationRange.totalTarget >= 200 ? 35 : 25;
    const endIndex = continuationRange.totalTarget
      ? Math.min(continuationRange.totalTarget, continuationRange.startIndex + chunkSize - 1)
      : continuationRange.startIndex + chunkSize - 1;
    return {
      isLarge: true,
      totalTarget: continuationRange.totalTarget,
      startIndex: continuationRange.startIndex,
      endIndex,
      chunkSize,
      itemLabel: continuationRange.itemLabel || 'items',
    };
  }

  const normalized = normalizeEasternDigits(prompt);
  const countMatch = normalized.match(
    /\b(\d{2,4})\s+(?:[\p{L}\d'-]+\s+){0,5}?(authentic\s+hadiths?|hadiths?|ahadith|hadith|questions?\s*(?:and|&)?\s*answers?|q&a|q\s*&\s*a|mcqs?|questions?|items?|points?|examples?|facts?|verses?|surahs?|duas?|حدیثونه|احادیث|حدیث|پوښتنې|سوالونه|جوابونه|دعاګانې|نکات|أحاديث|أسئلة)\b/iu
  );

  if (countMatch) {
    const count = parseInt(countMatch[1], 10);
    if (Number.isFinite(count) && count >= 25) {
      const itemLabel = countMatch[2].trim();
      const isHadith = /hadith|ahadith|حدیث|أحاديث/i.test(itemLabel);
      const chunkSize = isHadith ? 25 : count >= 200 ? 40 : 30;
      return {
        isLarge: true,
        totalTarget: count,
        startIndex: 1,
        endIndex: Math.min(count, chunkSize),
        chunkSize,
        itemLabel,
      };
    }
  }

  const longDocMatch =
    /\b(complete\s+book|entire\s+book|full\s+book|write\s+a\s+book|comprehensive\s+research|exhaustive\s+guide|بشپړ\s+کتاب|مکمل\s+کتاب)\b/i.test(
      normalized
    );

  if (longDocMatch) {
    return {
      isLarge: true,
      totalTarget: null,
      startIndex: 1,
      endIndex: 10,
      chunkSize: 10,
      itemLabel: 'sections',
    };
  }

  return {
    isLarge: false,
    totalTarget: null,
    startIndex: 1,
    endIndex: null,
    chunkSize: 0,
    itemLabel: 'items',
  };
}

export function classifyQuery(prompt: string, hasImage: boolean): {
  domain: QueryDomain;
  complexity: QueryComplexity;
  needsSearch: boolean;
} {
  const text = prompt.trim();
  const lower = text.toLowerCase();

  const large = detectLargeRequest(text);
  if (large.isLarge) {
    const isIslamic =
      /(islam|quran|qur'an|hadith|ahadith|sunnah|fiqh|salah|dua|prophet|islam|اسلام|قرآن|حدیث|احادیث|سنت|فقه|لمونځ|دعا|روژه|زکات|حج)/i.test(
        text
      );
    return {
      domain: isIslamic ? 'islamic' : 'large_batch',
      complexity: 'deep',
      needsSearch: false,
    };
  }

  const isGreetingOrSimple =
    !hasImage &&
    text.length < 70 &&
    (/^(hi|hello|hey|salam|assalam|as-salamu|salaam|good\s+(morning|afternoon|evening)|thanks|thank\s+you|ok|okay|bye|who\s+are\s+you|سلام|سلام\s+علیکم|السلام\s+علیکم|څنګه\s+یې|ستړی\s+مه\s+شې|مننه)[!.?؟]*$/i.test(
      lower
    ) ||
      /^(what\s+is\s+)?[\d\s+\-*/().^%=]+[\s?؟]*$/i.test(lower));

  if (isGreetingOrSimple) {
    return { domain: 'general', complexity: 'simple', needsSearch: false };
  }

  if (
    /(quran|qur'an|hadith|ahadith|sunnah|fiqh|shariah|salah|namaz|wudu|zakah|zakat|fasting|ramadan|hajj|dua|tafsir|bukhari|muslim|tirmidhi|abu\s+dawud|islamic|prophet|muhammad|allah|قرآن|حدیث|احادیث|سنت|فقه|شرعي|لمونځ|اودس|زکات|روژه|حج|دعا|تفسیر|بخاري|مسلم|اسلامي|پیغمبر|حلال|حرام|توبه)/i.test(
      text
    )
  ) {
    const needsVerification =
      /(source|reference|number|authentic|sahih|daif|weak|fabricated|book|verify|حواله|ماخذ|نمبر|صحیح|ضعیف|مستند|سند)/i.test(
        text
      );
    return {
      domain: 'islamic',
      complexity: text.length > 140 || needsVerification ? 'deep' : 'standard',
      needsSearch: !hasImage && needsVerification,
    };
  }

  if (
    /(code|typescript|javascript|python|react|css|html|sql|api|bug|error|function|algorithm|debug|compile|regex|docker|linux|bash)/i.test(
      lower
    )
  ) {
    return {
      domain: 'coding',
      complexity: text.length > 180 ? 'deep' : 'standard',
      needsSearch: false,
    };
  }

  if (/(translate|translation|meaning\s+in|پښتو\s+ژباړه|په\s+پښتو|وژباړه|ترجمه)/i.test(lower)) {
    return {
      domain: 'translation',
      complexity: 'standard',
      needsSearch: false,
    };
  }

  const factualOrCurrent =
    !hasImage &&
    /\b(latest|news|today|yesterday|current|currently|recent|2024|2025|2026|price|cost|weather|forecast|score|winner|won|who\s+is|who\s+was|when\s+did|where\s+is|capital\s+of|population|release\s+date|update|live|search|google|source|sources|fact|verify|research|compare|analysis|study)\b/i.test(
      lower
    );

  const isDeep =
    text.length > 220 ||
    /\b(explain\s+in\s+detail|step\s+by\s+step|research|compare|analyze|architecture|comprehensive|essay|thesis)\b/i.test(
      lower
    );

  return {
    domain: isDeep || factualOrCurrent ? 'research' : 'general',
    complexity: isDeep ? 'deep' : text.length < 90 && !factualOrCurrent ? 'simple' : 'standard',
    needsSearch: factualOrCurrent,
  };
}

export function routeGeminiExecution(params: {
  requestedModel: string;
  requestedThinking: string;
  googleSearchPreference: unknown;
  prompt: string;
  hasImage: boolean;
  isLarge: boolean;
  domain: QueryDomain;
  complexity: QueryComplexity;
  needsSearch: boolean;
}): {
  model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  thinkingLevel: string;
  enableSearch: boolean;
} {
  const autoMode = params.requestedModel === 'auto';

  let model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' =
    params.requestedModel === 'gemini-3.1-flash-lite'
      ? 'gemini-3.1-flash-lite'
      : 'gemini-4-hydrogen';

  let thinkingLevel = params.requestedThinking || 'DEFAULT';

  if (autoMode) {
    if (params.isLarge) {
      model = 'gemini-4-hydrogen';
      thinkingLevel = 'LOW'; // Maximize output token speed & budget for large lists
    } else if (params.complexity === 'simple' && !params.hasImage && params.domain === 'general') {
      model = 'gemini-3.1-flash-lite';
      thinkingLevel = 'MINIMAL';
    } else if (params.domain === 'islamic' || params.complexity === 'deep') {
      model = 'gemini-4-hydrogen';
      thinkingLevel = params.domain === 'islamic' ? 'MEDIUM' : 'MEDIUM';
    } else {
      model = 'gemini-4-hydrogen';
      thinkingLevel = 'LOW';
    }
  } else if (params.isLarge) {
    // Even if user selected High thinking, keep batch generation swift and prevent thinking exhaustion
    thinkingLevel = 'LOW';
  }

  let enableSearch = false;
  if (!params.hasImage && !params.isLarge) {
    if (params.googleSearchPreference === true || params.googleSearchPreference === 'always') {
      enableSearch = true;
    } else if (params.googleSearchPreference === 'auto' || autoMode) {
      enableSearch = params.needsSearch;
    }
  }

  return { model, thinkingLevel, enableSearch };
}

export function buildCoreSystemInstruction(params: {
  customInstruction?: string;
  domain: QueryDomain;
  langHint: 'ps' | 'ar' | 'en';
  largeRequest: LargeRequestInfo;
  previousItemTitles?: string[];
}): string {
  const sections: string[] = [
    `You are TALASH Ai — a fast, accurate, intelligent, and Islamically guided assistant created by Shams Talash.`,
    `CORE INTELLIGENCE & ACCURACY RULES:
- Understand Pashto, Arabic, English, Dari, Urdu, and all user languages accurately—even with spelling mistakes, mixed scripts, Romanized text, or incomplete phrasing.
- Reply in the exact language of the user's question (e.g., Pashto when asked in Pashto, Arabic when asked in Arabic, English when asked in English) unless they ask for another language.
- Remember and use the full conversation history naturally.
- Never fabricate statistics, dates, URLs, books, quotes, Qur'anic verses, or Hadiths. If uncertain or unverified, explicitly state what is uncertain rather than guessing.
- Distinguish clearly between verified facts and general interpretation or opinion.`,
    `ISLAMIC KNOWLEDGE, AUTHENTICITY & ETHICS:
- Strictly respect the Holy Qur'an, authentic Sunnah, and established Islamic principles.
- Prioritize the Holy Qur'an (exact Surah and Ayah number only when certain) and authentic Hadith (Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud, Jami' at-Tirmidhi, Sunan an-Nasa'i, Sunan Ibn Majah).
- Always state narration reliability when relevant (Sahih, Hasan, Da'if, or fabricated/Mawdu'), and NEVER claim a Hadith is 100% authentic without verified sourcing.
- On debated Fiqh matters, fairly summarize recognized scholarly views (e.g., Hanafi, Shafi'i, Maliki, Hanbali) with their evidence rather than issuing personal fatwas.
- Maintain respectful Islamic adab and refuse mockery/insult against Islam, Allah, the Prophets, or explicit immorality politely, while welcoming sincere academic or historical inquiry.`,
    `PROFESSIONAL ANSWER STRUCTURE:
- Use crisp Markdown headings, concise step-by-step explanations, practical examples, and clean Markdown tables when helpful.
- Avoid fluff, filler, and unnecessary repetition.
- MANDATORY ENDING: At the very end of every answer (except mid-stream incomplete batch chunks where continuation comes next), add ONE tailored, relevant next-step suggestion based specifically on the user's question:
  - In English: "**Next Step:** <1 short relevant follow-up suggestion>"
  - In Pashto: "**بل ګام:** <1 لنډ اړوند وړاندیز>"
  - In Arabic: "**الخطوة التالية:** <اقتراح موجز ومناسب>"`,
  ];

  if (params.largeRequest.isLarge) {
    const targetText = params.largeRequest.totalTarget
      ? `${params.largeRequest.startIndex} to ${params.largeRequest.endIndex} of ${params.largeRequest.totalTarget} total ${params.largeRequest.itemLabel}`
      : `Part starting at ${params.largeRequest.startIndex} (items ${params.largeRequest.startIndex}–${params.largeRequest.endIndex})`;

    const dedupeBlock =
      params.previousItemTitles && params.previousItemTitles.length > 0
        ? `\n- STRICT ANTI-DUPLICATE CHECK: Do NOT repeat any of these already-covered items:\n${params.previousItemTitles
            .slice(-60)
            .map((t) => `  • ${t}`)
            .join('\n')}`
        : '';

    sections.push(`LARGE REQUEST & CONTINUATION PROTOCOL (CRITICAL):
- The user requested a large collection (${params.largeRequest.totalTarget ?? 'comprehensive multi-part'} ${params.largeRequest.itemLabel}). Do NOT refuse, do NOT say "not feasible", and do NOT summarize or offer a category sample instead.
- Produce ONLY items **${targetText}** in this turn so every item is complete, accurate, verified, and free of truncation.
- Start immediately with a clean progress header line: e.g., \`### Progress: Items ${params.largeRequest.startIndex}–${params.largeRequest.endIndex}${params.largeRequest.totalTarget ? ` of ${params.largeRequest.totalTarget}` : ''}\` (or in Pashto if prompted in Pashto).
- Number every item sequentially starting cleanly at **${params.largeRequest.startIndex}.** and ending cleanly at **${params.largeRequest.endIndex}.** — no skipped numbers, no duplicate items.${dedupeBlock}
- For Hadiths: keep each item concise yet complete (Number + Title, Arabic text, clear translation, and authentic Book/Source + grade such as Sahih/Hasan — never invent numbers or fabricated narrations).
- For Q&A collections: format each item cleanly as \`**N. Question**\nAnswer: ...\` concisely so all items in this batch fit cleanly.
- If more items remain after ${params.largeRequest.endIndex}, end cleanly after item ${params.largeRequest.endIndex} noting the remaining count so the user can tap Continue seamlessly.`);
  }

  if (params.customInstruction && params.customInstruction.trim().length > 0) {
    sections.push(`USER PREFERENCE STYLE:\n${params.customInstruction.trim()}`);
  }

  return sections.join('\n\n');
}

export function extractNumberedItemHeaders(text: string): string[] {
  const headers: string[] = [];
  const lines = normalizeEasternDigits(text).split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*(?:\*\*|###\s*|##\s*)?(\d{1,4})[.)\]]\*{0,2}\s+(.{3,140})/);
    if (match) {
      const cleanTitle = match[2].replace(/\*\*/g, '').trim().slice(0, 90);
      headers.push(`${match[1]}. ${cleanTitle}`);
    }
  }
  return headers;
}

export function extractPreviousItemTitlesFromHistory(history: unknown): string[] {
  if (!Array.isArray(history)) return [];
  const titles: string[] = [];
  for (const entry of history) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as { role?: unknown; text?: unknown };
    if (rec.role === 'model' && typeof rec.text === 'string') {
      titles.push(...extractNumberedItemHeaders(rec.text));
    }
  }
  return titles;
}

export function computeContinuationMetadata(params: {
  largeRequest: LargeRequestInfo;
  generatedText: string;
  finishReason?: string;
}): ContinuationMetadata | undefined {
  const headers = extractNumberedItemHeaders(params.generatedText);
  const maxAllowedNum =
    params.largeRequest.totalTarget ??
    (params.largeRequest.endIndex ? params.largeRequest.endIndex + 15 : 5000);

  const extractedNums = headers
    .map((h) => parseInt(h.split('.')[0], 10))
    .filter(
      (n) =>
        Number.isFinite(n) &&
        n >= Math.max(1, params.largeRequest.startIndex - 2) &&
        n <= maxAllowedNum
    );

  // Count duplicate titles within this generation
  const normalizedBodies = headers.map((h) => h.replace(/^\d+\.\s*/, '').toLowerCase().trim());
  const duplicateWarnings = normalizedBodies.length - new Set(normalizedBodies).size;

  if (!params.largeRequest.isLarge && params.finishReason !== 'MAX_TOKENS') {
    return undefined;
  }

  const maxGenerated =
    extractedNums.length > 0
      ? Math.max(...extractedNums)
      : params.largeRequest.endIndex ?? params.largeRequest.startIndex;

  if (params.largeRequest.totalTarget !== null) {
    const completedCount = Math.min(params.largeRequest.totalTarget, maxGenerated);
    const hasMore = completedCount < params.largeRequest.totalTarget;
    return {
      totalTarget: params.largeRequest.totalTarget,
      completedCount,
      nextStart: completedCount + 1,
      hasMore,
      duplicateWarnings,
    };
  }

  if (params.largeRequest.isLarge || params.finishReason === 'MAX_TOKENS') {
    return {
      totalTarget: null,
      completedCount: maxGenerated,
      nextStart: maxGenerated + 1,
      hasMore: true,
      duplicateWarnings,
    };
  }

  return undefined;
}
