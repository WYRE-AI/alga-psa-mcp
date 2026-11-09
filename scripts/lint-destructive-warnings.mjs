#!/usr/bin/env node
// Lint MCP tool definitions for missing destructive-action warnings.
// Usage: node scripts/lint-destructive-warnings.mjs [path ...]
//
// Fleet convention (see the mcp-vendor-scaffolding skill, section 2.7b): a tool
// whose name contains a destructive verb needs BOTH
//   (a) a "⚠ DESTRUCTIVE" or "⚠ HIGH-IMPACT" prefix in its description, and
//   (b) destructiveHint: true.
// This repo declares tools as tool('name', 'description', method, path, tier, ...)
// and derives annotations from the tier (registry.ts annotationsFor; asserted in
// registry.test.ts), so a 'destructive' tier argument satisfies (b). The
// fleet's `name: '...'` + `destructiveHint: true` object style is also accepted.
// Exits 1 if any destructive tool lacks a warning, or if no tool definitions are
// found at all (so the check can never pass vacuously).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DESTRUCTIVE_VERBS = [
  'delete',
  'remove',
  'destroy',
  'wipe',
  'purge',
  'drop',
  'disable',
  'deactivate',
  'suspend',
  'revoke',
  'reset_password',
  'reset_mfa',
  'offboard',
  'terminate',
  'archive',
  'unarchive',
  'quarantine_delete',
  'quarantine_release',
  // Alga-specific irreversible or externally visible actions.
  'merge',
  'finalize',
  'send',
  'approve',
];

const SKIP_PATTERNS = [/_dropdown\b/, /_list\b/, /_search\b/, /_get\b/];

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '.git', 'docs']);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) yield* walk(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
      yield full;
    }
  }
}

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push('.');

// tool('name', ...) or name: 'name'
const NAME = /(?:\btool\(\s*|\bname:\s*)['"]([a-z0-9_]+)['"]/g;

let checked = 0;
let violations = 0;

for (const root of roots) {
  for (const file of walk(resolve(root))) {
    const src = readFileSync(file, 'utf8');
    const starts = [...src.matchAll(NAME)];
    starts.forEach((match, i) => {
      checked++;
      const toolName = match[1];
      if (SKIP_PATTERNS.some((p) => p.test(toolName))) return;
      if (!DESTRUCTIVE_VERBS.some((v) => toolName.includes(v))) return;
      // Only this tool's own definition: up to the next tool name, at most 1200 chars.
      const end = Math.min(starts[i + 1]?.index ?? src.length, match.index + 1200);
      const window = src.slice(match.index, end);
      const hasWarningPrefix = /⚠\s*(DESTRUCTIVE|HIGH-IMPACT)/.test(window);
      const hasDestructiveHint =
        /destructiveHint\s*:\s*true/.test(window) || /,\s*'destructive'\s*[,)]/.test(window);
      if (!hasWarningPrefix || !hasDestructiveHint) {
        violations++;
        const line = src.slice(0, match.index).split('\n').length;
        const missing = [
          !hasWarningPrefix && 'description prefix (⚠ DESTRUCTIVE/HIGH-IMPACT)',
          !hasDestructiveHint && 'destructive tier / destructiveHint: true',
        ]
          .filter(Boolean)
          .join(' + ');
        console.error(`${file}:${line}  ${toolName}  missing: ${missing}`);
      }
    });
  }
}

if (checked === 0) {
  console.error('No tool definitions found; refusing to pass vacuously.');
  process.exit(1);
}
if (violations > 0) {
  console.error(`\n${violations} destructive tool(s) missing warnings.`);
  process.exit(1);
}
console.log(
  `All destructive tools carry the required warnings (${checked} tool definitions checked).`,
);
