import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cardsApi } from '../api';
import type { AuthUser, Card } from '../types';

const masteredStorageKey = 'unityprep-mastered-cards';
const lastRouteStorageKey = 'unityprep-last-app-route';
const lastActivityStorageKey = 'unityprep-last-activity-at';

type Props = {
  user: AuthUser;
};

function loadMasteredIds(): string[] {
  try {
    const raw = localStorage.getItem(masteredStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function formatLastActivity(value: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

export function AppDashboardPage({ user }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void cardsApi
      .getAll('popular')
      .then((data) => {
        if (!cancelled) {
          setCards(data);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const masteredCount = useMemo(() => {
    const masteredSet = new Set(loadMasteredIds());
    return cards.filter((card) => masteredSet.has(card.id)).length;
  }, [cards]);

  const favorites = useMemo(() => cards.slice(0, 3), [cards]);
  const lastRoute = localStorage.getItem(lastRouteStorageKey);
  const lastActivityAt = formatLastActivity(localStorage.getItem(lastActivityStorageKey));
  const continueTo = lastRoute && lastRoute.startsWith('/app/') ? lastRoute : '/app/training';
  const hasContinue = Boolean(lastRoute && lastRoute !== '/app');

  return (
    <div className="grid gap-6">
      <section className="surface-panel p-6">
        <p className="text-sm uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">С возвращением</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Рады видеть, {user.firstName}</h1>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-[#242a3a]/80">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Всего карточек</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{loading ? '…' : cards.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-[#242a3a]/80">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Освоено</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{loading ? '…' : masteredCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-[#242a3a]/80">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Последняя активность</p>
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">{lastActivityAt}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ActionCard title="Тренировка по тегам" description="Фокус на нужных темах и быстрый прогон по выбранным тегам." to="/app/training" />
        <ActionCard title="Банк вопросов" description="Полная база вопросов с поиском, сортировкой и редактированием." to="/app/bank" />
        <ActionCard title="Пробное интервью" description="Скоро: режим имитации интервью с таймингами и сценариями." to="/app/interview" />
        <ActionCard
          title="Конструктор самопрезентации"
          description="Скоро: конструктор самопрезентации с подсказками под Unity-позиции."
          to="/app/self-presentation"
        />
      </section>

      <section className="surface-panel p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Продолжить</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          {hasContinue ? 'Продолжить сессию' : 'Начать тренировку'}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {hasContinue ? 'Вернитесь к последнему разделу одним кликом.' : 'Запустите первую тренировку по тегам.'}
        </p>
        <Link to={continueTo} className="cta-button mt-4 inline-flex px-4 py-2 text-sm">
          {hasContinue ? 'Продолжить' : 'Начать тренировку'}
        </Link>
      </section>

      <section className="surface-panel p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Избранное</p>
        {favorites.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Избранные карточки появятся здесь после активности.</p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {favorites.map((card) => (
              <li key={card.id} className="rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-[#242a3a]/80">
                <p className="line-clamp-3 text-sm font-medium text-slate-800 dark:text-slate-100">{card.question}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActionCard({ title, description, to }: { title: string; description: string; to: string }) {
  return (
    <article className="surface-panel p-5">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-bold text-white">
        ✦
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
      <Link to={to} className="cta-button mt-4 inline-flex px-4 py-2 text-xs font-semibold">
        Открыть
      </Link>
    </article>
  );
}
