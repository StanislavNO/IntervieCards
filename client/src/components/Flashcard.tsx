import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { Card, Difficulty, ReactionValue } from '../types';
import { difficultyClass, difficultyLabel, tagCategoryClass } from '../utils/cardPresentation';

type SwipeDirection = 'left' | 'right';

type Props = {
  card: Card;
  difficulty: Difficulty;
  mastered?: boolean;
  onToggleMastered?: (card: Card) => void;
  onEdit?: (card: Card) => void;
  onDelete?: (card: Card) => void;
  onReact?: (card: Card, value: ReactionValue) => Promise<void> | void;
  showActions?: boolean;
  swipeEnabled?: boolean;
  onSwipe?: (direction: SwipeDirection) => void;
  onSwipeProgress?: (offset: number, isDragging: boolean) => void;
  onNext?: () => void;
  showNextOnQuestion?: boolean;
  showReactionsOnBack?: boolean;
  nextLabel?: string;
  className?: string;
  motionEnabled?: boolean;
};

type PointerState = {
  pointerId: number;
  startX: number;
  startY: number;
};

type AnswerBlock =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'list';
      items: string[];
    };

const swipeThresholdPx = 90;
const comparisonPattern = /\S\s*(?:—|–|-|:)\s+\S/u;
const listMarkerPattern = /^[•●▪‣*\-]\s+/u;

function normalizeSource(source: string): string {
  return source.trim();
}

function isLink(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

function normalizeAnswerLine(line: string): string {
  return line.replace(listMarkerPattern, '').trim();
}

function toComparisonList(line: string): string[] {
  const separators = [/\s*;\s*/u, /\s*,\s*/u];
  for (const separator of separators) {
    const parts = line.split(separator).map(normalizeAnswerLine).filter(Boolean);
    if (parts.length >= 2 && parts.every((part) => comparisonPattern.test(part))) {
      return parts;
    }
  }
  return [];
}

function buildAnswerBlocks(answer: string): AnswerBlock[] {
  const paragraphs = answer
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    const fallback = answer.trim();
    return fallback ? [{ type: 'text', text: fallback }] : [];
  }

  const blocks: AnswerBlock[] = [];

  for (const paragraph of paragraphs) {
    const lines = paragraph
      .split(/\n/u)
      .map(normalizeAnswerLine)
      .filter(Boolean);

    if (lines.length === 0) {
      continue;
    }

    if (lines.length > 1 && lines.every((line) => comparisonPattern.test(line))) {
      blocks.push({ type: 'list', items: lines });
      continue;
    }

    if (lines.length > 1) {
      for (const line of lines) {
        const listItems = toComparisonList(line);
        if (listItems.length >= 2) {
          blocks.push({ type: 'list', items: listItems });
        } else {
          blocks.push({ type: 'text', text: line });
        }
      }
      continue;
    }

    const [singleLine] = lines;
    const listItems = toComparisonList(singleLine);

    if (listItems.length >= 2) {
      blocks.push({ type: 'list', items: listItems });
    } else {
      blocks.push({ type: 'text', text: singleLine });
    }
  }

  if (blocks.length > 0) {
    return blocks;
  }

  const fallback = answer.trim();
  return fallback ? [{ type: 'text', text: fallback }] : [];
}

