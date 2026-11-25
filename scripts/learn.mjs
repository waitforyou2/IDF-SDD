#!/usr/bin/env node

/**
 * xingyun-sdd 学习与检视导览引擎（零第三方依赖）
 *
 * 支持子命令：
 * - prepare  : 采集 SDD 变更 / Commit / 分支范围 / CodeHub MR / 指定路径上下文，生成 .isdd-learn/<slug>/context.json
 * - render   : 校验 Subagent 产出的 tour.json，从真实仓库回填精确代码行与亲手共建标记，渲染离线单文件 HTML
 * - open     : 启动即用即停的本地 127.0.0.1 静态预览并自动打开浏览器（规避 file:// 限制）
 * - profile  : 查看跨仓库个人认知账本（~/.xingyun-sdd/learning-profile.yaml）
 * - sync     : 将网页端回传的 JSON 或 Co-Build 实操记录合并写入个人认知账本
 * - help     : 输出 JSON 命令说明
 */

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_TEMPLATE = path.join(PLUGIN_ROOT, 'assets', 'learn', 'template.html');
const LEARN_DIR = '.isdd-learn';
const MAX_DIFF_CHARS = 60_000;

function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message, details = undefined, exitCode = 1) {
  const payload = { ok: false, error: message };
  if (details !== undefined) payload.details = details;
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(exitCode);
}

function parseArgs(tokens) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    if (eq !== -1) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = tokens[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { flags, positionals };
}

function run(command, args, options = {}) {
  const spawnOptions = {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout || 30_000,
    env: { ...process.env, ...(options.env || {}) },
    windowsHide: true,
    shell: false
  };
  let result = spawnSync(command, args, spawnOptions);
  if (process.platform === 'win32' && result.error && ['ENOENT', 'EINVAL'].includes(result.error.code)) {
    result = spawnSync(command, args, { ...spawnOptions, shell: true });
  }
  return result;
}

function safeSlug(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!cleaned || cleaned.includes('..')) {
    fail('无效的导览标识（slug），请使用字母、数字、点、下划线或连字符。');
  }
  return cleaned;
}

function projectRoot(flags) {
  return path.resolve(String(flags.root || process.env.CLAUDE_PROJECT_DIR || process.cwd()));
}

function defaultProfilePath(flags) {
  if (flags['profile-path']) return path.resolve(String(flags['profile-path']));
  if (process.env.ISDD_LEARN_PROFILE) return path.resolve(process.env.ISDD_LEARN_PROFILE);
  return path.join(os.homedir(), '.xingyun-sdd', 'learning-profile.yaml');
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 极简无依赖 YAML 读写（用于 ~/.xingyun-sdd/learning-profile.yaml）
 * 结构：{ mastered: { key: { level, updated_at, source } }, review_needed: { key: { miss_count, updated_at, note } } }
 */
export function loadProfile(filePath) {
  const empty = { mastered: {}, review_needed: {} };
  if (!fs.existsSync(filePath)) return empty;
  const text = fs.readFileSync(filePath, 'utf8');
  // 优先支持 JSON 兼容子集（YAML 1.2 合法超集）或标准缩进 YAML
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        mastered: parsed.mastered && typeof parsed.mastered === 'object' ? parsed.mastered : {},
        review_needed: parsed.review_needed && typeof parsed.review_needed === 'object' ? parsed.review_needed : {}
      };
    } catch {
      return empty;
    }
  }
  const profile = { mastered: {}, review_needed: {} };
  let section = null;
  let currentKey = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const topMatch = rawLine.match(/^(mastered|review_needed):\s*$/);
    if (topMatch) {
      section = topMatch[1];
      currentKey = null;
      continue;
    }
    const keyMatch = rawLine.match(/^  ([^:\s][^:]*):\s*$/);
    if (keyMatch && section) {
      currentKey = keyMatch[1].replace(/^["']|["']$/g, '');
      profile[section][currentKey] = {};
      continue;
    }
    const propMatch = rawLine.match(/^    ([A-Za-z0-9_]+):\s*(.*)$/);
    if (propMatch && section && currentKey) {
      let val = propMatch[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        try { val = JSON.parse(val); } catch { val = val.slice(1, -1); }
      } else if (/^\d+$/.test(val)) {
        val = Number(val);
      }
      profile[section][currentKey][propMatch[1]] = val;
    }
  }
  return profile;
}

