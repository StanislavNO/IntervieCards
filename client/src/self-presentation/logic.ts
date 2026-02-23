import type { AuthUser } from '../types';
import { LIBRARY_BLOCKS, WATER_WORDS, renderBlockText } from './templates';
import type {
  JobStory,
  QualityCheckResult,
  SelfPresentationBuilderData,
  SelfPresentationSettings,
  StoryBlock,
  StoryBlockType,
  StoryDuration,
  StoryTargetLevel
} from './types';

export const SELF_PRESENTATION_STORAGE_KEY = 'unityprep-self-presentation-builder-v1';

const BASE_REQUIRED_BLOCKS: StoryBlockType[] = ['greeting', 'workExperience', 'reasonForSearch', 'targetRoleOutro'];

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 11)}`;
}

export function createEmptyJob(): JobStory {
  return {
    id: randomId(),
    company: '',
    project: '',
    genrePlatform: '',
    mechanicsSummary: '',
    responsibilities: [''],
    achievements: ['']
  };
}

export function createJobBlocks(jobId: string): StoryBlock[] {
  return [
    { id: randomId(), type: 'workExperience', enabled: true, order: 0, jobId },
    { id: randomId(), type: 'responsibilities', enabled: true, order: 0, jobId },
    { id: randomId(), type: 'achievements', enabled: true, order: 0, jobId }
  ];
}

function createBaseBlocks(): StoryBlock[] {
  return [
    { id: randomId(), type: 'greeting', enabled: true, order: 0 },
    { id: randomId(), type: 'reasonForSearch', enabled: true, order: 0 },
    { id: randomId(), type: 'targetRoleOutro', enabled: true, order: 0 }
  ];
}

export function withOrderedBlocks(blocks: StoryBlock[]): StoryBlock[] {
  return blocks.map((block, index) => ({ ...block, order: index }));
}

function resolveName(user?: AuthUser | null): string {
  if (!user) {
    return '';
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (fullName) {
    return fullName;
  }

  if (user.username) {
    return user.username;
  }

  return '';
}

export function createInitialBuilderData(user?: AuthUser | null): SelfPresentationBuilderData {
  const firstJob = createEmptyJob();
  const baseBlocks = createBaseBlocks();
  const greetingBlock = baseBlocks.find((block) => block.type === 'greeting');
  const reasonBlock = baseBlocks.find((block) => block.type === 'reasonForSearch');
  const outroBlock = baseBlocks.find((block) => block.type === 'targetRoleOutro');

  const orderedInitialBlocks: StoryBlock[] = [
    ...(greetingBlock ? [greetingBlock] : []),
    ...createJobBlocks(firstJob.id),
    ...(reasonBlock ? [reasonBlock] : []),
    ...(outroBlock ? [outroBlock] : [])
  ];

  const storyBlocks = withOrderedBlocks(orderedInitialBlocks);

  return {
    schemaVersion: 1,
    profile: {
      name: resolveName(user),
      yearsOfExperience: '',
      reasonForSearch: '',
      targetRoleOutro: '',
      targetLevel: 'Middle'
    },
    jobs: [firstJob],
    storyBlocks,
    settings: {
      duration: 90
    },
    updatedAt: new Date().toISOString()
  };
}

export function normalizeBuilderData(raw: unknown, fallbackUser?: AuthUser | null): SelfPresentationBuilderData {
  if (!raw || typeof raw !== 'object') {
    return createInitialBuilderData(fallbackUser);
  }

  const candidate = raw as Partial<SelfPresentationBuilderData>;
  if (candidate.schemaVersion !== 1) {
    return createInitialBuilderData(fallbackUser);
  }

  const profile = candidate.profile;
  const jobs = Array.isArray(candidate.jobs)
    ? candidate.jobs
        .filter((item): item is JobStory => Boolean(item && typeof item === 'object' && typeof (item as JobStory).id === 'string'))
        .map((job) => ({
          id: job.id,
          company: job.company ?? '',
          project: job.project ?? '',
          genrePlatform: job.genrePlatform ?? '',
          mechanicsSummary: job.mechanicsSummary ?? '',
          responsibilities: Array.isArray(job.responsibilities) && job.responsibilities.length > 0 ? job.responsibilities : [''],
          achievements: Array.isArray(job.achievements) && job.achievements.length > 0 ? job.achievements : ['']
        }))
    : [];

  const storyBlocks = Array.isArray(candidate.storyBlocks)
    ? candidate.storyBlocks
        .filter((item): item is StoryBlock => Boolean(item && typeof item === 'object' && typeof (item as StoryBlock).id === 'string'))
        .map((block, index) => ({
          id: block.id,
          type: block.type,
          enabled: Boolean(block.enabled),
          order: Number.isFinite(block.order) ? Number(block.order) : index,
          jobId: block.jobId
        }))
    : [];

  const normalized = createInitialBuilderData(fallbackUser);

  normalized.profile = {
    name: typeof profile?.name === 'string' ? profile.name : resolveName(fallbackUser),
    yearsOfExperience: typeof profile?.yearsOfExperience === 'string' ? profile.yearsOfExperience : '',
    reasonForSearch: typeof profile?.reasonForSearch === 'string' ? profile.reasonForSearch : '',
    targetRoleOutro: typeof profile?.targetRoleOutro === 'string' ? profile.targetRoleOutro : '',
    targetLevel: (profile?.targetLevel as StoryTargetLevel) === 'Junior' || (profile?.targetLevel as StoryTargetLevel) === 'Senior' ? (profile?.targetLevel as StoryTargetLevel) : 'Middle'
  };

  normalized.jobs = jobs.length > 0 ? jobs : normalized.jobs;
  normalized.storyBlocks = withOrderedBlocks(storyBlocks.length > 0 ? storyBlocks : normalized.storyBlocks);

  const duration = candidate.settings?.duration;
  normalized.settings = {
    duration: duration === 60 || duration === 120 ? duration : 90
  };

  normalized.updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString();

  return normalized;
}

export function loadBuilderData(user?: AuthUser | null): SelfPresentationBuilderData {
  try {
    const raw = localStorage.getItem(SELF_PRESENTATION_STORAGE_KEY);
    if (!raw) {
      return createInitialBuilderData(user);
    }
    return normalizeBuilderData(JSON.parse(raw), user);
  } catch {
    return createInitialBuilderData(user);
  }
}

export function saveBuilderData(value: SelfPresentationBuilderData): void {
  const payload: SelfPresentationBuilderData = {
    ...value,
    storyBlocks: withOrderedBlocks(value.storyBlocks),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(SELF_PRESENTATION_STORAGE_KEY, JSON.stringify(payload));
}

export function buildPreviewText(data: SelfPresentationBuilderData): string {
  const jobsById = Object.fromEntries(data.jobs.map((job) => [job.id, job]));
  const segments = withOrderedBlocks(data.storyBlocks)
    .filter((block) => block.enabled)
    .map((block) => renderBlockText(block.type, { profile: data.profile, jobsById }, block.jobId))
    .filter((segment) => segment.trim().length > 0);

  return segments.join('\n\n');
}

export function estimateSpeakingSeconds(wordCount: number): number {
  if (wordCount <= 0) {
    return 0;
  }
  const wordsPerSecond = 2.1;
  return Math.round(wordCount / wordsPerSecond);
}

function hasMetrics(text: string): boolean {
  return /(\d+\s?%|\d+[\d\s.,]*)/.test(text);
}

function detectWaterWords(text: string): string[] {
  const normalized = text.toLowerCase();
  return WATER_WORDS.filter((word) => normalized.includes(word));
}

function countAchievements(data: SelfPresentationBuilderData): number {
  return data.jobs.reduce((total, job) => total + job.achievements.filter((item) => item.trim().length > 0).length, 0);
}

export function evaluateQuality(data: SelfPresentationBuilderData, previewText: string): QualityCheckResult {
  const enabledBlocks = withOrderedBlocks(data.storyBlocks).filter((block) => block.enabled);
  const enabledTypes = new Set(enabledBlocks.map((block) => block.type));
  const requiredPresent = BASE_REQUIRED_BLOCKS.every((type) => enabledTypes.has(type));

  const achievementCount = countAchievements(data);
  const hasEnoughAchievements = achievementCount >= 2;
  const metricsPresent = hasMetrics(previewText);
  const stackSizeOk = enabledBlocks.length >= 5;

  const wordCount = previewText
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean).length;
  const estimatedSeconds = estimateSpeakingSeconds(wordCount);

  const target = data.settings.duration;
  const withinDuration = estimatedSeconds >= Math.round(target * 0.8) && estimatedSeconds <= Math.round(target * 1.15);

  const waterWords = detectWaterWords(previewText);
  const cleanLanguage = waterWords.length === 0;

  const checks = [
    { label: 'Есть обязательные блоки', passed: requiredPresent, weight: 25 },
    { label: 'Добавлено минимум 2 достижения', passed: hasEnoughAchievements, weight: 20 },
    { label: 'Есть метрики и цифры', passed: metricsPresent, weight: 15 },
    { label: 'Стек содержит 5+ блоков', passed: stackSizeOk, weight: 10 },
    { label: 'Длительность укладывается в выбранный тайминг', passed: withinDuration, weight: 20 },
    { label: 'Минимум слов-паразитов', passed: cleanLanguage, weight: 10 }
  ];

  const score = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);

  const recommendations: string[] = [];
  if (!requiredPresent) {
    recommendations.push('Добавьте обязательные блоки: приветствие, причину поиска и финальный блок с целевой ролью.');
  }
  if (!hasEnoughAchievements) {
    recommendations.push('Добавьте минимум 2 достижения с конкретным влиянием на продукт.');
  }
  if (!metricsPresent) {
    recommendations.push('Добавьте цифры: проценты, время загрузки, рост retention, конверсию или DAU.');
  }
  if (!stackSizeOk) {
    recommendations.push('Увеличьте структуру до 5+ блоков, чтобы рассказ звучал полноценно.');
  }
  if (!withinDuration) {
    recommendations.push(`Подгоните текст под тайминг ${target} секунд: сейчас ориентировочно ${estimatedSeconds} сек.`);
  }
  if (!cleanLanguage) {
    recommendations.push(`Снизьте слова-паразиты: ${waterWords.join(', ')}.`);
  }

  if (recommendations.length === 0) {
    recommendations.push('Отлично: структура и качество ответа близки к уровню интервью.');
  }

  return {
    score,
    checks: checks.map(({ label, passed }) => ({ label, passed })),
    recommendations,
    wordCount,
    estimatedSeconds
  };
}

export function buildChatGptPrompt(data: SelfPresentationBuilderData, previewText: string): string {
  const serializedJobs = data.jobs
    .map((job, index) => {
      const responsibilities = job.responsibilities.filter((item) => item.trim().length > 0).join('; ');
      const achievements = job.achievements.filter((item) => item.trim().length > 0).join('; ');
      return [
        `${index + 1}. Компания: ${job.company || '—'}`,
        `   Проект: ${job.project || '—'}`,
        `   Жанр/платформа: ${job.genrePlatform || '—'}`,
        `   Механики: ${job.mechanicsSummary || '—'}`,
        `   Обязанности: ${responsibilities || '—'}`,
        `   Достижения: ${achievements || '—'}`
      ].join('\n');
    })
    .join('\n');

  return [
    'Ты карьерный редактор и интервью-коуч для Unity Developer.',
    'Нужно переработать самопрезентацию кандидата для технического интервью.',
    '',
    'Требования:',
    `- Уровень позиции: ${data.profile.targetLevel}`,
    `- Целевая длительность: ${data.settings.duration} секунд`,
    '- Язык: русский',
    '- Убрать воду и расплывчатые формулировки',
    '- Сохранить Unity-специфику (движок, механики, оптимизация, архитектура)',
    '- Усилить измеримость достижений и при нехватке предложить реалистичные метрики',
    '- Дать 2 варианта: 1) concise 2) detailed',
    '',
    'Данные кандидата:',
    `Имя: ${data.profile.name || '—'}`,
    `Опыт (лет): ${data.profile.yearsOfExperience || '—'}`,
    `Причина поиска: ${data.profile.reasonForSearch || '—'}`,
    `Целевая роль/финал: ${data.profile.targetRoleOutro || '—'}`,
    '',
    'Опыт по местам работы:',
    serializedJobs || '—',
    '',
    'Черновик текущей самопрезентации:',
    previewText || '—',
    '',
    'Формат ответа:',
    '1) Concise версия',
    '2) Detailed версия',
    '3) Краткий список улучшений, которые были внесены'
  ].join('\n');
}

export function nextDuration(current: StoryDuration): StoryDuration {
  if (current === 60) return 90;
  if (current === 90) return 120;
  return 60;
}

export function hasBlockType(data: SelfPresentationBuilderData, type: StoryBlockType): boolean {
  return data.storyBlocks.some((block) => block.type === type);
}

export function blockMeta(type: StoryBlockType) {
  return LIBRARY_BLOCKS.find((entry) => entry.type === type);
}
