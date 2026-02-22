import { useEffect, useMemo, useState } from 'react';
import { cardsApi } from '../api';
import { CardFormModal } from './CardFormModal';
import { Flashcard } from './Flashcard';
import type { Card, CardPayload } from '../types';
import '../styles/global.css';

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

  const [studySelectedTags, setStudySelectedTags] = useState<string[]>([]);
  const [studyCurrentCardId, setStudyCurrentCardId] = useState<string | null>(null);
  const [studyRemainingIds, setStudyRemainingIds] = useState<string[]>([]);

  useEffect(() => {
    setViewMode(initialView);
  }, [initialView]);

  useEffect(() => {
    void loadCards();
  }, []);

  const filteredCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return cards;
    }

    return cards.filter((card) => {
      const content = `${card.question} ${card.answer} ${card.tags.join(' ')}`.toLowerCase();
      return content.includes(normalized);
    });
  }, [cards, query]);

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Карточки для собеседования Unity-разработчика</h1>
          <p>Загружено карточек: {cards.length}</p>
        </div>

        <div className="toolbar">
          <button type="button" className="secondary-button" onClick={onBack}>
            ← На лендинг
          </button>

          <div className="view-switch">
            <button
              type="button"
              className={viewMode === 'browse' ? 'primary-button' : 'secondary-button'}
              onClick={() => setViewMode('browse')}
            >
              Колода
            </button>
            <button
              type="button"
              className={viewMode === 'study' ? 'primary-button' : 'secondary-button'}
              onClick={() => setViewMode('study')}
            >
              Тренировка
            </button>
          </div>

          <button type="button" className="secondary-button" onClick={onToggleTheme} aria-label="Переключить тему">
            {theme === 'light' ? 'Темная тема' : 'Светлая тема'}
          </button>
          <button type="button" className="primary-button" onClick={() => setModal({ mode: 'create', card: null })}>
            + Добавить карточку
          </button>
        </div>
      </header>

      {viewMode === 'browse' && (
        <>
          <section className="search-row">
            <input
              type="search"
              placeholder="Поиск по вопросу, ответу или тегу..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Поиск карточек"
            />
          </section>

          {loading && <p className="status">Загрузка карточек...</p>}
          {error && <p className="status error">Не удалось загрузить карточки: {error}</p>}

          {!loading && !error && (
            <main className="cards-grid">
              {filteredCards.map((card) => (
                <Flashcard
                  key={card.id}
                  card={card}
                  onEdit={(selected) => setModal({ mode: 'edit', card: selected })}
                  onDelete={(selected) => void handleDelete(selected)}
                />
              ))}
            </main>
          )}

          {!loading && !error && filteredCards.length === 0 && (
            <p className="status">По вашему запросу ничего не найдено.</p>
          )}
        </>
      )}

      {viewMode === 'study' && (
        <main className="study-shell">
          <h2>Режим тренировки по тегам</h2>
          <p className="status">Выберите теги. Карточки будут показываться по одной случайным образом.</p>

          <section className="study-tags">
            <div className="tag-options">
              {availableTags.map((tag) => {
                const selected = studySelectedTags.some((item) => normalizeTag(item) === normalizeTag(tag));
                return (
                  <button
                    type="button"
                    key={tag}
                    className={`tag-chip ${selected ? 'selected' : ''}`}
                    onClick={() => toggleStudyTag(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="study-actions">
              <button
                type="button"
                className="primary-button"
                onClick={startStudySession}
                disabled={studySelectedTags.length === 0 || studyPool.length === 0}
              >
                Начать тренировку
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={drawNextStudyCard}
                disabled={!studyCurrentCard}
              >
                Следующая случайная карточка
              </button>
              <button type="button" className="secondary-button" onClick={resetStudySession}>
                Сбросить сессию
              </button>
            </div>
          </section>

          <p className="status">Подходящих карточек: {studyPool.length}</p>
          {studyCurrentCard && <p className="status">Осталось в текущем цикле: {studyRemainingIds.length}</p>}

          {!studyCurrentCard && (
            <p className="status">Нажмите «Начать тренировку», чтобы вытянуть первую карточку.</p>
          )}

          {studyCurrentCard && <p className="status">Свайп влево или вправо: следующая карточка.</p>}

          {studyCurrentCard && (
            <div className="study-card-wrap">
              <Flashcard
                key={studyCurrentCard.id}
                card={studyCurrentCard}
                showActions={false}
                swipeEnabled
                onSwipe={() => drawNextStudyCard()}
              />
            </div>
          )}
        </main>
      )}

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
