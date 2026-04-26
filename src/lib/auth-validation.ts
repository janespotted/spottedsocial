import { z } from 'zod';

export const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(10, 'Phone number must include country code (e.g. +1234567890)')
    .max(20, 'Phone number is too long')
    .regex(/^\+\d{9,19}$/, 'Invalid phone number format. Include country code (e.g. +1234567890)'),
});

export type PhoneInput = z.infer<typeof phoneSchema>;
