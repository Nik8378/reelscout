import { z } from 'zod';

const dataUrl = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp);base64,/, 'Image must be a PNG, JPEG or WebP file')
  .max(11_000_000, 'Image is too large (max ~8 MB)');

export const searchInput = z
  .object({
    q: z.string().trim().max(2000).optional().default(''),
    image: dataUrl.optional(),
    options: z
      .object({
        tiktok: z.boolean().optional(),
        includeSeen: z.boolean().optional(),
      })
      .optional()
      .default({}),
  })
  .refine((v) => v.q.length >= 2 || v.image, { message: 'Enter a product name or link (2+ characters), or upload an image' });

/** Decide whether the text is a URL or a keyword */
export function classifyInput(q) {
  const t = q.trim();
  if (/^https?:\/\//i.test(t)) return { type: 'url', value: t };
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(t)) return { type: 'url', value: `https://${t}` };
  return { type: 'keyword', value: t };
}
