import fs from 'node:fs';
import path from 'node:path';

const target = (process.argv[2] || '').toLowerCase().replace(/^--/, '');

if (target !== 'dev' && target !== 'prod') {
  console.error('\x1b[31m[ERROR] Invalid environment specified.\x1b[0m');
  console.log('Usage:');
  console.log('  pnpm env:dev   (or: tsx scripts/switch-env.ts dev)');
  console.log('  pnpm env:prod  (or: tsx scripts/switch-env.ts prod)');
  process.exit(1);
}

const rootDir = process.cwd();
const sourceFileName = target === 'dev' ? '.env.dev' : '.env.prod';
const sourcePath = path.join(rootDir, sourceFileName);
const destinationPath = path.join(rootDir, '.env');

if (!fs.existsSync(sourcePath)) {
  console.error(
    `\x1b[31m[ERROR] Source environment file '${sourceFileName}' does not exist.\x1b[0m`,
  );
  process.exit(1);
}

fs.copyFileSync(sourcePath, destinationPath);

const envLabel =
  target === 'dev' ? '\x1b[32mDEVELOPMENT (local)\x1b[0m' : '\x1b[33mPRODUCTION\x1b[0m';
console.log(`\n\x1b[36m✔ Active environment switched to:\x1b[0m ${envLabel}`);
console.log(`  Source:      ${sourceFileName}`);
console.log(`  Destination: .env\n`);
