#!/usr/bin/env node
/**
 * Build a portable, publishable `ccedit` package into ./dist.
 *
 * Strategy: esbuild bundles the workspace code (@ccedit/core, /shared,
 * /tui) into a single self-contained `dist/ccedit.js`, while the npm
 * runtime deps (ink, react, commander) stay EXTERNAL — they are declared
 * in the generated dist/package.json and installed normally. This avoids
 * bundling Ink's yoga/wasm internals (fragile) and keeps the published
 * tarball tiny, while still letting `npx ccedit` work anywhere.
 *
 * Publish flow (the maintainer runs the last step):
 *   pnpm run release      # builds + stages ./dist
 *   npm publish ./dist
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const ENTRY = path.join(ROOT, 'packages', 'tui', 'dist', 'index.js');
const OUTPUT = path.join(DIST_DIR, 'ccedit.js');

const rootPkg = require(path.join(ROOT, 'package.json'));

// Runtime deps that must NOT be bundled (declared in dist/package.json).
const RUNTIME_DEPS = {
  ink: '^7.0.0',
  react: '^19.0.0',
  commander: '^14.0.0',
};
// Bare specifiers to keep external. Subpaths (react/jsx-runtime) and Ink's
// own transitive deps are listed so esbuild never tries to inline them.
const EXTERNAL = [
  'commander',
  'ink',
  'ink-text-input',
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-devtools-core',
  'yoga-layout',
];

console.log('Building ccedit...\n');

console.log('1. Cleaning dist...');
fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

console.log('2. Building workspace packages (tsc)...');
execSync('pnpm run build', { stdio: 'inherit', cwd: ROOT });

if (!fs.existsSync(ENTRY)) {
  console.error(`Entry point not found: ${ENTRY}`);
  process.exit(1);
}

console.log('3. Bundling with esbuild...');
esbuild.buildSync({
  entryPoints: [ENTRY],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: EXTERNAL,
  outfile: OUTPUT,
  // The entry (src/index.tsx) already carries `#!/usr/bin/env node`, which
  // esbuild preserves as the first line — so we do NOT add a banner (that
  // would produce a duplicate, invalid shebang on line 2).
  legalComments: 'none',
});
fs.chmodSync(OUTPUT, 0o755);

console.log('4. Generating dist/package.json...');
const distPkg = {
  name: 'ccedit',
  version: rootPkg.version,
  description: rootPkg.description,
  type: 'module',
  bin: { ccedit: './ccedit.js' },
  files: ['ccedit.js', 'README.md'],
  dependencies: RUNTIME_DEPS,
  engines: { node: '>=22' },
  keywords: ['claude', 'claude-code', 'session', 'editor', 'tui', 'jsonl', 'cli'],
  repository: { type: 'git', url: 'git+https://github.com/grtsinry43/ccedit.git' },
  author: rootPkg.author,
  license: rootPkg.license,
};
fs.writeFileSync(
  path.join(DIST_DIR, 'package.json'),
  JSON.stringify(distPkg, null, 2) + '\n',
);

console.log('5. Copying README...');
const readme = path.join(ROOT, 'README.md');
if (fs.existsSync(readme)) {
  fs.copyFileSync(readme, path.join(DIST_DIR, 'README.md'));
}

const sizeKb = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
console.log(`\n✅ Build complete — staged ./dist (${distPkg.name}@${distPkg.version}, ${sizeKb} kB)`);
console.log('   Test locally:  node dist/ccedit.js --help');
console.log('   Publish:       npm publish ./dist');
