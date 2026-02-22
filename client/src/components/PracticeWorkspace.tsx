import { useEffect, useMemo, useState } from 'react';
import { cardsApi } from '../api';
import { CardFormModal } from './CardFormModal';
import { Flashcard } from './Flashcard';
import type { Card, CardPayload } from '../types';

const defaultTagOptions = ['C#', 'Математика', 'Rendering', 'ECS'];

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

export function PracticeWorkspace({ initialView, theme, onToggleTheme, onBack }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [browseTagFilter, setBrowseTagFilter] = useState<string[]>([]);

  const [studySelectedTags, setStudySelectedTags] = useState<string[]>([]);
  const [studyCurrentCardId, setStudyCurrentCardId] = useState<string | null>(null);
  const [studyRemainingIds, setStudyRemainingIds] = useState<string[]>([]);

  useEffect(() => {
    setViewMode(initialView);
  }, [initialView]);

  useEffect(() => {
    void loadCards();
  }, []);

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

  async function loadCards() {
    try {
      setLoading(true);
      setError(null);
      const data = await cardsApi.getAll();
      setCards(data);
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
      setCards((prev) => [created, ...prev]);
    } catch (submitError) {
      setError((submitError as Error).message);
      throw submitError;
    }
  }

  async function handleUpdate(id: string, payload: CardPayload) {
    try {
      setError(null);
      const updated = await cardsApi.update(id, payload);
      setCards((prev) => prev.map((card) => (card.id === id ? updated : card)));
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
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
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
      : `Карточек в колоде: ${cards.length}`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-100 dark:bg-[#161922]">
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="pointer-events-none absolute inset-x-0 top-[-260px] h-[520px] bg-[radial-gradient(circle_at_top,_rgba(47,123,255,0.22),_transparent_62%)] dark:bg-[radial-gradient(circle_at_top,_rgba(138,109,255,0.25),_transparent_62%)]" />

      <div className="relative mx-auto max-w-7xl px-6 pb-10 pt-6 lg:px-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-3 shadow-soft backdrop-blur dark:border-slate-700/60 dark:bg-[#1d212d]/80">
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

          <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1 dark:border-slate-600 dark:bg-[#252b3a]">
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
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-200"
            >
              {theme === 'light' ? 'Темная тема' : 'Светлая тема'}
            </button>
            <button
              type="button"
              onClick={() => setModal({ mode: 'create', card: null })}
              className="rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              + Добавить карточку
            </button>
          </div>
        </header>

        {viewMode === 'browse' && (
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-soft dark:border-slate-700 dark:bg-[#1d2231]">
            <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Поиск в наборе вопросов</span>
                <input
                  type="search"
                  placeholder="Поиск по вопросу, ответу или тегу..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Поиск карточек"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 outline-none transition focus:border-brand-400 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-100"
                />
              </label>

              <p className="text-sm text-slate-500 dark:text-slate-400">{statusText}</p>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const active = browseTagFilter.some((entry) => normalizeTag(entry) === normalizeTag(tag));
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleBrowseTag(tag)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-200'
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
                    onEdit={(selected) => setModal({ mode: 'edit', card: selected })}
                    onDelete={(selected) => void handleDelete(selected)}
                  />
                ))}
              </div>
            )}

            {!loading && !error && filteredCards.length === 0 && (
              <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-[#252b3a] dark:text-slate-400">
                По вашему фильтру ничего не найдено.
              </p>
            )}

            {loading && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-[#252b3a] dark:text-slate-400">
                Загрузка карточек...
              </p>
            )}

            {error && (
              <p className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-300">
                Не удалось загрузить карточки: {error}
              </p>
            )}
          </section>
        )}

        {viewMode === 'study' && (
          <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <aside className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-soft dark:border-slate-700 dark:bg-[#1d2231]">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Тренировка по тегам</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Выберите один или несколько тегов. Система покажет случайную карточку, содержащую хотя бы один из них.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const active = studySelectedTags.some((entry) => normalizeTag(entry) === normalizeTag(tag));
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleStudyTag(tag)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        active
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-200'
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
                  className="rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  Начать тренировку
                </button>
                <button
                  type="button"
                  onClick={drawNextStudyCard}
                  disabled={!studyCurrentCard}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 disabled:opacity-60 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-200"
                >
                  Следующая случайная карточка
                </button>
                <button
                  type="button"
                  onClick={resetStudySession}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-200"
                >
                  Сбросить сессию
                </button>
              </div>

              <div className="mt-5 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                <p>Подходящих карточек: {studyPool.length}</p>
                <p>Осталось в текущем цикле: {studyRemainingIds.length}</p>
              </div>
            </aside>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-soft dark:border-slate-700 dark:bg-[#1d2231]">
              {studyCurrentCard ? (
                <>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Свайп влево/вправо или кнопка «Следующая»
                  </p>
                  <Flashcard
                    key={studyCurrentCard.id}
                    card={studyCurrentCard}
                    showActions={false}
                    swipeEnabled
                    onSwipe={() => drawNextStudyCard()}
                    className="mx-auto max-w-2xl"
                  />
                </>
              ) : (
                <div className="flex h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-400">
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
