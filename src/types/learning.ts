export type LearningImageKey =
  | 'hadith'
  | 'authentic_duas'
  | 'leaving_home'
  | 'quran_surahs'
  | 'salah_prayer'
  | 'after_salah'
  | 'taqwa_guidance'
  | 'writings_scroll'
  | 'islamic_knowledge'
  | 'islamic_history'
  | 'islamic_qa';

export type LearningCategoryId =
  | 'hadiths'
  | 'quran_verses'
  | 'islamic_knowledge'
  | 'islamic_history'
  | 'islamic_qa'
  | 'duas'
  | 'daily_duas'
  | 'surahs'
  | 'salah'
  | 'after_salah'
  | 'avoid_sins'
  | 'writings';

export interface LearningCategorySeed {
  id: LearningCategoryId;
  title: string;
  subtitle: string;
  description: string;
  imageKey: LearningImageKey;
  imageAlt: string;
}

export interface LearningCategoryView extends LearningCategorySeed {
  itemCount: number;
}

export interface LearningTopicSeed {
  id: string;
  category: LearningCategoryId;
  numberLabel: string;
  title: string;
  arabic?: string;
  pashtoTranslation?: string;
  narrator?: string;
  authenticityGrade?: string;
  time?: string;
  place?: string;
  virtues?: string;
  details?: string[];
  bodyParagraphs?: string[];
  topicMeta?: string;
  difficulty?: string;
  source: string;
  imageKey: LearningImageKey;
  imageAlt: string;
}

export interface LearningTopicDetail extends LearningTopicSeed {
  prevTopicId?: string | null;
  nextTopicId?: string | null;
}

export interface LearningTopicsPageResponse {
  category: LearningCategoryView;
  items: LearningTopicSeed[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  availableTopics: string[];
  availableDifficulties: string[];
}
