// Reverse-engineering knowledge retrieve — same markdown corpus as Claw.
// Canon pattern: knowledge/reverse-engineering/*.md (README is the map).
// Separate from BOS-OMEGA so Trinity retrieve stays clean.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const RE_TOPIC_RE = /\b(ghidra|radare2?|r2\b|rizin|cutter|ida\s*pro|hex-rays|binary\s*ninja|x64dbg|dnspy|imhex|angr|capstone|keystone|unicorn|reverse\s*engineer|binary\s*analysis|triage)\b/i;

const NOTES = [
  'playbook', 'ghidra', 'radare2', 'rizin', 'cutter', 'ida-pro', 'binary-ninja',
  'x64dbg', 'dnspy', 'imhex', 'angr', 'capstone', 'keystone', 'unicorn',
];

function defaultCorpusDir() {
  return resolve(process.cwd(), 'knowledge', 'reverse-engineering');
}

export function isReTopic(text) {
  return RE_TOPIC_RE.test(String(text || ''));
}

export function reCorpusDir(dir) {
  const root = dir || defaultCorpusDir();
  return existsSync(join(root, 'playbook.md')) ? root : null;
}

export function listReNotes(dir) {
  const root = reCorpusDir(dir);
  if (!root) return [];
  return readdirSync(root).filter((name) => name.endsWith('.md')).sort();
}

export function retrieveReKnowledge({ query = '', topK = 6, corpusDir } = {}) {
  const root = reCorpusDir(corpusDir);
  const q = String(query || '').toLowerCase().trim();
  const tokens = q ? q.split(/[^a-z0-9_+.-]+/).filter((t) => t.length > 1) : [];
  const files = root
    ? readdirSync(root).filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    : NOTES.map((id) => `${id}.md`);
  const hits = [];
  for (const file of files) {
    const id = file.replace(/\.md$/i, '');
    let body = '';
    if (root && existsSync(join(root, file))) body = readFileSync(join(root, file), 'utf8');
    const hay = `${id} ${body}`.toLowerCase();
    let score = q ? 0 : id === 'playbook' ? 3 : 1;
    for (const token of tokens) {
      if (id.includes(token)) score += 5;
      if (hay.includes(token)) score += 2;
    }
    if (q && score <= 0) continue;
    hits.push({
      id,
      score,
      preview: body.replace(/\s+/g, ' ').trim().slice(0, 900),
    });
  }
  hits.sort((a, b) => b.score - a.score);
  const limit = Math.max(1, Math.min(14, Number(topK) || 6));
  return {
    ok: true,
    tool: 're_knowledge',
    corpus_dir: root,
    files: listReNotes(root || undefined),
    query: q,
    hits: hits.slice(0, limit),
    note: 'Local RE notes. IDA Pro / Binary Ninja are knowledge-only. Practical triage is Claw re_triage / re_radare2 in E2B.',
  };
}
