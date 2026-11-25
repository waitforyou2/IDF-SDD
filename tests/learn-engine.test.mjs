import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createPreviewServer } from '../scripts/learn.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEARN_CLI = path.join(ROOT, 'scripts', 'learn.mjs');
const SDD_CLI = path.join(ROOT, 'scripts', 'sdd.mjs');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    windowsHide: true
  });
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xingyun-learn-test-'));
  run('git', ['init', '-q'], { cwd: dir });
  run('git', ['config', 'user.name', 'Tester'], { cwd: dir });
  run('git', ['config', 'user.email', 'tester@example.invalid'], { cwd: dir });
  write(path.join(dir, 'src', 'service.js'), [
    'export class OrderService {',
    '  constructor(store) {',
    '    this.store = store;',
    '  }',
    '  cancel(id) {',
    '    const order = this.store.find(id);',
    '    if (!order) throw new Error("NOT_FOUND");',
    '    if (order.state === "SHIPPED") throw new Error("CONFLICT");',
    '    this.store.save({ ...order, state: "CANCELLED" });',
    '    return true;',
    '  }',
    '}',
    ''
  ].join('\n'));
  run('git', ['add', '.'], { cwd: dir });
  run('git', ['commit', '-qm', 'feat: add order service'], { cwd: dir });

  // 最小化仓库初始化文件（避免测试调用外网 CLI）
  write(path.join(dir, 'docs', 'isdd', 'repository.yaml'), 'workflow_version: "1.0.0"\n');
  write(path.join(dir, 'docs', 'isdd', 'policy.md'), '# 策略\n');
  write(path.join(dir, 'docs', 'isdd', 'repository.md'), '# 上下文\n');
  return dir;
}

