import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = import.meta.dir;
const DIST = join(ROOT, 'dist');
const ENTRIES = [
  { input: 'src/background.ts', outputDir: '', outputName: 'background.js' },
  { input: 'src/sidepanel.ts', outputDir: 'sidepanel', outputName: 'script.js' },
] as const;
const STATIC_PATHS = ['manifest.json', 'images', 'sidepanel'] as const;

async function buildEntry(entry: typeof ENTRIES[number]): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(ROOT, entry.input)],
    target: 'browser',
    format: 'iife',
    minify: true,
    sourcemap: 'none',
    naming: entry.outputName,
    outdir: join(DIST, entry.outputDir),
  });

  if (result.success) return;
  for (const log of result.logs) console.error(log);
  throw new Error(`构建失败：${entry.input}`);
}

async function build(): Promise<void> {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await Promise.all(ENTRIES.map(buildEntry));

  for (const path of STATIC_PATHS) {
    await cp(join(ROOT, path), join(DIST, path), { recursive: true });
  }

  console.log(`已构建到 ${DIST}`);
}

await build();
