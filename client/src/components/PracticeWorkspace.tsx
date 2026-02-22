import { useEffect, useMemo, useState } from 'react';
import { cardsApi } from '../api';
import type { Card, CardPayload, CardSort, ReactionValue } from '../types';
import { difficultyClass, difficultyLabel, inferDifficulty, tagCategoryClass } from '../utils/cardPresentation';
import { CardFormModal } from './CardFormModal';
import { Flashcard } from './Flashcard';

const defaultTagOptions = ['C#', 'Математика', 'Rendering', 'Physics', 'Architecture', 'Networking', 'ECS'];
const masteredStorageKey = 'unityprep-mastered-cards';

type ModalState = {
  mode: 'create' | 'edit';
  card: Card | null;
} | null;

type ViewMode = 'browse' | 'study';

type Props = {
  initialView: ViewMode;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onBack: () => void;
  onViewModeChange?: (view: ViewMode) => void;
};

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getPopularityScore(card: Card): number {
  if (typeof card.score === 'number') {
    return card.score;
  }
  return (card.likesCount ?? 0) - (card.dislikesCount ?? 0);
}

function sortByPopularity(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const scoreDiff = getPopularityScore(b) - getPopularityScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    const likesDiff = (b.likesCount ?? 0) - (a.likesCount ?? 0);
    if (likesDiff !== 0) return likesDiff;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function loadMasteredIds(): string[] {
  try {
    const raw = localStorage.getItem(masteredStorageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

export function PracticeWorkspace({ initialView, theme, onToggleTheme, onBack, onViewModeChange }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [browseSort, setBrowseSort] = useState<CardSort>('new');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [browseTagFilter, setBrowseTagFilter] = useState<string[]>([]);
  const [masteredIds, setMasteredIds] = useState<string[]>(loadMasteredIds);

  const [studySelectedTags, setStudySelectedTags] = useState<string[]>([]);
  const [studyCurrentCardId, setStudyCurrentCardId] = useState<string | null>(null);
  const [studyRemainingIds, setStudyRemainingIds] = useState<string[]>([]);

  useEffect(() => {
    setViewMode(initialView);
  }, [initialView]);

  useEffect(() => {
    onViewModeChange?.(viewMode);
  }, [onViewModeChange, viewMode]);

  useEffect(() => {
    void loadCards(browseSort);
  }, [browseSort]);

  useEffect(() => {
    localStorage.setItem(masteredStorageKey, JSON.stringify(masteredIds));
  }, [masteredIds]);

  const availableTags = useMemo(() => {
    const collected = new Set(defaultTagOptions);
    for (const card of cards) {
      for (const tag of card.tags) {
        if (tag.trim()) {
          collected.add(tag.trim());
        }
      }
    }
    return Array.from(collected);
  }, [cards]);

  const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selectedTags = new Set(browseTagFilter.map((tag) => normalizeTag(tag)));

    return cards.filter((card) => {
      const content = `${card.question} ${card.answer} ${card.tags.join(' ')}`.toLowerCase();
      const queryMatches = normalizedQuery.length === 0 || content.includes(normalizedQuery);
      const tagMatches = selectedTags.size === 0 || card.tags.some((tag) => selectedTags.has(normalizeTag(tag)));
      return queryMatches && tagMatches;
    });
  }, [cards, query, browseTagFilter]);

  const studyPool = useMemo(() => {
    if (studySelectedTags.length === 0) {
      return [];
    }

    const selected = new Set(studySelectedTags.map((tag) => normalizeTag(tag)));
    return cards.filter((card) => card.tags.some((tag) => selected.has(normalizeTag(tag))));
  }, [cards, studySelectedTags]);

  const studyCurrentCard = useMemo(() => {
    if (!studyCurrentCardId) {
      return null;
    }

    return cards.find((card) => card.id === studyCurrentCardId) ?? null;
  }, [cards, studyCurrentCardId]);

  const studyNextPreviewCard = useMemo(() => {
    if (!studyCurrentCard) {
      return null;
    }

    const nextFromQueueId = studyRemainingIds[0];
    if (nextFromQueueId) {
      return cards.find((card) => card.id === nextFromQueueId) ?? null;
    }

    return studyPool.find((card) => card.id !== studyCurrentCard.id) ?? null;
  }, [cards, studyCurrentCard, studyPool, studyRemainingIds]);

  useEffect(() => {
    const poolIdSet = new Set(studyPool.map((card) => card.id));

    setStudyRemainingIds((prev) => {
      const next = prev.filter((id) => poolIdSet.has(id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });

    if (studyCurrentCardId && !poolIdSet.has(studyCurrentCardId)) {
      setStudyCurrentCardId(null);
    }
  }, [studyPool, studyCurrentCardId]);

  async function loadCards(sort: CardSort) {
    try {
      setLoading(true);
      setError(null);
      const data = await cardsApi.getAll(sort);
      setCards(sort === 'popular' ? sortByPopularity(data) : data);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(payload: CardPayload) {
    try {
      setError(null);
      const created = await cardsApi.create(payload);
      setCards((prev) => (browseSort === 'popular' ? sortByPopularity([created, ...prev]) : [created, ...prev]));
    } catch (submitError) {
      setError((submitError as Error).message);
      throw submitError;
    }
  }

  async function handleUpdate(id: string, payload: CardPayload) {
    try {
      setError(null);
      const updated = await cardsApi.update(id, payload);
      setCards((prev) => {
        const next = prev.map((card) => (card.id === id ? updated : card));
        return browseSort === 'popular' ? sortByPopularity(next) : next;
      });
    } catch (submitError) {
      setError((submitError as Error).message);
      throw submitError;
    }
  }

  async function handleDelete(card: Card) {
    const confirmed = window.confirm('Удалить эту карточку?');
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      await cardsApi.remove(card.id);
      setCards((prev) => prev.filter((entry) => entry.id !== card.id));
      setMasteredIds((prev) => prev.filter((id) => id !== card.id));
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  }

  async function handleReaction(cardId: string, value: ReactionValue) {
    try {
      const summary = await cardsApi.react(cardId, value);
      setCards((prev) => {
        const next = prev.map((card) =>
          card.id === cardId
            ? {
                ...card,
                likesCount: summary.likesCount,
                dislikesCount: summary.dislikesCount,
                score: summary.score,
                userReaction: summary.userReaction
              }
            : card
        );
        return browseSort === 'popular' ? sortByPopularity(next) : next;
      });
    } catch (reactionError) {
      setError((reactionError as Error).message);
    }
  }

  function toggleMastered(cardId: string) {
    setMasteredIds((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      }
      return [...prev, cardId];
    });
  }

  function toggleBrowseTag(tag: string) {
    const normalized = normalizeTag(tag);
    setBrowseTagFilter((prev) => {
      const exists = prev.some((item) => normalizeTag(item) === normalized);
      if (exists) {
        return prev.filter((item) => normalizeTag(item) !== normalized);
      }
      return [...prev, tag];
    });
  }

  function selectAllBrowseTags() {
    setBrowseTagFilter([...availableTags]);
  }

  function clearBrowseTags() {
    setBrowseTagFilter([]);
  }

  function resetStudySession() {
    setStudyCurrentCardId(null);
    setStudyRemainingIds([]);
  }

  function toggleStudyTag(tag: string) {
    const normalized = normalizeTag(tag);

    setStudySelectedTags((prev) => {
      const exists = prev.some((item) => normalizeTag(item) === normalized);
      if (exists) {
        return prev.filter((item) => normalizeTag(item) !== normalized);
      }
      return [...prev, tag];
    });

    resetStudySession();
  }

  function selectAllStudyTags() {
    setStudySelectedTags([...availableTags]);
    resetStudySession();
  }

  function clearStudyTags() {
    setStudySelectedTags([]);
    resetStudySession();
  }

  function startStudySession() {
    if (studyPool.length === 0) {
      return;
    }

    const shuffledIds = shuffle(studyPool.map((card) => card.id));
    setStudyCurrentCardId(shuffledIds[0] ?? null);
    setStudyRemainingIds(shuffledIds.slice(1));
  }

  function drawNextStudyCard() {
    if (studyPool.length === 0) {
      return;
    }

    if (studyRemainingIds.length > 0) {
      const [nextId, ...rest] = studyRemainingIds;
      setStudyCurrentCardId(nextId);
      setStudyRemainingIds(rest);
      return;
    }

    const fallbackIds = studyPool.map((card) => card.id).filter((id) => id !== studyCurrentCardId);
    if (fallbackIds.length === 0) {
      return;
    }

    const shuffled = shuffle(fallbackIds);
    setStudyCurrentCardId(shuffled[0] ?? null);
    setStudyRemainingIds(shuffled.slice(1));
  }

  const statusText = loading
    ? 'Загружаем карточки...'
    : error
      ? `Ошибка загрузки: ${error}`
      : `Карточек в колоде: ${cards.length} (${browseSort === 'popular' ? 'Популярные' : 'Новые'})`;

  const masteredCount = cards.filter((card) => masteredSet.has(card.id)).length;

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-mesh" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-particles" />
      {viewMode === 'study' && (
        <div className="pointer-events-none fixed inset-0 z-[1] bg-white/8 backdrop-blur-[2px] dark:bg-transparent dark:backdrop-blur-0" />
      )}
      <div className="pointer-events-none fixed inset-x-0 top-[-260px] z-0 h-[520px] bg-[radial-gradient(circle_at_top,_rgba(47,123,255,0.22),_transparent_62%)] dark:bg-[radial-gradient(circle_at_top,_rgba(138,109,255,0.25),_transparent_62%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 pb-10 pt-6 lg:px-10">
        <header className="surface-panel mb-8 flex flex-wrap items-center justify-between gap-4 px-5 py-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-3 rounded-xl px-1 py-1 text-left transition hover:opacity-85"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-lg font-bold text-white">
              U
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">UnityPrep Cards</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Практика по интервью</span>
            </span>
          </button>

          <div className="inline-flex rounded-xl border border-slate-300 bg-white/70 p-1 dark:border-slate-600 dark:bg-[#252b3a]/80">
            <button
              type="button"
              onClick={() => setViewMode('browse')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                viewMode === 'browse'
                  ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white'
                  : 'text-slate-600 hover:text-brand-600 dark:text-slate-300'
              }`}
            >
              Наборы вопросов
            </button>
            <button
              type="button"
              onClick={() => setViewMode('study')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                viewMode === 'study'
                  ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white'
                  : 'text-slate-600 hover:text-brand-600 dark:text-slate-300'
              }`}
            >
              Тренировка
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="rounded-xl border border-slate-300 bg-white/75 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-200"
            >
              {theme === 'light' ? 'Темная тема' : 'Светлая тема'}
            </button>
            <button type="button" onClick={() => setModal({ mode: 'create', card: null })} className="cta-button px-4 py-2 text-sm">
              + Добавить карточку
            </button>
          </div>
        </header>

        {viewMode === 'browse' && (
          <section className="surface-panel p-5">
            <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Поиск в наборе вопросов</span>
                <input
                  type="search"
                  placeholder="Поиск по вопросу, ответу или тегу..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Поиск карточек"
                  className="rounded-xl border border-slate-300 bg-white/75 px-4 py-2.5 text-slate-900 outline-none transition focus:border-brand-400 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-100"
                />
              </label>

              <div className="text-right text-sm text-slate-500 dark:text-slate-400">
                <p>{statusText}</p>
                <p>Освоено: {masteredCount}</p>
              </div>
            </div>

            <div className="mb-4 inline-flex rounded-xl border border-slate-300 bg-white/75 p-1 dark:border-slate-600 dark:bg-[#252b3a]/80">
              <button
                type="button"
                onClick={() => setBrowseSort('new')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  browseSort === 'new'
                    ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white'
                    : 'text-slate-600 hover:text-brand-600 dark:text-slate-300'
                }`}
              >
                Сначала новые
              </button>
              <button
                type="button"
                onClick={() => setBrowseSort('popular')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  browseSort === 'popular'
                    ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white'
                    : 'text-slate-600 hover:text-brand-600 dark:text-slate-300'
                }`}
              >
                Популярные
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <div className="mb-1 flex w-full flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllBrowseTags}
                  className="rounded-lg border border-slate-300 bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-200"
                >
                  Выбрать все теги
                </button>
                <button
                  type="button"
                  onClick={clearBrowseTags}
                  className="rounded-lg border border-slate-300 bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-200"
                >
                  Сбросить теги
                </button>
              </div>
              {availableTags.map((tag) => {
                const active = browseTagFilter.some((entry) => normalizeTag(entry) === normalizeTag(tag));
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleBrowseTag(tag)}
                    className={`tag-chip ${tagCategoryClass(tag)} ${
                      active
                        ? 'tag-selected ring-2 ring-brand-500/80 ring-offset-1 ring-offset-white dark:ring-rose-400/95 dark:ring-offset-[#1c2435]'
                        : ''
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            {!loading && !error && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredCards.map((card) => (
                  <Flashcard
                    key={card.id}
                    card={card}
                    difficulty={inferDifficulty(card)}
                    mastered={masteredSet.has(card.id)}
                    onToggleMastered={(selected) => toggleMastered(selected.id)}
                    onEdit={(selected) => setModal({ mode: 'edit', card: selected })}
                    onDelete={(selected) => void handleDelete(selected)}
                    onReact={(selected, value) => handleReaction(selected.id, value)}
                  />
                ))}
              </div>
            )}

            {!loading && !error && filteredCards.length === 0 && (
              <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-[#252b3a]/70 dark:text-slate-400">
                По вашему фильтру ничего не найдено.
              </p>
            )}

            {loading && (
              <p className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-[#252b3a]/70 dark:text-slate-400">
                Загрузка карточек...
              </p>
            )}

            {error && (
              <p className="rounded-xl border border-rose-300 bg-rose-50/80 p-4 text-sm text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-300">
                Не удалось загрузить карточки: {error}
              </p>
            )}
          </section>
        )}

        {viewMode === 'study' && (
          <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <aside className="surface-panel p-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Тренировка по тегам</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Выберите один или несколько тегов. Система покажет случайную карточку, содержащую хотя бы один из них.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <div className="mb-1 flex w-full flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllStudyTags}
                    className="rounded-lg border border-slate-300 bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-200"
                  >
                    Выбрать все теги
                  </button>
                  <button
                    type="button"
                    onClick={clearStudyTags}
                    className="rounded-lg border border-slate-300 bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-200"
                  >
                    Сбросить теги
                  </button>
                </div>
                {availableTags.map((tag) => {
                  const active = studySelectedTags.some((entry) => normalizeTag(entry) === normalizeTag(tag));
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleStudyTag(tag)}
                      className={`tag-chip ${tagCategoryClass(tag)} ${
                        active
                          ? 'tag-selected ring-2 ring-brand-500/80 ring-offset-1 ring-offset-white dark:ring-rose-400/95 dark:ring-offset-[#1c2435]'
                          : ''
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={startStudySession}
                  disabled={studySelectedTags.length === 0 || studyPool.length === 0}
                  className="cta-button px-4 py-2.5 text-sm disabled:opacity-60"
                >
                  Начать тренировку
                </button>
                <button
                  type="button"
                  onClick={drawNextStudyCard}
                  disabled={!studyCurrentCard}
                  className="rounded-xl border border-slate-300 bg-white/75 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 disabled:opacity-60 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-200"
                >
                  Следующая случайная карточка
                </button>
                <button
                  type="button"
                  onClick={resetStudySession}
                  className="rounded-xl border border-slate-300 bg-white/75 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-200"
                >
                  Сбросить сессию
                </button>
              </div>

              <div className="mt-5 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                <p>Подходящих карточек: {studyPool.length}</p>
                <p>Осталось в текущем цикле: {studyRemainingIds.length}</p>
              </div>
            </aside>

            <div className="focus-shell">
              {studyCurrentCard ? (
                <>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Используйте кнопку «Следующий вопрос»
                  </p>
                  <div className="pointer-events-none absolute inset-x-10 top-14 h-24 rounded-full bg-[radial-gradient(circle,_rgba(108,155,255,0.22),_transparent_68%)] dark:bg-[radial-gradient(circle,_rgba(103,123,255,0.26),_transparent_70%)]" />
                  <div className="relative mx-auto max-w-2xl">
                    {studyNextPreviewCard && (
                      <div
                        className="pointer-events-none absolute inset-x-4 top-5 z-0"
                        style={{
                          transform: 'translateY(14px) scale(0.965)',
                          opacity: 0.78
                        }}
                      >
                        <article
                          className={`glass-card card-depth card-lux ${difficultyClass(
                            inferDifficulty(studyNextPreviewCard)
                          )} relative h-[420px] overflow-hidden p-5`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent dark:from-white/10" />
                          <div className="relative flex h-full flex-col">
                            <div className="mb-3 flex items-center justify-between">
                              <span className="difficulty-badge" data-difficulty={inferDifficulty(studyNextPreviewCard)}>
                                {difficultyLabel(inferDifficulty(studyNextPreviewCard))}
                              </span>
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                                Следующая
                              </span>
                            </div>
                            {studyNextPreviewCard.tags.length > 0 && (
                              <div className="mb-3 flex flex-wrap gap-2">
                                {studyNextPreviewCard.tags.slice(0, 4).map((tag) => (
                                  <span key={`${studyNextPreviewCard.id}-${tag}`} className={`tag-chip ${tagCategoryClass(tag)}`}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                              Вопрос
                            </p>
                            <p className="max-h-[170px] overflow-hidden text-[1.02rem] font-semibold leading-7 text-slate-900 dark:text-slate-100">
                              {studyNextPreviewCard.question}
                            </p>
                          </div>
                        </article>
                      </div>
                    )}

                    <div className="relative z-10">
                      <Flashcard
                        key={studyCurrentCard.id}
                        card={studyCurrentCard}
                        difficulty={inferDifficulty(studyCurrentCard)}
                        mastered={masteredSet.has(studyCurrentCard.id)}
                        onToggleMastered={(selected) => toggleMastered(selected.id)}
                        showActions={false}
                        swipeEnabled={false}
                        motionEnabled={false}
                        onNext={() => drawNextStudyCard()}
                        showNextOnQuestion
                        nextLabel="Следующий вопрос"
                        className="mx-auto max-w-2xl study-card-enter"
                        onReact={(selected, value) => handleReaction(selected.id, value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-[#252b3a]/70 dark:text-slate-400">
                  Нажмите «Начать тренировку», чтобы вытянуть первую карточку.
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {modal && (
        <CardFormModal
          mode={modal.mode}
          card={modal.card}
          availableTags={availableTags}
          onClose={() => setModal(null)}
          onSubmit={(payload) => {
            if (modal.mode === 'create') {
              return handleCreate(payload);
            }
            return handleUpdate(modal.card!.id, payload);
          }}
        />
      )}
    </div>
  );
}
