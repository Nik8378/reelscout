import fs from 'node:fs';
export default function setup() {
  for (const f of ['data/test.db', 'data/test.db-wal', 'data/test.db-shm']) fs.rmSync(f, { force: true });
}
