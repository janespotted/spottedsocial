import { z } from 'zod';

// Post validation schema
export const postSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, { message: 'Caption cannot be empty' })
    .max(500, { message: 'Caption must be less than 500 characters' }),
  venue_name: z
    .string()
    .trim()
    .max(200, { message: 'Venue name must be less than 200 characters' })
    .optional()
    .nullable(),
});

// Comment validation schema
export const commentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, { message: 'Comment cannot be empty' })
    .max(500, { message: 'Comment must be less than 500 characters' }),
});

// Yap message validation schema
export const yapMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, { message: 'Message cannot be empty' })
    .max(280, { message: 'Message must be less than 280 characters' }),
});


// Yap comment validation schema
export const yapCommentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, { message: 'Comment cannot be empty' })
    .max(500, { message: 'Comment must be less than 500 characters' }),
});

// Validate post text and return result
export function validatePostText(text: string): { success: boolean; error?: string; data?: string } {
  const result = postSchema.shape.text.safeParse(text);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.errors[0]?.message || 'Invalid post text' };
}

// Validate comment text and return result
export function validateCommentText(text: string): { success: boolean; error?: string; data?: string } {
  const result = commentSchema.shape.text.safeParse(text);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.errors[0]?.message || 'Invalid comment' };
}

// Validate yap message text
export function validateYapText(text: string): { success: boolean; error?: string; data?: string } {
  const result = yapMessageSchema.shape.text.safeParse(text);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.errors[0]?.message || 'Invalid message' };
}


// Validate yap comment text
export function validateYapCommentText(text: string): { success: boolean; error?: string; data?: string } {
  const result = yapCommentSchema.shape.text.safeParse(text);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.errors[0]?.message || 'Invalid comment' };
}
