import { mkdirSync } from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type {
  LearningCategoryId,
  LearningCategorySeed,
  LearningCategoryView,
  LearningImageKey,
  LearningTopicDetail,
  LearningTopicSeed,
  LearningTopicsPageResponse,
} from '../types/learning.js';
import { LEARNING_CATEGORIES_SEED, LEARNING_TOPICS_SEED } from './learningSeed.js';

const DB_SCHEMA_VERSION = '2026-11-26-v4';

let dbInstance: DatabaseSync | null = null;

export function resolveDbPath(): string {
  const dataDir = path.resolve(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'talash_learning.db');
}

function ensureLearningSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS learning_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learning_categories (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      description TEXT NOT NULL,
      image_key TEXT NOT NULL,
      image_alt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learning_topics (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      number_label TEXT NOT NULL,
      title TEXT NOT NULL,
      arabic TEXT,
      pashto_translation TEXT,
      narrator TEXT,
      authenticity_grade TEXT,
      time_text TEXT,
      place_text TEXT,
      virtues TEXT,
      details_json TEXT,
      body_paragraphs_json TEXT,
      topic_meta TEXT,
      difficulty TEXT,
      source TEXT NOT NULL,
      image_key TEXT NOT NULL,
      image_alt TEXT NOT NULL,
      search_blob TEXT NOT NULL,
      FOREIGN KEY (category) REFERENCES learning_categories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_learning_topics_category_order
      ON learning_topics (category, sort_order);

    CREATE INDEX IF NOT EXISTS idx_learning_topics_difficulty
      ON learning_topics (category, difficulty);
  `);
}

function ensureLearningSeeded(db: DatabaseSync): void {
  const catCount = db
    .prepare('SELECT COUNT(*) AS cnt FROM learning_categories')
    .get() as { cnt?: number } | undefined;
  if (Number(catCount?.cnt ?? 0) > 0) {
    return;
  }

  db.exec('BEGIN');
  try {
    const insertCat = db.prepare(`
      INSERT OR IGNORE INTO learning_categories
      (id, sort_order, title, subtitle, description, image_key, image_alt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    LEARNING_CATEGORIES_SEED.forEach((cat, idx) => {
      insertCat.run(
        cat.id,
        idx + 1,
        cat.title,
        cat.subtitle,
        cat.description,
        cat.imageKey,
        cat.imageAlt
      );
    });

    const insertTopic = db.prepare(`
      INSERT OR IGNORE INTO learning_topics (
        id, category, sort_order, number_label, title, arabic, pashto_translation,
        narrator, authenticity_grade, time_text, place_text, virtues,
        details_json, body_paragraphs_json, topic_meta, difficulty,
        source, image_key, image_alt, search_blob
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    LEARNING_TOPICS_SEED.forEach((topic, idx) => {
      const searchBlob = [
        topic.numberLabel,
        topic.title,
        topic.arabic ?? '',
        topic.pashtoTranslation ?? '',
        topic.narrator ?? '',
        topic.authenticityGrade ?? '',
        topic.virtues ?? '',
        topic.topicMeta ?? '',
        topic.difficulty ?? '',
        topic.source,
        ...(topic.details ?? []),
        ...(topic.bodyParagraphs ?? []),
      ]
        .join(' ')
        .toLowerCase();

      insertTopic.run(
        topic.id,
        topic.category,
        idx + 1,
        topic.numberLabel,
        topic.title,
        topic.arabic ?? null,
        topic.pashtoTranslation ?? null,
        topic.narrator ?? null,
        topic.authenticityGrade ?? null,
        topic.time ?? null,
        topic.place ?? null,
        topic.virtues ?? null,
        topic.details ? JSON.stringify(topic.details) : null,
        topic.bodyParagraphs ? JSON.stringify(topic.bodyParagraphs) : null,
        topic.topicMeta ?? null,
        topic.difficulty ?? null,
        topic.source,
        topic.imageKey,
        topic.imageAlt,
        searchBlob
      );
    });

    db.prepare(
      `INSERT INTO learning_meta (key, value) VALUES ('seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(DB_SCHEMA_VERSION);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function initLearningDb(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    dbInstance = new DatabaseSync(dbPath);
    ensureLearningSchema(dbInstance);
    ensureLearningSeeded(dbInstance);
  }
  return dbInstance;
}

interface TopicDbRow {
  id: string;
  category: string;
  sort_order: number;
  number_label: string;
  title: string;
  arabic: string | null;
  pashto_translation: string | null;
  narrator: string | null;
  authenticity_grade: string | null;
  time_text: string | null;
  place_text: string | null;
  virtues: string | null;
  details_json: string | null;
  body_paragraphs_json: string | null;
  topic_meta: string | null;
  difficulty: string | null;
  source: string;
  image_key: string;
  image_alt: string;
}

function mapTopicRow(row: TopicDbRow): LearningTopicSeed {
  let details: string[] | undefined;
  let bodyParagraphs: string[] | undefined;

  if (row.details_json) {
    try {
      const parsed = JSON.parse(row.details_json);
      if (Array.isArray(parsed)) details = parsed;
    } catch {
      details = undefined;
    }
  }

  if (row.body_paragraphs_json) {
    try {
      const parsed = JSON.parse(row.body_paragraphs_json);
      if (Array.isArray(parsed)) bodyParagraphs = parsed;
    } catch {
      bodyParagraphs = undefined;
    }
  }

  return {
    id: row.id,
    category: row.category as LearningCategoryId,
    numberLabel: row.number_label,
    title: row.title,
    ...(row.arabic ? { arabic: row.arabic } : {}),
    ...(row.pashto_translation ? { pashtoTranslation: row.pashto_translation } : {}),
    ...(row.narrator ? { narrator: row.narrator } : {}),
    ...(row.authenticity_grade ? { authenticityGrade: row.authenticity_grade } : {}),
    ...(row.time_text ? { time: row.time_text } : {}),
    ...(row.place_text ? { place: row.place_text } : {}),
    ...(row.virtues ? { virtues: row.virtues } : {}),
    ...(details ? { details } : {}),
    ...(bodyParagraphs ? { bodyParagraphs } : {}),
    ...(row.topic_meta ? { topicMeta: row.topic_meta } : {}),
    ...(row.difficulty ? { difficulty: row.difficulty } : {}),
    source: row.source,
    imageKey: row.image_key as LearningImageKey,
    imageAlt: row.image_alt,
  };
}

export function getCategoriesWithCounts(): {
  categories: LearningCategoryView[];
  totalItems: number;
} {
  const db = initLearningDb();
  const rows = db
    .prepare(
      `
      SELECT
        c.id,
        c.title,
        c.subtitle,
        c.description,
        c.image_key,
        c.image_alt,
        COUNT(t.id) AS item_count
      FROM learning_categories c
      LEFT JOIN learning_topics t ON t.category = c.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC
    `
    )
    .all() as Array<{
    id: string;
    title: string;
    subtitle: string;
    description: string;
    image_key: string;
    image_alt: string;
    item_count: number;
  }>;

  const categories: LearningCategoryView[] = rows.map((r) => ({
    id: r.id as LearningCategoryId,
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    imageKey: r.image_key as LearningImageKey,
    imageAlt: r.image_alt,
    itemCount: Number(r.item_count ?? 0),
  }));

  const totalItems = categories.reduce((sum, c) => sum + c.itemCount, 0);
  return { categories, totalItems };
}

export function queryLearningTopics(params: {
  category: string;
  q?: string;
  difficulty?: string;
  topicMeta?: string;
  page?: number;
  limit?: number;
}): LearningTopicsPageResponse | null {
  const db = initLearningDb();

  const catRow = db
    .prepare(
      `
      SELECT
        c.id,
        c.title,
        c.subtitle,
        c.description,
        c.image_key,
        c.image_alt,
        COUNT(t.id) AS item_count
      FROM learning_categories c
      LEFT JOIN learning_topics t ON t.category = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `
    )
    .get(params.category) as
    | {
        id: string;
        title: string;
        subtitle: string;
        description: string;
        image_key: string;
        image_alt: string;
        item_count: number;
      }
    | undefined;

  if (!catRow) {
    return null;
  }

  const safeLimit = Math.min(100, Math.max(1, Math.floor(params.limit ?? 20)));
  const safePage = Math.max(1, Math.floor(params.page ?? 1));

  const whereClauses: string[] = ['category = ?'];
  const bindValues: Array<string | number> = [params.category];

  const cleanQ = params.q?.trim().toLowerCase() ?? '';
  if (cleanQ) {
    whereClauses.push('search_blob LIKE ?');
    bindValues.push(`%${cleanQ}%`);
  }

  const cleanDifficulty = params.difficulty?.trim() ?? '';
  if (cleanDifficulty) {
    whereClauses.push('difficulty = ?');
    bindValues.push(cleanDifficulty);
  }

  const cleanTopicMeta = params.topicMeta?.trim() ?? '';
  if (cleanTopicMeta) {
    whereClauses.push('topic_meta = ?');
    bindValues.push(cleanTopicMeta);
  }

  const whereSql = whereClauses.join(' AND ');

  const countResult = db
    .prepare(`SELECT COUNT(*) AS cnt FROM learning_topics WHERE ${whereSql}`)
    .get(...bindValues) as { cnt?: number } | undefined;

  const totalCount = Number(countResult?.cnt ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / safeLimit));
  const clampedPage = Math.min(safePage, totalPages);
  const offset = (clampedPage - 1) * safeLimit;

  const rows = db
    .prepare(
      `
      SELECT
        id, category, sort_order, number_label, title, arabic, pashto_translation,
        narrator, authenticity_grade, time_text, place_text, virtues,
        details_json, body_paragraphs_json, topic_meta, difficulty,
        source, image_key, image_alt
      FROM learning_topics
      WHERE ${whereSql}
      ORDER BY sort_order ASC
      LIMIT ? OFFSET ?
    `
    )
    .all(...bindValues, safeLimit, offset) as unknown as TopicDbRow[];

  const availableTopicRows = db
    .prepare(
      `
      SELECT DISTINCT topic_meta
      FROM learning_topics
      WHERE category = ? AND topic_meta IS NOT NULL AND topic_meta != ''
      ORDER BY sort_order ASC
    `
    )
    .all(params.category) as Array<{ topic_meta: string }>;

  const availableDiffRows = db
    .prepare(
      `
      SELECT DISTINCT difficulty
      FROM learning_topics
      WHERE category = ? AND difficulty IS NOT NULL AND difficulty != ''
      ORDER BY sort_order ASC
    `
    )
    .all(params.category) as Array<{ difficulty: string }>;

  return {
    category: {
      id: catRow.id as LearningCategoryId,
      title: catRow.title,
      subtitle: catRow.subtitle,
      description: catRow.description,
      imageKey: catRow.image_key as LearningImageKey,
      imageAlt: catRow.image_alt,
      itemCount: Number(catRow.item_count ?? 0),
    },
    items: rows.map(mapTopicRow),
    totalCount,
    page: clampedPage,
    limit: safeLimit,
    totalPages,
    hasMore: clampedPage < totalPages,
    availableTopics: availableTopicRows.map((r) => r.topic_meta),
    availableDifficulties: availableDiffRows.map((r) => r.difficulty),
  };
}

export function getLearningTopicById(id: string): LearningTopicDetail | null {
  const db = initLearningDb();
  const row = db
    .prepare(
      `
      SELECT
        id, category, sort_order, number_label, title, arabic, pashto_translation,
        narrator, authenticity_grade, time_text, place_text, virtues,
        details_json, body_paragraphs_json, topic_meta, difficulty,
        source, image_key, image_alt
      FROM learning_topics
      WHERE id = ?
    `
    )
    .get(id) as unknown as TopicDbRow | undefined;

  if (!row) return null;

  const prevRow = db
    .prepare(
      `
      SELECT id FROM learning_topics
      WHERE category = ? AND sort_order < ?
      ORDER BY sort_order DESC
      LIMIT 1
    `
    )
    .get(row.category, row.sort_order) as { id?: string } | undefined;

  const nextRow = db
    .prepare(
      `
      SELECT id FROM learning_topics
      WHERE category = ? AND sort_order > ?
      ORDER BY sort_order ASC
      LIMIT 1
    `
    )
    .get(row.category, row.sort_order) as { id?: string } | undefined;

  return {
    ...mapTopicRow(row),
    prevTopicId: prevRow?.id ?? null,
    nextTopicId: nextRow?.id ?? null,
  };
}

export function getLearningStats(): {
  totalCategories: number;
  totalItems: number;
  seedVersion: string;
} {
  const { categories, totalItems } = getCategoriesWithCounts();
  return {
    totalCategories: categories.length,
    totalItems,
    seedVersion: DB_SCHEMA_VERSION,
  };
}

// ============================================================================
// Super Admin CMS Operations (SQLite-backed CRUD + Full Export)
// ============================================================================

export function upsertLearningCategory(input: LearningCategorySeed): LearningCategoryView {
  const db = initLearningDb();
  const existing = db
    .prepare('SELECT sort_order FROM learning_categories WHERE id = ?')
    .get(input.id) as { sort_order?: number } | undefined;

  const maxOrderRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM learning_categories')
    .get() as { max_order?: number };

  const sortOrder = existing?.sort_order ?? Number(maxOrderRow?.max_order ?? 0) + 1;

  db.prepare(
    `
    INSERT INTO learning_categories (id, sort_order, title, subtitle, description, image_key, image_alt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      subtitle = excluded.subtitle,
      description = excluded.description,
      image_key = excluded.image_key,
      image_alt = excluded.image_alt
  `
  ).run(
    input.id,
    sortOrder,
    input.title,
    input.subtitle,
    input.description,
    input.imageKey,
    input.imageAlt
  );

  const countRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM learning_topics WHERE category = ?')
    .get(input.id) as { cnt?: number };

  return {
    ...input,
    itemCount: Number(countRow?.cnt ?? 0),
  };
}

export function deleteLearningCategory(categoryId: string): boolean {
  const db = initLearningDb();
  const res = db.prepare('DELETE FROM learning_categories WHERE id = ?').run(categoryId);
  return Number(res.changes ?? 0) > 0;
}

export function upsertLearningTopic(input: LearningTopicSeed): LearningTopicSeed {
  const db = initLearningDb();
  const existing = db
    .prepare('SELECT sort_order FROM learning_topics WHERE id = ?')
    .get(input.id) as { sort_order?: number } | undefined;

  const maxOrderRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM learning_topics')
    .get() as { max_order?: number };

  const sortOrder = existing?.sort_order ?? Number(maxOrderRow?.max_order ?? 0) + 1;

  const searchBlob = [
    input.numberLabel,
    input.title,
    input.arabic ?? '',
    input.pashtoTranslation ?? '',
    input.narrator ?? '',
    input.authenticityGrade ?? '',
    input.time ?? '',
    input.place ?? '',
    input.virtues ?? '',
    input.topicMeta ?? '',
    input.difficulty ?? '',
    input.source,
    ...(input.details ?? []),
    ...(input.bodyParagraphs ?? []),
  ]
    .join(' ')
    .toLowerCase();

  db.prepare(
    `
    INSERT INTO learning_topics (
      id, category, sort_order, number_label, title, arabic, pashto_translation,
      narrator, authenticity_grade, time_text, place_text, virtues,
      details_json, body_paragraphs_json, topic_meta, difficulty,
      source, image_key, image_alt, search_blob
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      category = excluded.category,
      number_label = excluded.number_label,
      title = excluded.title,
      arabic = excluded.arabic,
      pashto_translation = excluded.pashto_translation,
      narrator = excluded.narrator,
      authenticity_grade = excluded.authenticity_grade,
      time_text = excluded.time_text,
      place_text = excluded.place_text,
      virtues = excluded.virtues,
      details_json = excluded.details_json,
      body_paragraphs_json = excluded.body_paragraphs_json,
      topic_meta = excluded.topic_meta,
      difficulty = excluded.difficulty,
      source = excluded.source,
      image_key = excluded.image_key,
      image_alt = excluded.image_alt,
      search_blob = excluded.search_blob
  `
  ).run(
    input.id,
    input.category,
    sortOrder,
    input.numberLabel,
    input.title,
    input.arabic ?? null,
    input.pashtoTranslation ?? null,
    input.narrator ?? null,
    input.authenticityGrade ?? null,
    input.time ?? null,
    input.place ?? null,
    input.virtues ?? null,
    input.details ? JSON.stringify(input.details) : null,
    input.bodyParagraphs ? JSON.stringify(input.bodyParagraphs) : null,
    input.topicMeta ?? null,
    input.difficulty ?? null,
    input.source,
    input.imageKey,
    input.imageAlt,
    searchBlob
  );

  return input;
}

export function deleteLearningTopic(topicId: string): boolean {
  const db = initLearningDb();
  const res = db.prepare('DELETE FROM learning_topics WHERE id = ?').run(topicId);
  return Number(res.changes ?? 0) > 0;
}

export function exportLearningDatabase(): {
  exportedAt: string;
  schemaVersion: string;
  categories: LearningCategoryView[];
  topics: LearningTopicSeed[];
} {
  const db = initLearningDb();
  const { categories } = getCategoriesWithCounts();
  const topicRows = db
    .prepare(
      `
      SELECT
        id, category, sort_order, number_label, title, arabic, pashto_translation,
        narrator, authenticity_grade, time_text, place_text, virtues,
        details_json, body_paragraphs_json, topic_meta, difficulty,
        source, image_key, image_alt
      FROM learning_topics
      ORDER BY sort_order ASC
    `
    )
    .all() as unknown as TopicDbRow[];

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: DB_SCHEMA_VERSION,
    categories,
    topics: topicRows.map(mapTopicRow),
  };
}
