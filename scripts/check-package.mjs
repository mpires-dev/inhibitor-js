import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const pkg = join(root, 'packages/inhibitor');
const temp = mkdtempSync(join(tmpdir(), 'inhibitor-consumer-'));
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}
try {
  const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  if (manifest.dependencies && Object.keys(manifest.dependencies).length) throw new Error('Published facade must have no private runtime dependencies');
  const pack = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temp], pkg))[0];
  const names = pack.files.map(file => file.path);
  if (!names.includes('LICENSE') || !names.includes('README.md') || names.some(name => /\.map$|test|src\//.test(name))) throw new Error(`Unexpected tarball files: ${names.join(', ')}`);
  run('npm', ['install', '--prefix', temp, '--ignore-scripts', '--no-audit', '--no-fund', join(temp, pack.filename)]);
  writeFileSync(join(temp, 'consumer.ts'), 'import { Inhibitor } from "inhibitor-js"; import type { SessionSnapshot, Collector } from "inhibitor-js"; const sdk = new Inhibitor(); const state: string = sdk.getState(); let data: SessionSnapshot | undefined; let collector: Collector | undefined; void state; void data; void collector;');
  writeFileSync(join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'], noEmit: true }, files: ['consumer.ts'] }));
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temp, 'tsconfig.json')]);
  run(process.execPath, ['--input-type=module', '-e', 'import("inhibitor-js").then(({Inhibitor}) => { if (new Inhibitor().getState() !== "idle") process.exit(1) })'], temp);
  console.log(`Consumer import, types, SSR, and tarball contents OK (${pack.size} bytes)`);
} finally { rmSync(temp, { recursive: true, force: true }); }