export function Flashcard({
  card,
  difficulty,
  mastered = false,
  onToggleMastered,
  onEdit,
  onDelete,
  onReact,
  showActions = true,
  swipeEnabled = false,
  onSwipe,
  onSwipeProgress,
  onNext,
  showNextOnQuestion = false,
  showReactionsOnBack = false,
  nextLabel = 'Следующий вопрос',
  className = '',
  motionEnabled = true
}: Props) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFlipPulse, setIsFlipPulse] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeMomentum, setSwipeMomentum] = useState<SwipeDirection | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, px: 50, py: 50 });
  const [showMasteredSweep, setShowMasteredSweep] = useState(false);
  const [reactionPending, setReactionPending] = useState<ReactionValue | null>(null);
  const [reactionPulse, setReactionPulse] = useState<ReactionValue | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isNextTransitioning, setIsNextTransitioning] = useState(false);

  const pointerStateRef = useRef<PointerState | null>(null);
  const swipeTimeoutRef = useRef<number | null>(null);
  const flipPulseTimeoutRef = useRef<number | null>(null);
  const masteredSweepTimeoutRef = useRef<number | null>(null);
  const reactionPulseTimeoutRef = useRef<number | null>(null);
  const nextTransitionTimeoutRef = useRef<number | null>(null);
  const prevMasteredRef = useRef(mastered);

  useEffect(() => {
    onSwipeProgress?.(swipeOffset, isDragging);
  }, [isDragging, onSwipeProgress, swipeOffset]);

  useEffect(() => {
    return () => {
      if (swipeTimeoutRef.current !== null) {
        window.clearTimeout(swipeTimeoutRef.current);
      }
      if (flipPulseTimeoutRef.current !== null) {
        window.clearTimeout(flipPulseTimeoutRef.current);
      }
      if (masteredSweepTimeoutRef.current !== null) {
        window.clearTimeout(masteredSweepTimeoutRef.current);
      }
      if (reactionPulseTimeoutRef.current !== null) {
        window.clearTimeout(reactionPulseTimeoutRef.current);
      }
      if (nextTransitionTimeoutRef.current !== null) {
        window.clearTimeout(nextTransitionTimeoutRef.current);
      }
      onSwipeProgress?.(0, false);
    };
  }, [onSwipeProgress]);

  useEffect(() => {
    if (mastered && !prevMasteredRef.current) {
      setShowMasteredSweep(true);
      if (masteredSweepTimeoutRef.current !== null) {
        window.clearTimeout(masteredSweepTimeoutRef.current);
      }
      masteredSweepTimeoutRef.current = window.setTimeout(() => setShowMasteredSweep(false), 980);
    }

    prevMasteredRef.current = mastered;
  }, [mastered]);

  const cardClass = useMemo(() => {
    const classes = ['glass-card', 'flip-face', 'card-depth', difficultyClass(difficulty)];

    if (mastered) {
      classes.push('mastered-card');
    }
    if (showMasteredSweep) {
      classes.push('mastered-sweep');
    }
    return classes.join(' ');
  }, [difficulty, mastered, showMasteredSweep]);

  const answerBlocks = useMemo(() => buildAnswerBlocks(card.answer), [card.answer]);

  const likesCount = card.likesCount ?? 0;
  const dislikesCount = card.dislikesCount ?? 0;
  const score = card.score ?? likesCount - dislikesCount;
  const userReaction = card.userReaction ?? 0;
  const secondaryActionButtonClass =
    'rounded-xl border border-slate-300/85 bg-white/75 px-3 py-3 text-sm font-semibold text-slate-700/90 transition-colors duration-200 hover:border-brand-400 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-600 dark:bg-[#242a3a] dark:text-slate-200 dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-slate-900';
  const reactionButtonBaseClass =
    'rounded-full px-2.5 py-1 text-xs font-semibold transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-slate-900';

  const triggerFlipPulse = () => {
    setIsFlipPulse(true);
    if (flipPulseTimeoutRef.current !== null) {
      window.clearTimeout(flipPulseTimeoutRef.current);
    }
    flipPulseTimeoutRef.current = window.setTimeout(() => setIsFlipPulse(false), 180);
  };

  const handleReveal = () => {
    setIsFlipped(true);
    triggerFlipPulse();
  };

  const handleBack = () => {
    setIsFlipped(false);
    triggerFlipPulse();
  };

  const handleNext = () => {
    if (!onNext || isNextTransitioning) {
      return;
    }

    setIsNextTransitioning(true);
    if (nextTransitionTimeoutRef.current !== null) {
      window.clearTimeout(nextTransitionTimeoutRef.current);
    }

    nextTransitionTimeoutRef.current = window.setTimeout(() => {
      setIsNextTransitioning(false);
      onNext();
    }, 180);
  };

  const handleReaction = async (value: ReactionValue) => {
    if (!onReact) {
      return;
    }

    try {
      setReactionPulse(value);
      if (reactionPulseTimeoutRef.current !== null) {
        window.clearTimeout(reactionPulseTimeoutRef.current);
      }
      reactionPulseTimeoutRef.current = window.setTimeout(() => setReactionPulse(null), 280);
      setReactionPending(value);
      await onReact(card, value);
    } finally {
      setReactionPending(null);
    }
  };

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

  const resetSwipe = () => {
    pointerStateRef.current = null;
    setIsDragging(false);
    setSwipeOffset(0);
    setSwipeMomentum(null);
  };

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        resetSwipe();
      }
    };

    window.addEventListener('blur', resetSwipe);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', resetSwipe);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDragging]);

  const finishSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const pointer = pointerStateRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      resetSwipe();
      return;
    }

    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;

    if (Math.abs(deltaX) >= swipeThresholdPx && Math.abs(deltaX) > Math.abs(deltaY)) {
      const direction: SwipeDirection = deltaX > 0 ? 'right' : 'left';
      setIsDragging(false);
      pointerStateRef.current = null;
      setSwipeMomentum(direction);
      setSwipeOffset(direction === 'right' ? 240 : -240);

      if (swipeTimeoutRef.current !== null) {
        window.clearTimeout(swipeTimeoutRef.current);
      }

      swipeTimeoutRef.current = window.setTimeout(() => {
        onSwipe?.(direction);
        setSwipeMomentum(null);
        setSwipeOffset(0);
      }, 140);
      return;
    }

    resetSwipe();
  };

  const handlePointerCancel = () => {
    resetSwipe();
  };

  const handleLostPointerCapture = () => {
    if (pointerStateRef.current) {
      resetSwipe();
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    if (!motionEnabled) {
      return;
    }

    if (swipeEnabled && isDragging) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - bounds.left) / bounds.width) * 100;
    const py = ((event.clientY - bounds.top) / bounds.height) * 100;

    const rotateY = ((px - 50) / 50) * 4;
    const rotateX = ((50 - py) / 50) * 4;

    setTilt({
      x: rotateX,
      y: rotateY,
      px: Math.max(0, Math.min(100, px)),
      py: Math.max(0, Math.min(100, py))
    });
  };

  const handleMouseLeave = () => {
    if (!motionEnabled) {
      return;
    }

    setIsHovering(false);
    setTilt({ x: 0, y: 0, px: 50, py: 50 });
  };

  const handleMouseEnter = () => {
    if (!motionEnabled || isDragging) {
      return;
    }
    setIsHovering(true);
  };

  const hoverScale = !isDragging && !isNextTransitioning && isHovering ? 1.01 : 1;
  const transitionScale = isNextTransitioning ? 0.985 : hoverScale;
  const verticalShift = isNextTransitioning ? 78 : 0;

  const articleStyle: CSSProperties & Record<'--px' | '--py', string> = {
    transform: `${motionEnabled
      ? `translateX(${swipeOffset}px) rotate(${swipeOffset / 30}deg) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
      : `translateX(${swipeOffset}px) rotate(${swipeOffset / 30}deg)`} translateY(${verticalShift}px) scale(${transitionScale})`,
    transition: isDragging
      ? 'none'
      : isNextTransitioning
        ? 'transform 180ms cubic-bezier(0.2, 0.72, 0.2, 1), opacity 180ms ease'
        : swipeMomentum
          ? 'transform 240ms cubic-bezier(0.14, 0.8, 0.25, 1)'
          : 'transform 220ms cubic-bezier(0.2, 0.72, 0.2, 1)',
    opacity: isNextTransitioning ? 0.18 : 1,
    '--px': `${tilt.px}%`,
    '--py': `${tilt.py}%`
  };

  return (
    <article
      className={`card-tilt relative h-[420px] [perspective:1600px] ${swipeEnabled ? 'touch-pan-y cursor-grab select-none' : ''} ${
        isDragging ? 'cursor-grabbing' : ''
      } ${className}`}
      style={articleStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishSwipe}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${
          isFlipped ? '[transform:rotateY(180deg)]' : ''
        } ${motionEnabled && isFlipPulse ? 'scale-[0.992] -translate-y-[1px]' : ''}`}
      >
        <section className={`${cardClass} card-lux absolute inset-0 flex flex-col p-5 [transform:translateZ(0.1px)]`}>
          <header className="mb-4 flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="difficulty-badge" data-difficulty={difficulty}>
                {difficultyLabel(difficulty)}
              </span>
              {mastered && (
                <span className="mastered-check" aria-label="Карточка изучена">
                  ✓
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onToggleMastered && (
                <button
                  type="button"
                  aria-label={mastered ? 'Снять отметку изучено' : 'Отметить как изучено'}
                  onClick={() => onToggleMastered(card)}
                  className="primary-soft-btn"
                >
                  {mastered ? 'Изучено' : 'Освоить'}
                </button>
              )}

              {showActions && onEdit && onDelete && (
                <>
                  <button
                    type="button"
                    aria-label="Редактировать карточку"
                    onClick={() => onEdit(card)}
                    className="action-icon-btn"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label="Удалить карточку"
                    onClick={() => onDelete(card)}
                    className="action-icon-btn border-rose-300/80 text-rose-600 hover:border-rose-400 hover:text-rose-700 dark:border-rose-500/50 dark:text-rose-300"
                  >
                    🗑
                  </button>
                </>
              )}
            </div>
          </header>

          {card.tags.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {card.tags.map((tag) => (
                <span key={tag} className={`tag-chip ${tagCategoryClass(tag)}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {onReact && (
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 px-2 py-1 dark:border-slate-600 dark:bg-[#23293a]/85">
                <button
                  type="button"
                  aria-label="Поставить лайк"
                  onClick={() => void handleReaction(1)}
                  disabled={reactionPending !== null}
                  className={`${reactionButtonBaseClass} ${reactionPulse === 1 ? 'reaction-bounce' : ''} ${
                    userReaction === 1
                      ? 'bg-emerald-500 text-white'
                      : 'text-slate-600/85 hover:bg-emerald-500/15 hover:text-slate-700 dark:text-slate-300'
                  } ${reactionPending !== null ? 'opacity-70' : ''}`}
                >
                  👍 {likesCount}
                </button>
                <button
                  type="button"
                  aria-label="Поставить дизлайк"
                  onClick={() => void handleReaction(-1)}
                  disabled={reactionPending !== null}
                  className={`${reactionButtonBaseClass} ${reactionPulse === -1 ? 'reaction-bounce' : ''} ${
                    userReaction === -1
                      ? 'bg-rose-500 text-white'
                      : 'text-slate-600/85 hover:bg-rose-500/15 hover:text-slate-700 dark:text-slate-300'
                  } ${reactionPending !== null ? 'opacity-70' : ''}`}
                >
                  👎 {dislikesCount}
                </button>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500/70 dark:text-slate-400/70">
                Score: {score > 0 ? `+${score}` : score}
              </span>
            </div>
          )}

          <div
            className={`transition-all duration-300 ${
              isFlipped ? 'translate-y-1 opacity-0' : 'translate-y-0 opacity-100'
            }`}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500/70 dark:text-slate-400/70">Вопрос</p>
            <h3 className="card-headline max-w-[66ch] whitespace-pre-line text-[1.12rem] font-bold leading-8 text-slate-950 dark:text-slate-50 md:text-[1.2rem]">
              {card.question}
            </h3>
          </div>

          <div className="mt-auto pt-4">
            {onNext && showNextOnQuestion ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={handleReveal} className="cta-button px-4 py-3 text-sm">
                  Показать ответ
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className={secondaryActionButtonClass}
                >
                  {nextLabel}
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleReveal} className="cta-button w-full px-4 py-3 text-sm">
                Показать ответ
              </button>
            )}
          </div>
        </section>

        <section
          className={`${cardClass} card-lux absolute inset-0 flex flex-col p-5 [transform:rotateY(180deg)_translateZ(0.1px)]`}
        >
          <div className={`flex h-full flex-col ${isFlipped ? 'answer-reveal' : 'translate-y-2 opacity-0'}`}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500/65 dark:text-slate-400/65">Ответ</p>
            {showReactionsOnBack && onReact && (
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 px-2 py-1 dark:border-slate-600 dark:bg-[#23293a]/85">
                  <button
                    type="button"
                    aria-label="Поставить лайк"
                    onClick={() => void handleReaction(1)}
                    disabled={reactionPending !== null}
                    className={`${reactionButtonBaseClass} ${reactionPulse === 1 ? 'reaction-bounce' : ''} ${
                      userReaction === 1
                        ? 'bg-emerald-500 text-white'
                        : 'text-slate-600/85 hover:bg-emerald-500/15 hover:text-slate-700 dark:text-slate-300'
                    } ${reactionPending !== null ? 'opacity-70' : ''}`}
                  >
                    👍 {likesCount}
                  </button>
                  <button
                    type="button"
                    aria-label="Поставить дизлайк"
                    onClick={() => void handleReaction(-1)}
                    disabled={reactionPending !== null}
                    className={`${reactionButtonBaseClass} ${reactionPulse === -1 ? 'reaction-bounce' : ''} ${
                      userReaction === -1
                        ? 'bg-rose-500 text-white'
                        : 'text-slate-600/85 hover:bg-rose-500/15 hover:text-slate-700 dark:text-slate-300'
                    } ${reactionPending !== null ? 'opacity-70' : ''}`}
                  >
                    👎 {dislikesCount}
                  </button>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500/70 dark:text-slate-400/70">
                  Score: {score > 0 ? `+${score}` : score}
                </span>
              </div>
            )}
            <div className="space-y-3.5">
              {answerBlocks.map((block, index) =>
                block.type === 'list' ? (
                  <ul
                    key={`answer-list-${index}`}
                    className="card-answer list-disc space-y-2 pl-5 text-[0.98rem] leading-7 text-slate-700 dark:text-slate-200"
                  >
                    {block.items.map((item, itemIndex) => (
                      <li key={`${item}-${itemIndex}`} className="marker:text-slate-400 dark:marker:text-slate-500">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p key={`answer-text-${index}`} className="card-answer whitespace-pre-line text-[0.98rem] leading-7 text-slate-700 dark:text-slate-200">
                    {block.text}
                  </p>
                )
              )}
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500/70 dark:text-slate-400/70">Источники</p>
              {card.sources.length === 0 ? (
                <p className="sources-doc text-sm text-slate-500 dark:text-slate-400">Ссылки пока не добавлены</p>
              ) : (
                <ul className="space-y-2">
                  {card.sources.map((source) => {
                    const normalized = normalizeSource(source);
                    const link = isLink(normalized);
                    return (
                      <li key={source} className="sources-doc text-sm">
                        {link ? (
                          <a
                            href={normalized}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-brand-600 underline decoration-brand-300/60 underline-offset-2 transition hover:text-brand-500 dark:text-brand-300 dark:decoration-brand-400/60"
                          >
                            {normalized}
                          </a>
                        ) : (
                          <span className="break-all text-slate-600 dark:text-slate-300">{normalized}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-auto pt-4">
              {onNext ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className={secondaryActionButtonClass}
                  >
                    Вернуться
                  </button>
                  <button type="button" onClick={handleNext} className="cta-button px-3 py-3 text-sm">
                    {nextLabel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleBack}
                  className={`w-full ${secondaryActionButtonClass}`}
                >
                  Вернуться к вопросу
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