export function saveProfile(filePath, profile) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    '# xingyun-sdd 个人跨仓库认知账本（由 scripts/learn.mjs 自动维护）',
    'mastered:'
  ];
  for (const key of Object.keys(profile.mastered || {}).sort()) {
    const entry = profile.mastered[key] || {};
    lines.push(`  ${JSON.stringify(key)}:`);
    lines.push(`    level: ${JSON.stringify(entry.level || 'understood')}`);
    lines.push(`    updated_at: ${JSON.stringify(entry.updated_at || isoDate())}`);
    lines.push(`    source: ${JSON.stringify(entry.source || '')}`);
  }
  lines.push('review_needed:');
  for (const key of Object.keys(profile.review_needed || {}).sort()) {
    const entry = profile.review_needed[key] || {};
    lines.push(`  ${JSON.stringify(key)}:`);
    lines.push(`    miss_count: ${Number(entry.miss_count || 1)}`);
    lines.push(`    updated_at: ${JSON.stringify(entry.updated_at || isoDate())}`);
    lines.push(`    note: ${JSON.stringify(entry.note || '')}`);
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

const LEVEL_RANK = { seen: 1, understood: 2, practiced: 3 };

/**
 * 合并网页回传载荷或 Co-Build 实操记录到个人认知账本
 */
export function mergeProfileSync(profile, payload) {
  const today = isoDate();
  const source = String(payload.change || payload.sourceRef || 'manual');
  const next = {
    mastered: { ...(profile.mastered || {}) },
    review_needed: { ...(profile.review_needed || {}) }
  };

  const applyMaster = (key, level) => {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) return;
    const prev = next.mastered[cleanKey];
    const prevRank = prev ? (LEVEL_RANK[prev.level] || 0) : 0;
    const nextRank = LEVEL_RANK[level] || 2;
    next.mastered[cleanKey] = {
      level: nextRank >= prevRank ? level : prev.level,
      updated_at: today,
      source
    };
    delete next.review_needed[cleanKey];
  };

  for (const key of Array.isArray(payload.mastered) ? payload.mastered : []) {
    applyMaster(key, 'understood');
  }
  for (const key of Array.isArray(payload.practiced) ? payload.practiced : []) {
    applyMaster(key, 'practiced');
  }
  for (const key of Array.isArray(payload.review_needed) ? payload.review_needed : []) {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) continue;
    const prev = next.review_needed[cleanKey];
    next.review_needed[cleanKey] = {
      miss_count: (prev ? Number(prev.miss_count || 0) : 0) + 1,
      updated_at: today,
      note: prev?.note || `来自 ${source} 检视待巩固`
    };
    delete next.mastered[cleanKey];
  }
  return next;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { metadata: {}, body: content };
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      try { val = JSON.parse(val); } catch { val = val.slice(1, -1); }
    }
    metadata[m[1]] = String(val);
  }
  return { metadata, body: content.slice(match[0].length) };
}

function gitOutput(root, args, fallback = '') {
  const res = run('git', args, { cwd: root });
  return res.status === 0 ? (res.stdout || '').trim() : fallback;
}

