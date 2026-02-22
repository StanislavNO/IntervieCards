import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const normalizedStringArray = z
  .array(nonEmpty)
  .max(30)
  .transform((items) => Array.from(new Set(items.map((item) => item.trim()))));

export const createCardSchema = z.object({
  question: nonEmpty,
  answer: nonEmpty,
  sources: normalizedStringArray.optional().default([]),
  tags: normalizedStringArray.optional().default([])
});

export const updateCardSchema = z
  .object({
    question: nonEmpty.optional(),
    answer: nonEmpty.optional(),
    sources: normalizedStringArray.optional(),
    tags: normalizedStringArray.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided'
  });
