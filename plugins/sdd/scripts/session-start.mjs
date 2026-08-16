#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

async function readInput() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function frontmatter(file) {
  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!item) continue;
    result[item[1]] = item[2].trim().replace(/^"|"$/g, '');
  }
  return result;
}

const input = await readInput();
const root = path.resolve(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
const sdd = path.join(root, '.sdd');
if (!fs.existsSync(path.join(sdd, 'repository.yaml'))) process.exit(0);

const changesDirectory = path.join(sdd, 'changes');
const active = [];
if (fs.existsSync(changesDirectory)) {
  for (const entry of fs.readdirSync(changesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(changesDirectory, entry.name, 'spec.md');
    if (!fs.existsSync(file)) continue;
    const metadata = frontmatter(file);
    if (metadata.state && metadata.state !== 'DONE') {
      active.push(`${metadata.id || entry.name}:${metadata.state}:${metadata.mode || 'standard'}`);
    }
  }
}

const graphReady = fs.existsSync(path.join(root, '.codegraph'));
const summary = [
  '当前仓库使用 IDF-SDD 工作流。',
  `CodeGraph 索引：${graphReady ? '已存在' : '缺失；进行结构性代码工作前请执行 /sdd:init'}。`,
  active.length ? `进行中的变更：${active.join(', ')}。` : '当前没有进行中的 SDD 变更。',
  '推进阶段前先阅读 .sdd/policy.md。结构性代码问题优先使用 CodeGraph，再使用 grep 或逐文件读取。无法确定当前变更时执行 /sdd:status。'
].join(' ');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: summary
  }
}));
