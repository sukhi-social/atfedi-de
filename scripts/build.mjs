// Builds every site at once. Each one writes to its own dist/<name>, so they
// don't touch each other; only postbuild needs all of them done.
import { spawn } from 'node:child_process';

const sites = ['catalog', 'blog', 'kiosk', 'danro', 'preview', 'museum', 'console', 'yum', 'dash', 'translate'];

const run = (cmd, args) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });

const t0 = Date.now();
const results = await Promise.all(
  sites.map(async (site) => {
    const t = Date.now();
    const r = await run('pnpm', ['--filter', site, 'run', 'build']);
    console.log(`${r.code === 0 ? 'ok  ' : 'FAIL'} ${site} ${((Date.now() - t) / 1000).toFixed(1)}s`);
    return { site, ...r };
  }),
);

const failed = results.filter((r) => r.code !== 0);
for (const r of failed) console.error(`\n--- ${r.site} ---\n${r.out}`);
if (failed.length) process.exit(1);

const post = await run('pnpm', ['run', 'postbuild']);
if (post.code !== 0) {
  console.error(post.out);
  process.exit(1);
}
console.log(`built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
