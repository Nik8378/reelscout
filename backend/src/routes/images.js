import { Router } from 'express';
import { readImage } from '../services/imageStore.js';

export const imagesRouter = Router();

imagesRouter.get('/:file', (req, res) => {
  const m = req.params.file.match(/^([a-f0-9]{40})\.jpg$/);
  const buf = m && readImage(m[1]);
  if (!buf) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Image not found' } });
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('jpeg').send(buf);
});
