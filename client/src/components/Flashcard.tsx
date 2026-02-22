import { type CSSProperties, type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import type { Card } from '../types';

type SwipeDirection = 'left' | 'right';

type Props = {
  card: Card;
  onEdit?: (card: Card) => void;
  onDelete?: (card: Card) => void;
  showActions?: boolean;
  swipeEnabled?: boolean;
  onSwipe?: (direction: SwipeDirection) => void;
  className?: string;
};

type PointerState = {
  pointerId: number;
  startX: number;
  startY: number;
};

const swipeThresholdPx = 90;

export function Flashcard({
  card,
  onEdit,
  onDelete,
  showActions = true,
  swipeEnabled = false,
  onSwipe,
  className = ''
}: Props) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pointerStateRef = useRef<PointerState | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!swipeEnabled) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, a')) {
      return;
    }

    pointerStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };

    setIsDragging(true);
    setSwipeOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const pointer = pointerStateRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;

    if (Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    setSwipeOffset(deltaX);
  };

  const finishSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const pointer = pointerStateRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;

    if (Math.abs(deltaX) >= swipeThresholdPx && Math.abs(deltaX) > Math.abs(deltaY)) {
      onSwipe?.(deltaX > 0 ? 'right' : 'left');
    }

    pointerStateRef.current = null;
    setIsDragging(false);
    setSwipeOffset(0);
  };

  const handlePointerCancel = () => {
    pointerStateRef.current = null;
    setIsDragging(false);
    setSwipeOffset(0);
  };

  const articleStyle: CSSProperties = {
    transform: `translateX(${swipeOffset}px) rotate(${swipeOffset / 25}deg)`,
    transition: isDragging ? 'none' : 'transform 180ms ease'
  };

  return (
    <article
      className={`relative h-[360px] [perspective:1400px] ${swipeEnabled ? 'touch-pan-y cursor-grab select-none' : ''} ${
        isDragging ? 'cursor-grabbing' : ''
      } ${className}`}
      style={articleStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishSwipe}
      onPointerCancel={handlePointerCancel}
    >
      <div
        className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${
          isFlipped ? '[transform:rotateY(180deg)]' : ''
        }`}
      >
        <section className="absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-soft [backface-visibility:hidden] dark:border-slate-700 dark:bg-[#1e2433]">
          {showActions && onEdit && onDelete && (
            <header className="mb-2 flex items-center justify-end gap-2">
              <button
                type="button"
                aria-label="Редактировать карточку"
                onClick={() => onEdit(card)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:text-slate-200"
              >
                ✎
              </button>
              <button
                type="button"
                aria-label="Удалить карточку"
                onClick={() => onDelete(card)}
                className="rounded-lg border border-rose-300 px-2 py-1 text-sm text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/50 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                🗑
              </button>
            </header>
          )}

          {card.tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-brand-300/60 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <h3 className="text-base font-semibold leading-relaxed text-slate-900 dark:text-slate-100">{card.question}</h3>

          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={() => setIsFlipped(true)}
              className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Показать ответ
            </button>
          </div>
        </section>

        <section className="absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-soft [backface-visibility:hidden] [transform:rotateY(180deg)] dark:border-slate-700 dark:bg-[#1e2433]">
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{card.answer}</p>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-[#222838]">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Источники</p>
            {card.sources.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Ссылки пока не добавлены</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                {card.sources.map((source) => (
                  <li key={source} className="break-all">
                    {source}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={() => setIsFlipped(false)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#242a3a] dark:text-slate-200"
            >
              Назад к вопросу
            </button>
          </div>
        </section>
      </div>
    </article>
  );
}
