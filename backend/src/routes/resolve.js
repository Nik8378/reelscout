import { Router } from 'express';
import { searchInput, classifyInput } from '../schemas.js';
import { resolveProduct } from '../services/productResolver.js';

export const resolveRouter = Router();

// Debug/preview endpoint: resolve the product context without running a full search
resolveRouter.post('/', async (req, res, next) => {
  try {
    const input = searchInput.parse(req.body);
    const product = await resolveProduct({ ...classifyInput(input.q), image: input.image });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});
