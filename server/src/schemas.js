import { z } from 'zod';
import { STATUSES, SORTS } from './store.js';

const isoDate = z
  .string({ invalid_type_error: 'Must be a date string', required_error: 'Date is required' })
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Must be a valid date')
  .transform((v) => new Date(v).toISOString());

const requiredText = (label, max) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

const optionalText = (label, max) =>
  z
    .string({ invalid_type_error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .optional()
    .default('');

export const createLeadSchema = z.object({
  name: requiredText('Name', 120),
  company: optionalText('Company', 120),
  phone: optionalText('Phone', 40),
});

export const statusSchema = z.object({
  status: z.enum(STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${STATUSES.join(', ')}` }),
  }),
});

export const discussionSchema = z.object({
  note: requiredText('Note', 4000),
  followUpAt: isoDate.nullish().transform((v) => v ?? null),
});

export const listQuerySchema = z.object({
  status: z.enum(['All', ...STATUSES]).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(SORTS).default('activity'),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});
