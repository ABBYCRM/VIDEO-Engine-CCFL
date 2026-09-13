import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isReTopic, listReNotes, retrieveReKnowledge } from '../lib/re_knowledge.js';

const pack = resolve(process.cwd(), 'knowledge', 'reverse-engineering');

test('RE corpus files exist next to BOS-OMEGA', () => {
  assert.equal(existsSync(join(pack, 'playbook.md')), true);
  assert.equal(existsSync(join(pack, 'ghidra.md')), true);
  const files = listReNotes();
  assert.ok(files.includes('radare2.md'));
  assert.ok(files.includes('ida-pro.md'));
});

test('re_knowledge retrieve hits Ghidra notes', () => {
  assert.equal(isReTopic('run ghidra headless'), true);
  const result = retrieveReKnowledge({ query: 'ghidra', topK: 4 });
  assert.equal(result.ok, true);
  assert.ok(result.hits.some((h) => h.id === 'ghidra'));
  assert.match(JSON.stringify(result), /not embedded|headless|Ghidra/i);
});
