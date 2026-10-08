// Usage: node --env-file=../.env scripts/brain-check.js "<product url or name>" [path/to/image.jpg]
import fs from 'node:fs';
import { classifyInput } from '../src/schemas.js';
import { resolveProduct } from '../src/services/productResolver.js';
import { analyzeProduct, queryLadder } from '../src/brain/analyze.js';
import { scoreCandidates } from '../src/brain/verify.js';
import { readImage } from '../src/services/imageStore.js';

const [q, imgPath] = process.argv.slice(2);
if (!q) {
  console.log('Usage: node --env-file=../.env scripts/brain-check.js "<url or name>" [image.jpg]');
  process.exit(1);
}
const image = imgPath ? `data:image/jpeg;base64,${fs.readFileSync(imgPath).toString('base64')}` : undefined;

const product = await resolveProduct({ ...classifyInput(q), image });
console.log('\nPRODUCT:', { title: product.title, brand: product.brand, source: product.source, image: product.imagePath });
const analysis = await analyzeProduct(product);
console.log('\nATTRIBUTES:', JSON.stringify({ ...analysis, queries: undefined }, null, 2));
console.log('\nQUERY LADDER:', queryLadder(analysis, product));

if (product.imageHash) {
  // sanity check: the product image compared with itself should score ~95-100
  const self = readImage(product.imageHash);
  const scores = await scoreCandidates({
    product,
    analysis,
    candidates: [{ id: 'self', thumbBuf: self, caption: product.title }],
  });
  console.log('\nSELF-MATCH (should be 90+):', scores.get('self'));
}
process.exit(0);
