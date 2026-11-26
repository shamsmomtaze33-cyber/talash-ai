import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  MapPin,
  MessageSquare,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  LearningCategoryId,
  LearningCategoryView,
  LearningTopicDetail,
  LearningTopicSeed,
  LearningTopicsPageResponse,
} from '../types/learning';
import { resolveLearningImage } from '../utils/learningMedia';

interface LearningViewProps {
  onAskInChat?: (prompt: string) => void;
}

const PAGE_LIMIT = 20;

function TopicMediaFrame({
  src,
  alt,
  className = 'w-full h-44',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        className={`${className} bg-gradient-to-br from-zinc-100 via-zinc-50 to-emerald-50/60 flex flex-col items-center justify-center gap-2 text-zinc-500`}
      >
        <BookOpen className="w-6 h-6 text-[#10a37f]" />
        <span className="text-xs font-medium px-4 text-center line-clamp-1">{alt}</span>
      </div>
    );
  }

  return (
    <div className={`${className} bg-zinc-100 overflow-hidden relative`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

export function LearningView({ onAskInChat }: LearningViewProps) {
  const [categories, setCategories] = useState<LearningCategoryView[]>([]);
  const [totalLibraryItems, setTotalLibraryItems] = useState<number>(0);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [hubSearch, setHubSearch] = useState('');

  // Dedicated Category Page state
  const [activeCategoryId, setActiveCategoryId] = useState<LearningCategoryId | null>(null);
  const [categoryPageData, setCategoryPageData] = useState<LearningTopicsPageResponse | null>(null);
  const [categoryItems, setCategoryItems] = useState<LearningTopicSeed[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedTopicMeta, setSelectedTopicMeta] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  // Dedicated Item Reader Page state
  const [selectedTopic, setSelectedTopic] = useState<LearningTopicDetail | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const topicsAbortRef = useRef<AbortController | null>(null);

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const res = await fetch('/api/learning/categories');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        categories?: LearningCategoryView[];
        totalItems?: number;
      };
      setCategories(Array.isArray(data.categories) ? data.categories : []);
      setTotalLibraryItems(Number(data.totalItems ?? 0));
    } catch {
      setCategoriesError('د زده‌کړو د کټګوریو په راوړلو کې ستونزه رامنځته شوه. مهرباني وکړئ بیا هڅه وکړئ.');
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  // Debounce category search input
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(categorySearch.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [categorySearch]);

  const fetchCategoryTopics = useCallback(
    async (params: {
      categoryId: LearningCategoryId;
      page: number;
      append: boolean;
      q: string;
      difficulty: string;
      topicMeta: string;
    }) => {
      if (topicsAbortRef.current) {
        topicsAbortRef.current.abort();
      }
      const controller = new AbortController();
      topicsAbortRef.current = controller;

      if (params.append) {
        setLoadingMore(true);
      } else {
        setTopicsLoading(true);
      }
      setTopicsError(null);

      try {
        const searchParams = new URLSearchParams({
          category: params.categoryId,
          page: String(params.page),
          limit: String(PAGE_LIMIT),
        });
        if (params.q) searchParams.set('q', params.q);
        if (params.difficulty) searchParams.set('difficulty', params.difficulty);
        if (params.topicMeta) searchParams.set('topicMeta', params.topicMeta);

        const res = await fetch(`/api/learning/topics?${searchParams.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const payload = (await res.json()) as LearningTopicsPageResponse;
        setCategoryPageData(payload);
        setCurrentPage(payload.page);
        setCategoryItems((prev) =>
          params.append ? [...prev, ...payload.items] : payload.items
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setTopicsError('د دې کټګورۍ د مطالبو په راوړلو کې ستونزه وه.');
      } finally {
        if (topicsAbortRef.current === controller) {
          topicsAbortRef.current = null;
        }
        setTopicsLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Refetch category page whenever category, search, or filters change
  useEffect(() => {
    if (!activeCategoryId) return;
    void fetchCategoryTopics({
      categoryId: activeCategoryId,
      page: 1,
      append: false,
      q: debouncedSearch,
      difficulty: selectedDifficulty,
      topicMeta: selectedTopicMeta,
    });
  }, [activeCategoryId, debouncedSearch, fetchCategoryTopics, selectedDifficulty, selectedTopicMeta]);

  const openCategoryPage = (categoryId: LearningCategoryId) => {
    setActiveCategoryId(categoryId);
    setSelectedTopic(null);
    setCategorySearch('');
    setDebouncedSearch('');
    setSelectedDifficulty('');
    setSelectedTopicMeta('');
    setCategoryItems([]);
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const returnToHub = () => {
    setActiveCategoryId(null);
    setSelectedTopic(null);
    setCategoryPageData(null);
    setCategoryItems([]);
    setCategorySearch('');
    setDebouncedSearch('');
    setSelectedDifficulty('');
    setSelectedTopicMeta('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openTopicPage = async (topicId: string) => {
    setTopicLoading(true);
    try {
      const res = await fetch(`/api/learning/topics/${encodeURIComponent(topicId)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { topic: LearningTopicDetail };
      setSelectedTopic(data.topic);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      const localMatch = categoryItems.find((item) => item.id === topicId);
      if (localMatch) {
        const idx = categoryItems.findIndex((item) => item.id === topicId);
        setSelectedTopic({
          ...localMatch,
          prevTopicId: idx > 0 ? categoryItems[idx - 1].id : null,
          nextTopicId:
            idx >= 0 && idx < categoryItems.length - 1 ? categoryItems[idx + 1].id : null,
        });
      }
    } finally {
      setTopicLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (!activeCategoryId || !categoryPageData?.hasMore || loadingMore) return;
    void fetchCategoryTopics({
      categoryId: activeCategoryId,
      page: currentPage + 1,
      append: true,
      q: debouncedSearch,
      difficulty: selectedDifficulty,
      topicMeta: selectedTopicMeta,
    });
  };

  const visibleHubCategories = useMemo(() => {
    const q = hubSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) =>
      `${c.title} ${c.subtitle} ${c.description}`.toLowerCase().includes(q)
    );
  }, [categories, hubSearch]);

  const activeCategoryMeta = useMemo(
    () =>
      categoryPageData?.category ??
      categories.find((c) => c.id === activeCategoryId) ??
      null,
    [activeCategoryId, categories, categoryPageData]
  );

  const handleCopyTopic = async (topic: LearningTopicSeed) => {
    const parts = [
      topic.title,
      topic.arabic ?? '',
      topic.pashtoTranslation ? `ژباړه: ${topic.pashtoTranslation}` : '',
      topic.authenticityGrade ? `درجه: ${topic.authenticityGrade}` : '',
      topic.time ? `وخت: ${topic.time}` : '',
      topic.place ? `ځای: ${topic.place}` : '',
      topic.details && topic.details.length > 0 ? topic.details.join('\n') : '',
      topic.bodyParagraphs && topic.bodyParagraphs.length > 0
        ? topic.bodyParagraphs.join('\n\n')
        : '',
      topic.virtues ? `فضیلت: ${topic.virtues}` : '',
      `ماخذ: ${topic.source}`,
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(parts.join('\n\n'));
      setCopiedId(topic.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <main
      dir="rtl"
      lang="ps"
      className="flex-1 max-w-[1280px] w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6 text-right"
    >
      {/* STEP 3: DEDICATED TOPIC READER PAGE */}
      {selectedTopic && activeCategoryMeta ? (
        <section aria-label={selectedTopic.title} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#f8f9fa] border border-zinc-200/85 rounded-2xl px-3.5 sm:px-4 py-2.5">
            <button
              type="button"
              onClick={() => setSelectedTopic(null)}
              className="inline-flex items-center gap-2 px-3.5 min-h-[40px] text-xs font-semibold text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-200/90 rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowRight className="w-4 h-4 text-[#10a37f]" />
              <span>بېرته «{activeCategoryMeta.title}» ته</span>
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500">
              <span className="font-semibold text-zinc-700">{activeCategoryMeta.title}</span>
              <span aria-hidden="true">/</span>
              <span className="text-[#10a37f] font-semibold tabular-nums">
                {selectedTopic.numberLabel}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!selectedTopic.prevTopicId || topicLoading}
                onClick={() => {
                  if (selectedTopic.prevTopicId) {
                    void openTopicPage(selectedTopic.prevTopicId);
                  }
                }}
                className="inline-flex items-center gap-1 px-3 min-h-[40px] text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-200/90 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
                <span>مخکینی</span>
              </button>
              <button
                type="button"
                disabled={!selectedTopic.nextTopicId || topicLoading}
                onClick={() => {
                  if (selectedTopic.nextTopicId) {
                    void openTopicPage(selectedTopic.nextTopicId);
                  }
                }}
                className="inline-flex items-center gap-1 px-3 min-h-[40px] text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-200/90 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <span>راتلونکی</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          <article className="max-w-3xl mx-auto bg-white border border-zinc-200/90 rounded-3xl shadow-[0_6px_24px_rgba(0,0,0,0.04)] p-4 sm:p-8 space-y-5 sm:space-y-6">
            <header className="space-y-2 pb-4 border-b border-zinc-200/75">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-500 tabular-nums">
                <span className="font-semibold text-[#10a37f]">{selectedTopic.numberLabel}</span>
                {selectedTopic.authenticityGrade && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>{selectedTopic.authenticityGrade}</span>
                    </span>
                  </>
                )}
                {selectedTopic.difficulty && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-zinc-700">
                      کچه: {selectedTopic.difficulty}
                    </span>
                  </>
                )}
                {selectedTopic.topicMeta && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-zinc-600">{selectedTopic.topicMeta}</span>
                  </>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 leading-snug">
                {selectedTopic.title}
              </h2>
              <p className="text-xs text-zinc-500">ماخذ: {selectedTopic.source}</p>
            </header>

            {selectedTopic.arabic && (
              <div className="py-4 px-4 sm:px-6 rounded-2xl bg-[#f8f9fa] border border-zinc-200/80">
                <p
                  dir="rtl"
                  lang="ar"
                  className="text-lg sm:text-xl leading-[2.05] font-semibold text-zinc-900 text-center"
                >
                  {selectedTopic.arabic}
                </p>
              </div>
            )}

            {selectedTopic.pashtoTranslation && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-500">پښتو ژباړه او تشریح</p>
                <p className="text-[15.5px] sm:text-base text-zinc-800 leading-[1.8]">
                  {selectedTopic.pashtoTranslation}
                </p>
              </div>
            )}

            {/* Compact Centered Image Inside Topic Content */}
            <figure className="my-2 flex flex-col items-center space-y-2">
              <TopicMediaFrame
                src={resolveLearningImage(selectedTopic.imageKey)}
                alt={selectedTopic.imageAlt}
                className="w-full max-w-[330px] sm:max-w-[380px] h-40 sm:h-48 rounded-2xl border border-zinc-200/85 shadow-xs"
              />
              <figcaption className="text-[11px] text-zinc-500 text-center">
                {selectedTopic.imageAlt}
              </figcaption>
            </figure>

            {(selectedTopic.time || selectedTopic.place) && (
              <div className="pt-4 border-t border-zinc-200/70 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs sm:text-sm">
                {selectedTopic.time && (
                  <div className="p-3.5 rounded-2xl bg-[#fafafa] border border-zinc-200/75 space-y-1">
                    <div className="inline-flex items-center gap-1.5 font-semibold text-zinc-900">
                      <Clock className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
                      <span>وخت</span>
                    </div>
                    <p className="text-zinc-600 leading-relaxed">{selectedTopic.time}</p>
                  </div>
                )}
                {selectedTopic.place && (
                  <div className="p-3.5 rounded-2xl bg-[#fafafa] border border-zinc-200/75 space-y-1">
                    <div className="inline-flex items-center gap-1.5 font-semibold text-zinc-900">
                      <MapPin className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
                      <span>ځای او موقع</span>
                    </div>
                    <p className="text-zinc-600 leading-relaxed">{selectedTopic.place}</p>
                  </div>
                )}
              </div>
            )}

            {selectedTopic.details && selectedTopic.details.length > 0 && (
              <div className="pt-4 border-t border-zinc-200/70 space-y-2.5">
                <p className="text-xs font-semibold text-zinc-500">بشپړ تفصیل او احکام</p>
                <ul className="space-y-2.5 text-[15px] text-zinc-800 leading-[1.75]">
                  {selectedTopic.details.map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10a37f] mt-2.5 shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedTopic.bodyParagraphs && selectedTopic.bodyParagraphs.length > 0 && (
              <div className="pt-4 border-t border-zinc-200/70 space-y-3 text-[15.5px] text-zinc-700 leading-[1.8]">
                {selectedTopic.bodyParagraphs.map((para) => (
                  <p key={para.slice(0, 40)}>{para}</p>
                ))}
              </div>
            )}

            {selectedTopic.virtues && (
              <div className="pt-4 border-t border-zinc-200/70 space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                  <Sparkles className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
                  <span>فضیلت او ګټې</span>
                </div>
                <p className="text-[14.5px] text-zinc-600 leading-[1.75]">{selectedTopic.virtues}</p>
              </div>
            )}

            <footer className="pt-4 border-t border-zinc-200/80 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void handleCopyTopic(selectedTopic)}
                className="inline-flex items-center gap-1.5 px-4 min-h-[42px] text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200/75 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedId === selectedTopic.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">کاپي شو</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>کاپي کول</span>
                  </>
                )}
              </button>

              {onAskInChat && (
                <button
                  type="button"
                  onClick={() =>
                    onAskInChat(
                      `په پښتو ژبه کې د «${selectedTopic.title}» په اړه لنډه او مستنده شرعي تشریح راکړه.`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 min-h-[42px] text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#10a37f]" />
                  <span>نور وضاحت په چیټ کې</span>
                </button>
              )}
            </footer>
          </article>
        </section>
      ) : activeCategoryId && activeCategoryMeta ? (
        /* STEP 2: DEDICATED CATEGORY PAGE */
        <section aria-label={activeCategoryMeta.title} className="space-y-5">
          {/* Category Top Navigation & Live Count */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f8f9fa] border border-zinc-200/85 rounded-2xl px-3.5 sm:px-4 py-2.5">
            <button
              type="button"
              onClick={returnToHub}
              className="inline-flex items-center gap-2 px-3.5 min-h-[40px] text-xs font-semibold text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-200/90 rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowRight className="w-4 h-4 text-[#10a37f]" />
              <span>ټولو کټګوریو ته بېرته</span>
            </button>

            <div className="flex items-center gap-2 text-xs text-zinc-600 tabular-nums">
              <span className="font-semibold text-zinc-900">
                {categoryPageData?.totalCount ?? activeCategoryMeta.itemCount} مستند مطالب
              </span>
              {categoryItems.length > 0 && categoryPageData && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    ښودل شوي: {categoryItems.length} / {categoryPageData.totalCount}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Dedicated Category Banner */}
          <div className="rounded-2xl border border-zinc-200/90 bg-white overflow-hidden flex flex-col sm:flex-row items-stretch shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            <div className="sm:w-52 shrink-0 min-h-[140px]">
              <TopicMediaFrame
                src={resolveLearningImage(activeCategoryMeta.imageKey)}
                alt={activeCategoryMeta.imageAlt}
                className="w-full h-full min-h-[140px]"
              />
            </div>
            <div className="p-4 sm:p-6 flex flex-col justify-center space-y-2 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 tabular-nums">
                <span className="font-semibold text-[#10a37f]">{activeCategoryMeta.subtitle}</span>
                <span aria-hidden="true">·</span>
                <span>په ډېټابېس کې {activeCategoryMeta.itemCount} ثبت شوي موارد</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">
                {activeCategoryMeta.title}
              </h1>
              <p className="text-sm text-zinc-600 leading-relaxed max-w-2xl">
                {activeCategoryMeta.description}
              </p>
            </div>
          </div>

          {/* Search & Dynamic Filters Inside Category */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder={`د «${activeCategoryMeta.title}» په منځ کې لټون...`}
                className="w-full pr-10 pl-4 min-h-[42px] text-sm bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 transition-colors"
              />
            </div>

            {(categoryPageData?.availableDifficulties?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDifficulty('')}
                  className={`px-3 min-h-[38px] text-xs font-medium rounded-xl border transition-colors cursor-pointer ${
                    selectedDifficulty === ''
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  ټولې کچې
                </button>
                {categoryPageData?.availableDifficulties.map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setSelectedDifficulty(diff)}
                    className={`px-3 min-h-[38px] text-xs font-medium rounded-xl border transition-colors cursor-pointer ${
                      selectedDifficulty === diff
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            )}

            {(categoryPageData?.availableTopics?.length ?? 0) > 1 &&
              !(categoryPageData?.availableDifficulties?.length ?? 0) && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedTopicMeta('')}
                    className={`px-3 min-h-[38px] text-xs font-medium rounded-xl border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      selectedTopicMeta === ''
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    ټول موضوعات
                  </button>
                  {categoryPageData?.availableTopics.slice(0, 6).map((tm) => (
                    <button
                      key={tm}
                      type="button"
                      onClick={() => setSelectedTopicMeta(tm)}
                      className={`px-3 min-h-[38px] text-xs font-medium rounded-xl border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        selectedTopicMeta === tm
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                      }`}
                    >
                      {tm}
                    </button>
                  ))}
                </div>
              )}
          </div>

          {/* Topics Grid */}
          {topicsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-36 rounded-2xl border border-zinc-200/80 bg-zinc-50 animate-pulse"
                />
              ))}
            </div>
          ) : topicsError ? (
            <div className="p-8 text-center rounded-2xl border border-red-200 bg-red-50/60 space-y-3">
              <p className="text-sm font-semibold text-red-900">{topicsError}</p>
              <button
                type="button"
                onClick={() =>
                  void fetchCategoryTopics({
                    categoryId: activeCategoryId,
                    page: 1,
                    append: false,
                    q: debouncedSearch,
                    difficulty: selectedDifficulty,
                    topicMeta: selectedTopicMeta,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 min-h-[40px] text-xs font-semibold text-white bg-zinc-900 rounded-xl cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>بیا هڅه وکړئ</span>
              </button>
            </div>
          ) : categoryItems.length === 0 ? (
            <div className="py-12 px-6 text-center rounded-2xl border border-zinc-200 bg-white space-y-2">
              <p className="text-sm font-semibold text-zinc-900">کوم مطلب ونه موندل شو</p>
              <p className="text-xs text-zinc-500">
                د لټون کلمه یا فلټر بدل کړئ او بیا وګورئ.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {categoryItems.map((topic) => {
                  const previewText =
                    topic.pashtoTranslation ||
                    topic.details?.[0] ||
                    topic.bodyParagraphs?.[0] ||
                    topic.virtues ||
                    '';

                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => void openTopicPage(topic.id)}
                      className="group text-right bg-white border border-zinc-200/90 hover:border-zinc-900 rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.02)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition-all flex items-start gap-3.5 cursor-pointer"
                    >
                      <TopicMediaFrame
                        src={resolveLearningImage(topic.imageKey)}
                        alt={topic.imageAlt}
                        className="w-16 h-16 rounded-xl border border-zinc-200/75 shrink-0"
                      />

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 tabular-nums">
                          <span className="font-semibold text-[#10a37f] truncate">
                            {topic.numberLabel}
                          </span>
                          <span className="inline-flex items-center gap-1 text-zinc-400 group-hover:text-zinc-900 transition-colors shrink-0">
                            <span>لوستل</span>
                            <ArrowLeft className="w-3 h-3" />
                          </span>
                        </div>

                        <h3 className="text-[14.5px] font-bold text-zinc-900 leading-snug line-clamp-2">
                          {topic.title}
                        </h3>

                        {previewText && (
                          <p className="text-xs text-zinc-600 leading-relaxed line-clamp-2">
                            {previewText}
                          </p>
                        )}

                        <p className="text-[11px] text-zinc-400 truncate pt-0.5">
                          {topic.authenticityGrade
                            ? `${topic.authenticityGrade} · ${topic.source}`
                            : topic.difficulty
                            ? `${topic.difficulty} · ${topic.source}`
                            : topic.source}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Load More Pagination Controls */}
              {categoryPageData && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-zinc-200/70">
                  <p className="text-xs text-zinc-500 tabular-nums">
                    له {categoryPageData.totalCount} مطالبو څخه {categoryItems.length} ښودل شوي دي
                  </p>

                  {categoryPageData.hasMore && (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#10a37f]" />
                          <span>نور مطالب راوړل کېږي...</span>
                        </>
                      ) : (
                        <span>
                          نور ۲۰ مطالب وګورئ ({categoryPageData.totalCount - categoryItems.length}{' '}
                          پاتې)
                        </span>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        /* STEP 1: LEARNING CATEGORIES HUB */
        <>
          <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-zinc-200/80">
            <div className="space-y-1.5 max-w-2xl">
              <p className="text-xs font-semibold text-[#10a37f] tabular-nums">
                مستند اسلامي ډېټابېس · {categories.length} کټګورۍ · {totalLibraryItems} کره مطالب
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight text-balance">
                د اسلامي زده‌کړو، قرآن، حدیث او تاریخ مرکز
              </h1>
              <p className="text-sm text-zinc-600 leading-relaxed">
                خپله د خوښې کټګوري وټاکئ ترڅو د هماغې برخې بشپړ مخ، کره سرچینې، لټون او تفصیلي درسونه درته پرانیستل شي.
              </p>
            </div>

            <div className="w-full md:w-80 relative shrink-0">
              <Search className="w-4 h-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={hubSearch}
                onChange={(e) => setHubSearch(e.target.value)}
                placeholder="د کټګوریو په منځ کې لټون..."
                className="w-full pr-10 pl-4 min-h-[42px] text-sm bg-[#f8f9fa] border border-zinc-200 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 transition-colors"
              />
            </div>
          </section>

          {categoriesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-56 rounded-2xl border border-zinc-200/80 bg-zinc-50 animate-pulse"
                />
              ))}
            </div>
          ) : categoriesError ? (
            <div className="p-8 text-center rounded-2xl border border-red-200 bg-red-50/60 space-y-3">
              <p className="text-sm font-semibold text-red-900">{categoriesError}</p>
              <button
                type="button"
                onClick={() => void fetchCategories()}
                className="inline-flex items-center gap-1.5 px-4 min-h-[42px] text-xs font-semibold text-white bg-zinc-900 rounded-xl cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>بیا هڅه وکړئ</span>
              </button>
            </div>
          ) : (
            <section
              aria-label="د زده‌کړو ټولې کټګورۍ"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {visibleHubCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => openCategoryPage(category.id)}
                  className="group text-right rounded-2xl border border-zinc-200/90 hover:border-zinc-900 bg-white overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.03)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.07)] transition-all flex flex-col cursor-pointer"
                >
                  <div className="w-full h-36 overflow-hidden bg-zinc-100 relative">
                    <img
                      src={resolveLearningImage(category.imageKey)}
                      alt={category.imageAlt}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                        <span className="font-semibold text-[#10a37f]">{category.subtitle}</span>
                        <span className="font-semibold text-zinc-700">
                          {category.itemCount} مطالب
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-zinc-900 leading-snug">
                        {category.title}
                      </h2>
                      <p className="text-xs sm:text-[13px] text-zinc-600 leading-relaxed line-clamp-2">
                        {category.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs font-semibold text-zinc-800">
                      <span>د کټګورۍ پرانیستل</span>
                      <ArrowLeft className="w-4 h-4 text-[#10a37f] group-hover:-translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
