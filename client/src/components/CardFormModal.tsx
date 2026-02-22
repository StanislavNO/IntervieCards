import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { Card, CardPayload } from '../types';

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
      tags: uniqStrings(form.tags)
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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card">
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Вопрос
            <textarea
              value={form.question}
              onChange={(event) => setForm((prev) => ({ ...prev, question: event.target.value }))}
              rows={3}
            />
            {errors.question && <span className="field-error">{errors.question}</span>}
          </label>

          <label>
            Ответ
            <textarea
              value={form.answer}
              onChange={(event) => setForm((prev) => ({ ...prev, answer: event.target.value }))}
              rows={4}
            />
            {errors.answer && <span className="field-error">{errors.answer}</span>}
          </label>

          <div className="tags-editor">
            <strong>Теги</strong>
            <div className="tag-options">
              {localTagOptions.map((tag) => {
                const isSelected = form.tags.some((entry) => entry.toLowerCase() === tag.toLowerCase());
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`tag-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="tag-create-row">
              <input
                type="text"
                value={form.newTag}
                onChange={(event) => setForm((prev) => ({ ...prev, newTag: event.target.value }))}
                placeholder="Новый тег"
              />
              <button type="button" className="secondary-button" onClick={addCustomTag}>
                Добавить тег
              </button>
            </div>

            {form.tags.length > 0 && (
              <div className="selected-tags">
                {form.tags.map((tag) => (
                  <span key={tag} className="tag-pill">
                    {tag}
                    <button type="button" aria-label={`Удалить тег ${tag}`} onClick={() => removeTag(tag)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <label>
            Источники (по одному в строке или через запятую)
            <textarea
              value={form.sourcesRaw}
              onChange={(event) => setForm((prev) => ({ ...prev, sourcesRaw: event.target.value }))}
              rows={3}
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
          {submitError && <span className="field-error">{submitError}</span>}
        </form>
      </div>
    </div>
  );
}
