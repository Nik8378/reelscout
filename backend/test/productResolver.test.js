import { describe, it, expect } from 'vitest';
import { parseProductHtml } from '../src/services/productResolver.js';
import { classifyInput } from '../src/schemas.js';

describe('parseProductHtml', () => {
  it('reads JSON-LD Product inside @graph', () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Skull Oversized Tee","description":"<p>Heavy cotton</p>","image":["//cdn.shop.com/a.jpg"],"brand":{"name":"Acme"},"offers":{"price":"999"}}]}</script></head></html>`;
    const p = parseProductHtml(html, 'https://shop.com/products/x');
    expect(p).toMatchObject({ title: 'Skull Oversized Tee', description: 'Heavy cotton', image: 'https://cdn.shop.com/a.jpg', brand: 'Acme', price: '999', source: 'json-ld' });
  });
  it('falls back to Amazon DOM', () => {
    const html = `<span id="productTitle"> Protein Dark Chocolate 70% </span><img id="landingImage" data-a-dynamic-image='{"https://m.media-amazon.com/i.jpg":[500,500]}'>`;
    const p = parseProductHtml(html, 'https://www.amazon.in/dp/B0');
    expect(p.title).toBe('Protein Dark Chocolate 70%');
    expect(p.image).toBe('https://m.media-amazon.com/i.jpg');
    expect(p.source).toBe('amazon-dom');
  });
  it('falls back to Open Graph with relative image', () => {
    const html = `<meta property="og:title" content="Vitamin C Serum"><meta property="og:image" content="/img/serum.png">`;
    const p = parseProductHtml(html, 'https://brand.com/p/serum');
    expect(p).toMatchObject({ title: 'Vitamin C Serum', image: 'https://brand.com/img/serum.png', source: 'open-graph' });
  });
});

describe('classifyInput', () => {
  it('detects URLs and keywords', () => {
    expect(classifyInput('https://a.com/products/x').type).toBe('url');
    expect(classifyInput('www.amazon.in/dp/B0XYZ').value).toBe('https://www.amazon.in/dp/B0XYZ');
    expect(classifyInput('protein dark chocolate').type).toBe('keyword');
  });
});
