import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const difficultySchema = z.enum(['easy', 'medium', 'hard']);
const reactionSchema = z.union([z.literal(-1), z.literal(1)]);
const numericString = z.string().trim().regex(/^\d+$/);
const normalizedStringArray = z
  .array(nonEmpty)
  .max(30)
  .transform((items) => Array.from(new Set(items.map((item) => item.trim()))));
const optionalTrimmedString = z
  .string()
  .trim()
  .max(255)
  .optional()
  .transform((value) => (value ? value : undefined));

export const createCardSchema = z.object({
  question: nonEmpty,
  answer: nonEmpty,
  sources: normalizedStringArray.optional().default([]),
  tags: normalizedStringArray.optional().default([]),
  difficulty: difficultySchema.optional().default('easy')
});

export const updateCardSchema = z
  .object({
    question: nonEmpty.optional(),
    answer: nonEmpty.optional(),
    sources: normalizedStringArray.optional(),
    tags: normalizedStringArray.optional(),
    difficulty: difficultySchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided'
  });

export const reactCardSchema = z.object({
  value: reactionSchema
});

export const telegramAuthSchema = z.object({
  id: z
    .union([z.number().int().positive().transform(String), numericString])
    .transform((value) => String(value)),
  first_name: nonEmpty.max(255),
  last_name: optionalTrimmedString,
  username: optionalTrimmedString,
  photo_url: optionalTrimmedString,
  auth_date: z.union([z.number().int().positive(), numericString.transform((value) => Number(value))]),
  hash: z.string().trim().regex(/^[a-f0-9]{64}$/iu)
});
