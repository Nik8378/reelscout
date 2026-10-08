// Lists the Gemini models your key can use, in the order the brain will fall back through them
import { listModels } from '../src/brain/gemini.js';
import { config } from '../src/config.js';
console.log('Configured GEMINI_MODEL:', config.GEMINI_MODEL);
console.log('Available (fallback order):', await listModels());
