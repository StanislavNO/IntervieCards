import { useEffect, useMemo, useState } from 'react';
import { cardsApi } from '../api';
import type { AuthUser, Card, CardPayload, CardSort, ReactionValue } from '../types';
import { inferDifficulty, tagCategoryClass } from '../utils/cardPresentation';
import { CardFormModal } from './CardFormModal';
import { Flashcard } from './Flashcard';
import { TelegramAuthControl } from './TelegramAuthControl';

const defaultTagOptions = ['C#', 'Математика', 'Rendering', 'Physics', 'Architecture', 'Networking', 'ECS'];
const masteredStorageKey = 'unityprep-mastered-cards';

type ModalState = {
  mode: 'create' | 'edit';
  card: Card | null;
} | null;

type ViewMode = 'browse' | 'study';
type StudyHistoryEntry = { entryId: string; cardId: string };

type Props = {
  initialView: ViewMode;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onBack: () => void;
  onViewModeChange?: (view: ViewMode) => void;
  authUser: AuthUser | null;
  authLoading: boolean;
  authEnabled: boolean;
  onAuthChange: (user: AuthUser | null) => void;
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

export function PracticeWorkspace({
  initialView,
  theme,
  onToggleTheme,
  onBack,
  onViewModeChange,
  authUser,
  authLoading,
  authEnabled,
  onAuthChange
}: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [browseSort, setBrowseSort] = useState<CardSort>('new');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [browseTagFilter, setBrowseTagFilter] = useState<string[]>([]);
  const [masteredIds, setMasteredIds] = useState<string[]>(loadMasteredIds);

  const [studySelectedTags, setStudySelectedTags] = useState<string[]>([]);
  const [studyCurrentCardId, setStudyCurrentCardId] = useState<string | null>(null);
  const [studyRemainingIds, setStudyRemainingIds] = useState<string[]>([]);
  const [studyHistoryEntries, setStudyHistoryEntries] = useState<StudyHistoryEntry[]>([]);

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

  const studyHistoryCards = useMemo(
    () =>
      studyHistoryEntries
        .map((entry) => {
          const card = cards.find((item) => item.id === entry.cardId);
          if (!card) {
            return null;
          }
          return { entryId: entry.entryId, card };
        })
        .filter((item): item is { entryId: string; card: Card } => item !== null),
    [cards, studyHistoryEntries]
  );

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

  useEffect(() => {
    const cardIdSet = new Set(cards.map((card) => card.id));
    setStudyHistoryEntries((prev) => prev.filter((entry) => cardIdSet.has(entry.cardId)));
  }, [cards]);

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

  function ensureAuthorized(actionLabel: string): boolean {
    if (!authEnabled) {
      return true;
    }

    if (authUser) {
      return true;
    }

    setError(`Войдите через Telegram, чтобы ${actionLabel}.`);
    return false;
  }

  async function handleCreate(payload: CardPayload) {
    if (!ensureAuthorized('добавлять карточки')) {
      return;
    }

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
    if (!ensureAuthorized('редактировать карточки')) {
      return;
    }

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
    if (!ensureAuthorized('удалять карточки')) {
      return;
    }

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
    if (!ensureAuthorized('оценивать карточки')) {
      return;
    }

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
    setStudyHistoryEntries([]);
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
    setStudyHistoryEntries([]);
  }

  function drawNextStudyCard() {
    if (studyPool.length === 0) {
      return;
    }

    if (studyCurrentCardId) {
      setStudyHistoryEntries((prev) => [{ entryId: crypto.randomUUID(), cardId: studyCurrentCardId }, ...prev]);
    }

    if (studyRemainingIds.length > 0) {
      const [nextId, ...rest] = studyRemainingIds;
      setStudyCurrentCardId(nextId);
      setStudyRemainingIds(rest);
      return;
    }

    // End session when all cards were shown; do not loop previously seen cards.
    setStudyCurrentCardId(null);
    setStudyRemainingIds([]);
  }

  const statusText = loading
    ? 'Загружаем карточки...'
    : error
      ? `Ошибка загрузки: ${error}`
      : `Карточек в колоде: ${cards.length} (${browseSort === 'popular' ? 'Популярные' : 'Новые'})`;

  const masteredCount = cards.filter((card) => masteredSet.has(card.id)).length;
  const studySessionFinished = studyPool.length > 0 && studyHistoryEntries.length > 0 && !studyCurrentCard;

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
        <header className="saas-header mb-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-3 rounded-xl px-1 py-1 text-left transition hover:opacity-85"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-bold text-white">
                  U
                </span>
                <span className="hidden sm:block">
                  <span className="block text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">UnityPrep Cards</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">Рабочее пространство</span>
                </span>
              </button>

              <div className="hidden items-center gap-1 lg:flex">
                <button
                  type="button"
                  onClick={() => setViewMode('browse')}
                  className={`header-nav-link ${viewMode === 'browse' ? 'header-nav-link-active' : ''}`}
                >
                  Банк вопросов
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('study')}
                  className={`header-nav-link ${viewMode === 'study' ? 'header-nav-link-active' : ''}`}
                >
                  Тренировка
                </button>
                <button
                  type="button"
                  disabled
                  className="header-nav-link cursor-not-allowed opacity-55 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Интервью
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'dark'}
                onClick={onToggleTheme}
                aria-label="Переключить тему"
                className="header-theme-toggle"
              >
                {theme === 'light' ? '☀' : '☾'}
              </button>
              {authEnabled && (
                <TelegramAuthControl
                  user={authUser}
                  loading={authLoading}
                  onUserChange={onAuthChange}
                  onAddCard={() => setModal({ mode: 'create', card: null })}
                  className="shrink-0"
                />
              )}
              <button
                type="button"
                onClick={() => setHeaderMenuOpen((prev) => !prev)}
                className="header-mobile-toggle"
                aria-expanded={headerMenuOpen}
              >
                Меню
              </button>
            </div>
          </div>

          {headerMenuOpen && (
            <div className="header-mobile-panel">
              <button
                type="button"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  setViewMode('browse');
                }}
                className={`header-nav-link text-left ${viewMode === 'browse' ? 'header-nav-link-active' : ''}`}
              >
                Банк вопросов
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  setViewMode('study');
                }}
                className={`header-nav-link text-left ${viewMode === 'study' ? 'header-nav-link-active' : ''}`}
              >
                Тренировка
              </button>
              <button
                type="button"
                disabled
                className="header-nav-link cursor-not-allowed text-left opacity-55 hover:text-slate-600 dark:hover:text-slate-300"
              >
                Интервью
              </button>
            </div>
          )}
        </header>

        {authEnabled && !authUser && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Чтобы добавлять, редактировать, удалять и оценивать карточки, войдите через Telegram.
          </div>
        )}

        {viewMode === 'browse' && (
          <section className="surface-panel p-5">
            <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Поиск в банке вопросов</span>
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

            {!authEnabled && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setModal({ mode: 'create', card: null })}
                  className="rounded-xl border border-slate-300 bg-white/75 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-200"
                >
                  Добавить карточку
                </button>
              </div>
            )}

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
                    showActions={authEnabled ? Boolean(authUser) : true}
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
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Тренировка</h2>
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
                    Активная карточка
                  </p>
                  <div className="pointer-events-none absolute inset-x-10 top-14 h-24 rounded-full bg-[radial-gradient(circle,_rgba(108,155,255,0.22),_transparent_68%)] dark:bg-[radial-gradient(circle,_rgba(103,123,255,0.26),_transparent_70%)]" />
                  <div className="relative mx-auto max-w-2xl">
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
                        onReact={authEnabled && !authUser ? undefined : (selected, value) => handleReaction(selected.id, value)}
                      />
                    </div>
                  </div>

                  <section className="mt-6">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        История карточек
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Прокрутите вниз</p>
                    </div>
                    {studyHistoryCards.length === 0 ? (
                      <div className="history-card rounded-xl px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        История появится после перехода к следующему вопросу.
                      </div>
                    ) : (
                      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                        {studyHistoryCards.map(({ entryId, card }, index) => (
                          <article key={entryId} className={`history-card history-card-enter rounded-xl px-4 py-3`}>
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="history-badge">Прошлая карточка</span>
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                                #{studyHistoryCards.length - index}
                              </span>
                            </div>
                            {card.tags.length > 0 && (
                              <div className="mb-2 flex flex-wrap gap-2">
                                {card.tags.slice(0, 5).map((tag) => (
                                  <span key={`${entryId}-${tag}`} className={`tag-chip ${tagCategoryClass(tag)}`}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                              Вопрос
                            </p>
                            <p className="text-sm font-semibold leading-6 text-slate-800 dark:text-slate-100">{card.question}</p>
                            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{card.answer}</p>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-[#252b3a]/70 dark:text-slate-400">
                  {studySessionFinished
                    ? 'Карточки в этой тренировке закончились. Повторов не будет, нажмите «Начать тренировку», чтобы запустить новый цикл.'
                    : 'Нажмите «Начать тренировку», чтобы вытянуть первую карточку.'}
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
