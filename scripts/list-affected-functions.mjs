import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Read-only deployment inventory. Includes tracked changes, untracked files,
// transitive local imports, and changed per-function config sections.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const baseFlag = process.argv.indexOf('--base');
if (baseFlag !== -1 && (!process.argv[baseFlag + 1] || process.argv[baseFlag + 1].startsWith('--'))) throw new Error('Supply a revision after --base.');
const base = baseFlag === -1 ? 'HEAD' : process.argv[baseFlag + 1];
const lines = value => value.split(/\r?\n/).filter(Boolean);
const changed = new Set([
  ...lines(git('diff', '--name-only', base, '--')),
  ...lines(git('ls-files', '--others', '--exclude-standard')),
].map(file => file.replaceAll('\\', '/')));
const functionsRoot = path.join(root, 'supabase/functions');
const normalize = file => path.relative(root, file).replaceAll('\\', '/');
const resolveImport = (parent, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(parent), specifier);
  return [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, path.join(base, 'index.ts'), path.join(base, 'index.js')]
    .find(file => fs.existsSync(file) && fs.statSync(file).isFile()) ?? null;
};
const dependencies = (file, found = new Set()) => {
  if (found.has(file)) return found;
  found.add(file);
  const source = fs.readFileSync(file, 'utf8');
  const imports = /(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?|\bimport\s*\()\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(imports)) {
    const target = resolveImport(file, match[1]);
    if (target) dependencies(target, found);
  }
  return found;
};
const configSections = source => {
  const result = new Map();
  let current;
  for (const line of source.split(/\r?\n/)) {
    const section = /^\[functions\.([^\]]+)\]\s*$/.exec(line);
    if (section) { current = section[1]; result.set(current, []); }
    else if (/^\[/.test(line)) current = undefined;
    else if (current && line.trim() && !line.trim().startsWith('#')) result.get(current).push(line.trim());
  }
  return new Map([...result].map(([name, value]) => [name, value.join('\n')]));
};
const configured = new Set();
if (changed.has('supabase/config.toml')) {
  const before = configSections(git('show', `${base}:supabase/config.toml`));
  const after = configSections(fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8'));
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(name) !== after.get(name)) configured.add(name);
  }
}
const affected = [];
for (const entry of fs.readdirSync(functionsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
  const index = path.join(functionsRoot, entry.name, 'index.ts');
  if (!fs.existsSync(index)) continue;
  const causes = [...dependencies(index)].map(normalize).filter(file => changed.has(file));
  if (configured.has(entry.name)) causes.push('supabase/config.toml');
  if (causes.length) affected.push({ name: entry.name, causes: [...new Set(causes)].sort() });
}
affected.sort((a, b) => a.name.localeCompare(b.name));
if (process.argv.includes('--json')) console.log(JSON.stringify({ base, changedFiles: [...changed].sort(), affected }, null, 2));
else if (process.argv.includes('--names')) console.log(affected.map(item => item.name).join('\n'));
else for (const item of affected) console.log(`${item.name}\n  ${item.causes.join('\n  ')}`);
