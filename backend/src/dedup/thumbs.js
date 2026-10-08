import PQueue from 'p-queue';
import { safeFetch } from '../utils/ssrf.js';
import { storeImage, readImage } from '../services/imageStore.js';
import { dHash } from './hash.js';

const queue = new PQueue({ concurrency: 8 });

/**
 * Downloads each thumbnail once, stores a local copy (platform CDN links expire and block hotlinking),
 * and computes its perceptual hashes. Mutates v: thumbHash, thumbPath, thumbBuf, phash, phashFlip.
 */
export async function attachThumbnails(videos) {
  await Promise.all(
    videos.map((v) =>
      queue.add(async () => {
        if (!v.thumbnail) return;
        try {
          let buf;
          if (v.thumbnail.startsWith('data:')) buf = Buffer.from(v.thumbnail.split(',')[1], 'base64');
          else {
            const res = await safeFetch(v.thumbnail, {
              timeoutMs: 12000,
              maxBytes: 4_000_000,
              headers: { accept: 'image/*', referer: '' },
            });
            if (res.status !== 200) return;
            buf = res.body;
          }
          const img = await storeImage(buf);
          v.thumbHash = img.hash;
          v.thumbPath = img.path;
          v.thumbBuf = readImage(img.hash);
          [v.phash, v.phashFlip] = await Promise.all([dHash(v.thumbBuf), dHash(v.thumbBuf, { flip: true })]);
        } catch {
          /* missing thumbnail -> scored as "no thumbnail" and marked below threshold */
        }
      }),
    ),
  );
  return videos;
}
