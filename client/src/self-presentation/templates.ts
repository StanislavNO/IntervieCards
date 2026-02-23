import type { LibraryBlockItem, StoryBlockType, StoryRenderContext } from './types';

export const WATER_WORDS = ['ну', 'как бы', 'типа', 'в целом', 'на самом деле', 'вот', 'просто', 'короче'];

export const LIBRARY_BLOCKS: LibraryBlockItem[] = [
  {
    type: 'greeting',
    title: 'Приветствие',
    description: 'Кто вы, сколько лет опыта и ваш стек в Unity.',
    required: true,
    repeatable: false,
    jobScoped: false
  },
  {
    type: 'workExperience',
    title: 'Опыт работы',
    description: 'Компания, проект, жанр и платформа.',
    required: true,
    repeatable: true,
    jobScoped: true
  },
  {
    type: 'responsibilities',
    title: 'Зона ответственности',
    description: 'Что вы делали ежедневно и за что отвечали.',
    required: false,
    repeatable: true,
    jobScoped: true
  },
  {
    type: 'achievements',
    title: 'Достижения',
    description: 'Результаты с метриками и влиянием на продукт.',
    required: false,
    repeatable: true,
    jobScoped: true
  },
  {
    type: 'reasonForSearch',
    title: 'Причина поиска',
    description: 'Почему вы сейчас в поиске новой роли.',
    required: true,
    repeatable: false,
    jobScoped: false
  },
  {
    type: 'targetRoleOutro',
    title: 'Целевая роль и финал',
    description: 'Какие задачи и формат роли вам интересны.',
    required: true,
    repeatable: false,
    jobScoped: false
  }
];

const FALLBACK_TEXT: Record<StoryBlockType, string> = {
  greeting: 'Добавьте блок «Приветствие», чтобы начать рассказ о себе.',
  workExperience: 'Добавьте опыт работы, чтобы показать релевантный коммерческий контекст.',
  responsibilities: 'Добавьте обязанности, чтобы показать глубину вашей роли.',
  achievements: 'Добавьте достижения, чтобы подтвердить результат цифрами.',
  reasonForSearch: 'Добавьте причину поиска работы, чтобы объяснить мотивацию.',
  targetRoleOutro: 'Добавьте финальный блок с целевой ролью и типом задач.'
};

export function renderBlockText(type: StoryBlockType, context: StoryRenderContext, jobId?: string): string {
  const { profile, jobsById } = context;

  if (type === 'greeting') {
    const name = profile.name.trim() || 'Имя';
    const years = profile.yearsOfExperience.trim() || 'N';
    return `Привет! Я ${name}, Unity-разработчик с опытом ${years} лет.`;
  }

  if (type === 'reasonForSearch') {
    const reason = profile.reasonForSearch.trim() || 'уточните причину поиска';
    return `Сейчас ищу работу потому что ${reason}.`;
  }

  if (type === 'targetRoleOutro') {
    const outro = profile.targetRoleOutro.trim() || 'связанные с развитием продукта и сложной игровой логикой';
    return `Интересны задачи ${outro}.`;
  }

  if (!jobId) {
    return FALLBACK_TEXT[type];
  }

  const job = jobsById[jobId];
  if (!job) {
    return 'Выбранная работа не найдена. Добавьте или восстановите карточку работы.';
  }

  if (type === 'workExperience') {
    const company = job.company.trim() || 'компании';
    const project = job.project.trim() || 'проекте';
    const genre = job.genrePlatform.trim() || 'игре/продукте';
    const mechanics = job.mechanicsSummary.trim() || 'реализовывать ключевые механики';
    return `Работал в ${company}, делал проект ${project} — это ${genre}. Игроку нужно ${mechanics}.`;
  }

  if (type === 'responsibilities') {
    const responsibilities = job.responsibilities.filter((item) => item.trim().length > 0);
    if (responsibilities.length === 0) {
      return 'Занимался в основном: уточните ключевые зоны ответственности.';
    }

    return `Занимался в основном: ${responsibilities.join('; ')}.`;
  }

  const achievements = job.achievements.filter((item) => item.trim().length > 0);
  if (achievements.length === 0) {
    return 'Из интересного: добавьте минимум одно достижение с цифрами.';
  }

  return `Из интересного: ${achievements.join('; ')}.`;
}