test('learn.mjs prepare 支持 commit / path / SDD change 并携带个人认知账本', () => {
  const repo = makeRepo();
  const profilePath = path.join(repo, '.tmp-profile.yaml');
  try {
    // 1. 同步一条已掌握概念 + 一条待巩固概念
    let res = run(process.execPath, [
      LEARN_CLI, 'sync',
      '--profile-path', profilePath,
      '--payload', JSON.stringify({
        change: 'seed-1',
        mastered: ['js.spread-clone'],
        practiced: ['domain.guard-order'],
        review_needed: ['concurrency.optimistic-lock']
      })
    ]);
    assert.equal(res.status, 0, res.stderr);
    const syncOut = JSON.parse(res.stdout);
    assert.equal(syncOut.mastered_total, 2);
    assert.equal(syncOut.review_needed_total, 1);

    // 2. prepare --commit HEAD
    res = run(process.execPath, [
      LEARN_CLI, 'prepare',
      '--commit', 'HEAD',
      '--root', repo,
      '--profile-path', profilePath
    ]);
    assert.equal(res.status, 0, res.stderr);
    const prepCommit = JSON.parse(res.stdout);
    assert.equal(prepCommit.sourceType, 'commit');
    assert.equal(prepCommit.masteredCount, 2);
    assert.equal(prepCommit.reviewNeededCount, 1);
    const ctx = JSON.parse(fs.readFileSync(prepCommit.contextPath, 'utf8'));
    assert.ok(ctx.changedFiles.includes('src/service.js'));
    assert.ok(ctx.profile.mastered_keys.includes('domain.guard-order'));
    assert.equal(ctx.profile.detail.mastered['domain.guard-order'].level, 'practiced');

    // 3. prepare --path src/service.js
    res = run(process.execPath, [
      LEARN_CLI, 'prepare',
      '--path', 'src/service.js',
      '--root', repo,
      '--profile-path', profilePath
    ]);
    assert.equal(res.status, 0, res.stderr);
    const prepMod = JSON.parse(res.stdout);
    assert.equal(prepMod.sourceType, 'module');
    assert.equal(prepMod.changedFilesCount, 1);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('learn.mjs render 精确回填源码、标记亲手共建行、转义脚本标签并拒绝越界行号', () => {
  const repo = makeRepo();
  try {
    const tourFile = path.join(repo, '.isdd-learn', 'demo', 'tour.json');
    const outFile = path.join(repo, '.isdd-learn', 'demo', 'index.html');
    const tour = {
      meta: { id: 'demo', title: '测试 </script> 注入防护与亲手共建', sourceType: 'change', sourceRef: 'test', mode: 'standard', totalChangedFiles: 1, foldedFiles: [] },
      summary: '验证源码回填与 humanLines 标记。',
      flow: { nodes: [{ id: 'n1', label: 'OrderService.cancel', subtitle: 'src/service.js:5-11', stopId: 's1' }], edges: [] },
      stops: [{
        id: 's1',
        title: '核心取消逻辑',
        file: 'src/service.js',
        startLine: 5,
        endLine: 11,
        addedLines: [6, 7, 8, 9],
        humanLines: [7, 8],
        whyItMatters: '校验判空与状态守卫。',
        annotations: [{
          id: 'a1',
          line: 8,
          kind: 'risk',
          conceptKey: 'domain.guard-order',
          title: '状态守卫',
          body: '先判空再判状态。'
        }]
      }],
      quiz: [],
      debugCheatsheet: []
    };
    write(tourFile, JSON.stringify(tour, null, 2));

    let res = run(process.execPath, [LEARN_CLI, 'render', '--slug', 'demo', '--root', repo]);
    assert.equal(res.status, 0, res.stderr);
    const renderOut = JSON.parse(res.stdout);
    assert.equal(renderOut.humanLineCount, 2);

    const html = fs.readFileSync(outFile, 'utf8');
    // 确认 </script> 被转义未破坏 JSON 标签
    const dataTag = '<script id="isdd-tour-data" type="application/json">';
    const i = html.indexOf(dataTag);
    const j = html.indexOf('</script>', i);
    const embedded = JSON.parse(html.slice(i + dataTag.length, j));
    assert.equal(embedded.meta.title, '测试 </script> 注入防护与亲手共建');
    const line7 = embedded.stops[0].codeLines.find((l) => l.line === 7);
    const line9 = embedded.stops[0].codeLines.find((l) => l.line === 9);
    assert.equal(line7.authoredBy, 'human');
    assert.equal(line9.authoredBy, 'ai');
    assert.match(line7.text, /NOT_FOUND/);

    // 校验内联 JS 零语法错误
    const k = html.indexOf('<script>', j);
    const m = html.indexOf('</script>', k);
    new vm.Script(html.slice(k + 8, m));

    // 越界行号必须报错拦截
    tour.stops[0].endLine = 999;
    write(tourFile, JSON.stringify(tour, null, 2));
    res = run(process.execPath, [LEARN_CLI, 'render', '--slug', 'demo', '--root', repo]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /行号范围无效/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('sdd.mjs 持久化 learning_mode、忽略 .isdd-learn 指纹并拦截未清理的 TODO(human)', () => {
  const repo = makeRepo();
  try {
    const fill = (file, replacement = '无告警。Verified detail.') => {
      const content = fs.readFileSync(file, 'utf8')
        .replace(/<!--[\s\S]*?-->/g, replacement)
        .replaceAll('- [ ]', '- [x]')
        .replace('Verdict: PENDING', 'Verdict: PASS');
      fs.writeFileSync(file, content, 'utf8');
    };

    let res = run(process.execPath, [SDD_CLI, 'change', 'create', '--id', 'cobuild-demo', '--title', '测试共建门禁', '--mode', 'standard', '--root', repo]);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(JSON.parse(res.stdout).learning_mode, 'off');

    // 通过 CLI 切换为 both
    res = run(process.execPath, [SDD_CLI, 'learning-mode', '--id', 'cobuild-demo', '--mode', 'both', '--root', repo]);
    assert.equal(res.status, 0, res.stderr);
    res = run(process.execPath, [SDD_CLI, 'status', '--id', 'cobuild-demo', '--root', repo]);
    assert.equal(JSON.parse(res.stdout).change.learning_mode, 'both');

    const changeDir = path.join(repo, 'docs', 'isdd', 'changes', 'cobuild-demo');
    fill(path.join(changeDir, 'spec.md'));
    assert.equal(run(process.execPath, [SDD_CLI, 'transition', '--id', 'cobuild-demo', '--to', 'DEFINED', '--root', repo]).status, 0);
    assert.equal(run(process.execPath, [SDD_CLI, 'artifact', 'plan', '--id', 'cobuild-demo', '--root', repo]).status, 0);
    fill(path.join(changeDir, 'plan.md'));
    assert.equal(run(process.execPath, [SDD_CLI, 'transition', '--id', 'cobuild-demo', '--to', 'PLANNED', '--root', repo]).status, 0);

    // 写入未完成的 TODO(human)，流转 BUILT 必须被拦截
    const serviceFile = path.join(repo, 'src', 'service.js');
    const orig = fs.readFileSync(serviceFile, 'utf8');
    fs.writeFileSync(serviceFile, orig.replace('return true;', '// TODO(human) 待实现\n    return true;'), 'utf8');
    res = run(process.execPath, [SDD_CLI, 'transition', '--id', 'cobuild-demo', '--to', 'BUILT', '--root', repo]);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /TODO\(human\)/);

    // 清理 TODO(human) 后正常流转 BUILT -> VERIFIED
    fs.writeFileSync(serviceFile, orig.replace('return true;', 'return "OK";'), 'utf8');
    assert.equal(run(process.execPath, [SDD_CLI, 'transition', '--id', 'cobuild-demo', '--to', 'BUILT', '--root', repo]).status, 0);
    assert.equal(run(process.execPath, [SDD_CLI, 'artifact', 'verification', '--id', 'cobuild-demo', '--root', repo]).status, 0);
    fill(path.join(changeDir, 'verification.md'));
    assert.equal(run(process.execPath, [SDD_CLI, 'transition', '--id', 'cobuild-demo', '--to', 'VERIFIED', '--root', repo]).status, 0);

    // 验证后在 .isdd-learn/ 生成研读本产物，绝不破坏指纹导致无法流转 DONE
    write(path.join(repo, '.isdd-learn', 'cobuild-demo', 'index.html'), '<html>ok</html>');
    assert.equal(run(process.execPath, [SDD_CLI, 'artifact', 'delivery', '--id', 'cobuild-demo', '--root', repo]).status, 0);
    fill(path.join(changeDir, 'delivery.md'));
    res = run(process.execPath, [SDD_CLI, 'transition', '--id', 'cobuild-demo', '--to', 'DONE', '--delivery-ref', 'https://example.test/mr/9', '--root', repo]);
    assert.equal(res.status, 0, res.stderr);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('learn.mjs open 提供受 Token 与同源保护的本地 POST /api/sync 直写认知账本能力', async () => {
  const repo = makeRepo();
  const profilePath = path.join(repo, '.direct-profile.yaml');
  const htmlFile = path.join(repo, '.isdd-learn', 'srv', 'index.html');
  write(htmlFile, '<!doctype html><html><body>ok</body></html>');

  const { handleRequest } = createPreviewServer({ htmlPath: htmlFile, profilePath, idleSeconds: 0 });

  const invoke = (method, url, headers = {}, body = null) => new Promise((resolve) => {
    const req = Readable.from(body ? [Buffer.from(body, 'utf8')] : []);
    req.method = method;
    req.url = url;
    req.headers = headers;
    let status = 200;
    const res = {
      writeHead(code) { status = code; },
      end(chunk = '') { resolve({ status, body: Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk) }); }
    };
    handleRequest(req, res);
  });

  try {
    // 1. 无 Token 的 POST 必须返回 403
    const denied = await invoke('POST', '/api/sync', { host: '127.0.0.1:18765' }, JSON.stringify({ mastered: ['evil.inject'] }));
    assert.equal(denied.status, 403);

    // 2. 跨站 Origin 必须返回 403
    const capsResp = await invoke('GET', '/api/capabilities', { host: '127.0.0.1:18765' });
    assert.equal(capsResp.status, 200);
    const caps = JSON.parse(capsResp.body);
    assert.equal(caps.directSync, true);

    const csrfDenied = await invoke(
      'POST',
      '/api/sync',
      { host: '127.0.0.1:18765', origin: 'http://evil.example', 'x-isdd-token': caps.token },
      JSON.stringify({ mastered: ['evil.csrf'] })
    );
    assert.equal(csrfDenied.status, 403);

    // 3. 合法同源 + Token 直写落盘成功
    const okResp = await invoke(
      'POST',
      '/api/sync',
      { host: '127.0.0.1:18765', origin: 'http://127.0.0.1:18765', 'x-isdd-token': caps.token },
      JSON.stringify({ change: 'direct-test', mastered: ['spring.aop-proxy'], review_needed: ['sql.mvcc'] })
    );
    assert.equal(okResp.status, 200);
    const saved = JSON.parse(okResp.body);
    assert.equal(saved.ok, true);
    assert.equal(saved.mastered_total, 1);
    assert.equal(saved.review_needed_total, 1);

    const disk = fs.readFileSync(profilePath, 'utf8');
    assert.match(disk, /spring\.aop-proxy/);
    assert.match(disk, /sql\.mvcc/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
