import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { Card, CardPayload, Difficulty } from '../types';

type Props = {
  mode: 'create' | 'edit';
  card: Card | null;
  availableTags: string[];
  onClose: () => void;
  onSubmit: (payload: CardPayload) => Promise<void>;
};

type FormState = {
  question: string;
  answer: string;
  sourcesRaw: string;
  tags: string[];
  difficulty: Difficulty;
  newTag: string;
};

function uniqStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function CardFormModal({ mode, card, availableTags, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>({
    question: '',
    answer: '',
    sourcesRaw: '',
    tags: [],
    difficulty: 'easy',
    newTag: ''
  });
  const [localTagOptions, setLocalTagOptions] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ question?: string; answer?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const title = mode === 'create' ? 'Добавить карточку' : 'Редактировать карточку';

  useEffect(() => {
    const initialTags = card?.tags ?? [];

    setForm({
      question: card?.question ?? '',
      answer: card?.answer ?? '',
      sourcesRaw: card?.sources.join('\n') ?? '',
      tags: uniqStrings(initialTags),
      difficulty: card?.difficulty ?? 'easy',
      newTag: ''
    });

    setLocalTagOptions(uniqStrings([...availableTags, ...initialTags]));
  }, [card, availableTags]);

  const payload = useMemo<CardPayload>(() => {
    const sources = form.sourcesRaw
      .split(/\n|,/)
      .map((source) => source.trim())
      .filter(Boolean);

    return {
      question: form.question.trim(),
      answer: form.answer.trim(),
      sources: uniqStrings(sources),
      tags: uniqStrings(form.tags),
      difficulty: form.difficulty
    };
  }, [form]);

  const toggleTag = (tag: string) => {
    setForm((prev) => {
      if (prev.tags.some((entry) => entry.toLowerCase() === tag.toLowerCase())) {
        return {
          ...prev,
          tags: prev.tags.filter((entry) => entry.toLowerCase() !== tag.toLowerCase())
        };
      }

      return {
        ...prev,
        tags: uniqStrings([...prev.tags, tag])
      };
    });
  };

  const removeTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((entry) => entry.toLowerCase() !== tag.toLowerCase())
    }));
  };

  const addCustomTag = () => {
    const nextTag = form.newTag.trim();
    if (!nextTag) {
      return;
    }

    setLocalTagOptions((prev) => uniqStrings([...prev, nextTag]));
    setForm((prev) => ({
      ...prev,
      tags: uniqStrings([...prev.tags, nextTag]),
      newTag: ''
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: { question?: string; answer?: string } = {};
    if (!payload.question) {
      nextErrors.question = 'Поле вопроса обязательно';
    }
    if (!payload.answer) {
      nextErrors.answer = 'Поле ответа обязательно';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      setSubmitError(null);
      setIsSubmitting(true);
      await onSubmit(payload);
      onClose();
    } catch (error) {
      setSubmitError((error as Error).message || 'Не удалось сохранить карточку');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-[#1d2231]">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:text-slate-200"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="grid gap-4 p-5">
          <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Вопрос
            <textarea
              value={form.question}
              onChange={(event) => setForm((prev) => ({ ...prev, question: event.target.value }))}
              rows={3}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-brand-400 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-100"
            />
            {errors.question && <span className="text-sm text-rose-600 dark:text-rose-300">{errors.question}</span>}
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Ответ
            <textarea
              value={form.answer}
              onChange={(event) => setForm((prev) => ({ ...prev, answer: event.target.value }))}
              rows={4}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-brand-400 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-100"
            />
            {errors.answer && <span className="text-sm text-rose-600 dark:text-rose-300">{errors.answer}</span>}
          </label>

          <section className="grid gap-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Теги</p>
            <div className="flex flex-wrap gap-2">
              {localTagOptions.map((tag) => {
                const isSelected = form.tags.some((entry) => entry.toLowerCase() === tag.toLowerCase());
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      isSelected
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-200'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={form.newTag}
                onChange={(event) => setForm((prev) => ({ ...prev, newTag: event.target.value }))}
                placeholder="Новый тег"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-brand-400 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-100"
              />
              <button
                type="button"
                onClick={addCustomTag}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-200"
              >
                Добавить тег
              </button>
            </div>

            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-300/60 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
                  >
                    {tag}
                    <button type="button" aria-label={`Удалить тег ${tag}`} onClick={() => removeTag(tag)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Уровень сложности
            <select
              value={form.difficulty}
              onChange={(event) => setForm((prev) => ({ ...prev, difficulty: event.target.value as Difficulty }))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-brand-400 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-100"
            >
              <option value="easy">Junior</option>
              <option value="medium">Mid</option>
              <option value="hard">Senior</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Источники (по одному в строке или через запятую)
            <textarea
              value={form.sourcesRaw}
              onChange={(event) => setForm((prev) => ({ ...prev, sourcesRaw: event.target.value }))}
              rows={3}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-brand-400 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-100"
            />
          </label>

          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a] dark:text-slate-200"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {isSubmitting ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>

          {submitError && <p className="text-sm text-rose-600 dark:text-rose-300">{submitError}</p>}
        </form>
      </div>
    </div>
  );
}