function filterCodeFiles(files) {
  return files
    .map((f) => f.replaceAll('\\', '/').replace(/^\.\//, ''))
    .filter((f) => f && !f.startsWith('docs/isdd/') && !f.startsWith('.isdd-learn/') && !f.startsWith('.codegraph/'));
}

function parseChangeDiff(root, baseRef) {
  let files = [];
  let diff = '';
  if (baseRef && baseRef !== 'unborn') {
    const check = run('git', ['cat-file', '-t', baseRef], { cwd: root });
    if (check.status === 0) {
      const tracked = gitOutput(root, ['diff', '--name-only', baseRef, '--']).split(/\r?\n/).filter(Boolean);
      const untracked = gitOutput(root, ['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean);
      files = filterCodeFiles([...new Set([...tracked, ...untracked])]);
      diff = gitOutput(root, ['diff', '-U3', baseRef, '--', ...files]);
    }
  }
  if (!files.length) {
    const tracked = gitOutput(root, ['diff', '--name-only', 'HEAD', '--']).split(/\r?\n/).filter(Boolean);
    const untracked = gitOutput(root, ['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean);
    files = filterCodeFiles([...new Set([...tracked, ...untracked])]);
    if (files.length) diff = gitOutput(root, ['diff', '-U3', 'HEAD', '--', ...files]);
  }
  return { files, diff };
}

/**
 * prepare: 统一采集 4 种学习来源上下文（SDD 变更 / Commit / 分支范围 / CodeHub MR / 模块路径）
 */
function prepareContext(root, flags) {
  const profilePath = defaultProfilePath(flags);
  const profile = loadProfile(profilePath);
  let sourceType = 'change';
  let slug = '';
  let sourceRef = '';
  let intent = {};
  let changedFiles = [];
  let diffText = '';
  let reviewDiscussions = [];
  let humanCoBuildHints = [];

  if (flags.change) {
    sourceType = 'change';
    const id = safeSlug(flags.change);
    slug = id;
    sourceRef = `xingyun-sdd · ${id}`;
    const changeDir = path.join(root, 'docs', 'isdd', 'changes', id);
    const specFile = path.join(changeDir, 'spec.md');
    if (!fs.existsSync(specFile)) fail(`找不到 SDD 变更：${id}`, { expected: specFile });
    const spec = parseFrontmatter(fs.readFileSync(specFile, 'utf8'));
    const planFile = path.join(changeDir, 'plan.md');
    const planBody = fs.existsSync(planFile) ? fs.readFileSync(planFile, 'utf8') : '';
    const cobuildFile = path.join(root, LEARN_DIR, id, 'cobuild-lines.json');
    if (fs.existsSync(cobuildFile)) {
      try { humanCoBuildHints = JSON.parse(fs.readFileSync(cobuildFile, 'utf8')); } catch {}
    }
    intent = {
      id,
      title: spec.metadata.title || id,
      mode: spec.metadata.mode || 'standard',
      learning_mode: spec.metadata.learning_mode || 'off',
      spec_excerpt: spec.body.slice(0, 6000),
      plan_excerpt: planBody.slice(0, 6000)
    };
    const parsed = parseChangeDiff(root, spec.metadata.base_ref);
    changedFiles = parsed.files;
    diffText = parsed.diff;
  } else if (flags.commit) {
    sourceType = 'commit';
    const sha = String(flags.commit).trim();
    const resolved = gitOutput(root, ['rev-parse', '--short', sha]);
    if (!resolved) fail(`无法解析 Commit：${sha}`);
    slug = safeSlug(`commit-${resolved}`);
    sourceRef = `git commit ${resolved}`;
    const subject = gitOutput(root, ['show', '-s', '--format=%s%n%b', sha]);
    const files = gitOutput(root, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', sha]).split(/\r?\n/).filter(Boolean);
    changedFiles = filterCodeFiles(files);
    diffText = gitOutput(root, ['show', '--format=', '-U3', sha, '--', ...changedFiles]);
    intent = { title: subject.split(/\r?\n/)[0] || sourceRef, commit_message: subject };
  } else if (flags.range) {
    sourceType = 'range';
    const range = String(flags.range).trim();
    slug = safeSlug(`range-${range}`);
    sourceRef = `git range ${range}`;
    const log = gitOutput(root, ['log', '--oneline', '-n', '20', range]);
    const files = gitOutput(root, ['diff', '--name-only', range]).split(/\r?\n/).filter(Boolean);
    changedFiles = filterCodeFiles(files);
    diffText = gitOutput(root, ['diff', '-U3', range, '--', ...changedFiles]);
    intent = { title: `变更范围 ${range}`, commits: log };
  } else if (flags.mr) {
    sourceType = 'mr';
    const mrArg = String(flags.mr).trim();
    const iidMatch = mrArg.match(/(\d+)\s*$/);
    if (!iidMatch) fail(`无法从 --mr 参数解析 MR 编号：${mrArg}`);
    const iid = iidMatch[1];
    slug = safeSlug(`mr-${iid}`);
    sourceRef = `CodeHub MR #${iid}`;
    const repoFlag = flags.repo ? ['-p', String(flags.repo)] : [];
    const viewRes = run('codehub-cli', ['mr', 'view', ...repoFlag, iid, '--format', 'json'], { cwd: root });
    if (viewRes.status !== 0) {
      fail('无法通过 codehub-cli 获取 MR 信息，请检查认证状态或传入 --repo <org/repo>。', viewRes.stderr || viewRes.stdout);
    }
    const mrInfo = JSON.parse(viewRes.stdout);
    intent = {
      title: mrInfo.title || sourceRef,
      description: String(mrInfo.description || '').slice(0, 6000),
      source_branch: mrInfo.source_branch || '',
      target_branch: mrInfo.target_branch || ''
    };
    const reviewRes = run('codehub-cli', ['mr', 'review', 'list', ...repoFlag, iid, '--format', 'json'], { cwd: root });
    if (reviewRes.status === 0 && reviewRes.stdout.trim()) {
      try {
        const list = JSON.parse(reviewRes.stdout);
        reviewDiscussions = (Array.isArray(list) ? list : []).slice(0, 20).map((item) => ({
          file: item.notes?.[0]?.file_path || null,
          line: item.notes?.[0]?.line || null,
          author: item.notes?.[0]?.author?.username || 'reviewer',
          body: String(item.notes?.[0]?.body || '').slice(0, 500)
        }));
      } catch {}
    }
    if (intent.target_branch && intent.source_branch) {
      const range = `origin/${intent.target_branch}...origin/${intent.source_branch}`;
      const files = gitOutput(root, ['diff', '--name-only', range]).split(/\r?\n/).filter(Boolean);
      changedFiles = filterCodeFiles(files);
      if (changedFiles.length) diffText = gitOutput(root, ['diff', '-U3', range, '--', ...changedFiles]);
    }
  } else if (flags.path) {
    sourceType = 'module';
    const relPath = String(flags.path).replaceAll('\\', '/').replace(/^\.\//, '');
    const absPath = path.resolve(root, relPath);
    if (!absPath.startsWith(path.resolve(root)) || !fs.existsSync(absPath)) {
      fail(`找不到模块路径：${relPath}`);
    }
    slug = safeSlug(`module-${relPath}`);
    sourceRef = `模块考古 · ${relPath}`;
    if (fs.statSync(absPath).isFile()) {
      changedFiles = [relPath];
    } else {
      const listed = gitOutput(root, ['ls-files', '--cached', '--others', '--exclude-standard', '--', relPath]).split(/\r?\n/).filter(Boolean);
      changedFiles = filterCodeFiles(listed).slice(0, 40);
    }
    intent = { title: `存量模块解析：${relPath}`, mode: 'archaeology', target_path: relPath };
  } else {
    fail('prepare 需要指定一种来源：--change <id> | --commit <sha> | --range <A..B> | --mr <iid> | --path <路径>');
  }

  const outDir = path.join(root, LEARN_DIR, slug);
  fs.mkdirSync(outDir, { recursive: true });
  const contextPath = path.join(outDir, 'context.json');
  const tourPath = path.join(outDir, 'tour.json');
  const htmlPath = path.join(outDir, 'index.html');

  const diffTruncated = diffText.length > MAX_DIFF_CHARS;
  const context = {
    slug,
    sourceType,
    sourceRef,
    root,
    intent,
    changedFiles,
    humanCoBuildHints,
    reviewDiscussions,
    diff: diffText.slice(0, MAX_DIFF_CHARS),
    diffTruncated,
    recommendedMode: changedFiles.length >= 3 || intent.mode === 'strict' ? 'cli+html' : 'cli',
    profile: {
      mastered_keys: Object.keys(profile.mastered || {}),
      review_needed_keys: Object.keys(profile.review_needed || {}),
      detail: profile
    }
  };
  fs.writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8');

  emit({
    ok: true,
    action: 'prepare',
    slug,
    sourceType,
    sourceRef,
    changedFilesCount: changedFiles.length,
    recommendedMode: context.recommendedMode,
    contextPath,
    tourPath,
    htmlPath,
    masteredCount: context.profile.mastered_keys.length,
    reviewNeededCount: context.profile.review_needed_keys.length
  });
}

/**
 * 根据 stop 中声明的仓库相对路径与起止行号，精确回填源码行、Diff 标记与亲手共建（humanLines）标记
 */
function hydrateStopCode(repoRoot, stop) {
  if (!stop.file || typeof stop.startLine !== 'number' || typeof stop.endLine !== 'number') {
    fail(`站点 ${stop.id || 'unknown'} 缺少 file/startLine/endLine 字段`);
  }
  const absolute = path.resolve(repoRoot, stop.file);
  const resolvedRoot = path.resolve(repoRoot);
  if (!absolute.startsWith(`${resolvedRoot}${path.sep}`) && absolute !== resolvedRoot) {
    fail(`拒绝读取仓库外文件：${stop.file}`);
  }
  if (!fs.existsSync(absolute)) {
    fail(`找不到源码文件：${stop.file}`);
  }
  const allLines = fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n').split('\n');
  if (stop.startLine < 1 || stop.endLine > allLines.length || stop.startLine > stop.endLine) {
    fail(`站点 ${stop.id} 行号范围无效：${stop.file}:${stop.startLine}-${stop.endLine}（文件共 ${allLines.length} 行）`);
  }

  const addedSet = new Set(stop.addedLines || []);
  const modifiedSet = new Set(stop.modifiedLines || []);
  const humanSet = new Set(stop.humanLines || []);
  const codeLines = [];
  for (let line = stop.startLine; line <= stop.endLine; line += 1) {
    let diff = 'context';
    if (addedSet.has(line)) diff = 'added';
    else if (modifiedSet.has(line)) diff = 'modified';
    const authoredBy = humanSet.has(line) ? 'human' : 'ai';
    codeLines.push({ line, text: allLines[line - 1], diff, authoredBy });
  }

  const annotations = (stop.annotations || []).map((ann, idx) => {
    if (ann.line < stop.startLine || ann.line > stop.endLine) {
      fail(`站点 ${stop.id} 注解行号越界：L${ann.line} 不在 [${stop.startLine}, ${stop.endLine}] 内`);
    }
    return { id: ann.id || `${stop.id}-a${idx + 1}`, ...ann };
  });

  return { ...stop, codeLines, annotations };
}

export function renderTourHtml({ tourPath, repoRoot, outputPath, templatePath = DEFAULT_TEMPLATE }) {
  if (!fs.existsSync(tourPath)) fail(`找不到 tour.json：${tourPath}`);
  if (!fs.existsSync(templatePath)) fail(`找不到 HTML 模板：${templatePath}`);

  const rawTour = JSON.parse(fs.readFileSync(tourPath, 'utf8'));
  if (!rawTour.meta?.title || !Array.isArray(rawTour.stops) || rawTour.stops.length === 0) {
    fail('tour.json 缺少必需的 meta.title 或非空 stops 数组');
  }

  const hydrated = {
    ...rawTour,
    flow: rawTour.flow || { nodes: [], edges: [] },
    stops: rawTour.stops.map((stop) => hydrateStopCode(repoRoot, stop)),
    quiz: Array.isArray(rawTour.quiz) ? rawTour.quiz : [],
    debugCheatsheet: Array.isArray(rawTour.debugCheatsheet) ? rawTour.debugCheatsheet : []
  };

  const safeJson = JSON.stringify(hydrated).replaceAll('<', '\\u003c');
  const template = fs.readFileSync(templatePath, 'utf8');
  const html = template.replace('__TOUR_DATA_JSON__', () => safeJson);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');

  const humanLineCount = hydrated.stops.reduce(
    (sum, s) => sum + s.codeLines.filter((l) => l.authoredBy === 'human').length,
    0
  );
  return {
    outputPath,
    stopCount: hydrated.stops.length,
    quizCount: hydrated.quiz.length,
    humanLineCount
  };
}

function openBrowserUrl(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

/**
 * 创建本地预览与直写 HTTP 服务（可被测试直接导入复用）
 */
export function createPreviewServer({ htmlPath, profilePath, idleSeconds = 600 }) {
  if (!fs.existsSync(htmlPath)) fail(`找不到已渲染的导览页面：${htmlPath}`);
  const content = fs.readFileSync(htmlPath);
  const sessionToken = crypto.randomBytes(16).toString('hex');
  let timer = null;

  const handleRequest = (req, res) => {
    resetIdle();
    const pathname = (req.url || '/').split('?')[0];

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(content);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/capabilities') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ directSync: true, token: sessionToken, profilePath }));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/sync') {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (origin && host && origin !== `http://${host}`) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Cross-origin request rejected' }));
        return;
      }
      if (req.headers['x-isdd-token'] !== sessionToken) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid session token' }));
        return;
      }
      let raw = '';
      let tooLarge = false;
      req.on('data', (chunk) => {
        raw += chunk.toString('utf8');
        if (raw.length > 131_072) {
          tooLarge = true;
          req.destroy?.();
        }
      });
      req.on('end', () => {
        if (tooLarge) return;
        try {
          const payload = JSON.parse(raw || '{}');
          const updated = mergeProfileSync(loadProfile(profilePath), payload);
          saveProfile(profilePath, updated);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: true,
            profilePath,
            mastered_total: Object.keys(updated.mastered).length,
            review_needed_total: Object.keys(updated.review_needed).length
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  };

  const server = http.createServer(handleRequest);

  function resetIdle() {
    if (timer) clearTimeout(timer);
    if (idleSeconds > 0) {
      timer = setTimeout(() => server.close(), idleSeconds * 1000);
      timer.unref?.();
    }
  }

  server.once('close', () => { if (timer) clearTimeout(timer); });
  return { server, handleRequest, sessionToken, resetIdle };
}

/**
 * open: 启动即用即停的 127.0.0.1 静态预览服务，规避企业环境 file:// 策略限制，
 * 并提供受随机会话 Token 保护的本地 POST /api/sync 直写认知账本接口。
 */
function serveAndOpen(root, flags) {
  const htmlPath = flags.file
    ? path.resolve(String(flags.file))
    : path.join(root, LEARN_DIR, safeSlug(flags.slug), 'index.html');
  const profilePath = defaultProfilePath(flags);
  const idleSeconds = Number(flags['idle-seconds'] || 600);
  const { server, resetIdle } = createPreviewServer({ htmlPath, profilePath, idleSeconds });

  server.listen(Number(flags.port || 0), '127.0.0.1', () => {
    const addr = server.address();
    const url = `http://127.0.0.1:${addr.port}/index.html`;
    if (!flags['no-open']) openBrowserUrl(url);
    emit({ ok: true, action: 'open', url, file: htmlPath, profile_path: profilePath, direct_sync: true, idle_seconds: idleSeconds });
    resetIdle();
  });
}

function handleProfile(flags) {
  const filePath = defaultProfilePath(flags);
  const profile = loadProfile(filePath);
  emit({
    ok: true,
    action: 'profile',
    path: filePath,
    mastered_count: Object.keys(profile.mastered).length,
    review_needed_count: Object.keys(profile.review_needed).length,
    profile
  });
}

function handleSync(flags, positionals) {
  const raw = flags.payload || positionals.join(' ').trim();
  if (!raw) fail('sync 必须提供 --payload <JSON>');
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    fail('sync 载荷不是合法 JSON。', err.message);
  }
  const filePath = defaultProfilePath(flags);
  const current = loadProfile(filePath);
  const updated = mergeProfileSync(current, payload);
  saveProfile(filePath, updated);

  emit({
    ok: true,
    action: 'sync',
    profile_path: filePath,
    mastered_total: Object.keys(updated.mastered).length,
    review_needed_total: Object.keys(updated.review_needed).length,
    review_notes_count: Array.isArray(payload.review_notes) ? payload.review_notes.length : 0,
    flagged_bugs_count: Array.isArray(payload.quiz_flagged_bugs) ? payload.quiz_flagged_bugs.length : 0,
    review_notes: payload.review_notes || [],
    quiz_flagged_bugs: payload.quiz_flagged_bugs || []
  });
}

function help() {
  emit({
    ok: true,
    commands: {
      prepare: 'prepare (--change <id> | --commit <sha> | --range <A..B> | --mr <iid> [--repo <org/repo>] | --path <rel>) [--root <path>]',
      render: 'render (--slug <slug> | --tour <tour.json> --out <index.html>) [--root <path>]',
      open: 'open (--slug <slug> | --file <index.html>) [--port <n>] [--no-open] [--root <path>]',
      profile: 'profile [--profile-path <yaml>]',
      sync: 'sync --payload <json> [--profile-path <yaml>]'
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const { flags, positionals } = parseArgs(rest);
  const root = projectRoot(flags);

  switch (command) {
    case 'prepare':
      prepareContext(root, flags);
      break;
    case 'render': {
      const slug = flags.slug ? safeSlug(flags.slug) : null;
      const tourPath = flags.tour
        ? path.resolve(String(flags.tour))
        : (slug ? path.join(root, LEARN_DIR, slug, 'tour.json') : null);
      const outputPath = flags.out
        ? path.resolve(String(flags.out))
        : (slug ? path.join(root, LEARN_DIR, slug, 'index.html') : null);
      if (!tourPath || !outputPath) fail('render 必须提供 --slug <slug> 或同时提供 --tour 和 --out。');
      const res = renderTourHtml({ tourPath, repoRoot: root, outputPath });
      emit({ ok: true, action: 'render', ...res });
      break;
    }
    case 'open':
      serveAndOpen(root, flags);
      break;
    case 'profile':
      handleProfile(flags);
      break;
    case 'sync':
      handleSync(flags, positionals);
      break;
    case 'help':
    case undefined:
      help();
      break;
    default:
      fail(`未知 learn 子命令：${command}`);
  }
}
