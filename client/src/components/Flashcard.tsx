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
  onSwipe
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
      className={`flashcard ${isFlipped ? 'is-flipped' : ''} ${swipeEnabled ? 'swipe-enabled' : ''} ${
        isDragging ? 'swipe-dragging' : ''
      }`}
      style={articleStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishSwipe}
      onPointerCancel={handlePointerCancel}
    >
      <div className="flashcard-inner">
        <div className="flashcard-face flashcard-front">
          {showActions && onEdit && onDelete && (
            <header className="flashcard-header">
              <button
                type="button"
                className="icon-button"
                aria-label="Редактировать карточку"
                onClick={() => onEdit(card)}
              >
                ✎
              </button>
              <button
                type="button"
                className="icon-button danger"
                aria-label="Удалить карточку"
                onClick={() => onDelete(card)}
              >
                🗑
              </button>
            </header>
          )}
          {card.tags.length > 0 && (
            <div className="card-tags">
              {card.tags.map((tag) => (
                <span key={tag} className="tag-pill readonly">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <h3>{card.question}</h3>
          <button type="button" className="action-button" onClick={() => setIsFlipped(true)}>
            Показать ответ
          </button>
        </div>

        <div className="flashcard-face flashcard-back">
          <p>{card.answer}</p>
          <div className="sources">
            <strong>Источники</strong>
            {card.sources.length === 0 ? (
              <span className="source-empty">Ссылки пока не добавлены</span>
            ) : (
              <ul>
                {card.sources.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="action-button" onClick={() => setIsFlipped(false)}>
            Назад к вопросу
          </button>
        </div>
      </div>
    </article>
  );
}
