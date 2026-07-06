import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const bytes = gzipSync(readFileSync(new URL('../packages/inhibitor/dist/index.js', import.meta.url))).byteLength;
const max = 15 * 1024;
console.log(`Facade gzip: ${bytes} bytes (target ${max})`);
if (bytes > max) process.exitCode = 1;
