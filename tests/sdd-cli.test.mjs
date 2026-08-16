import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_ROOT = path.join(ROOT, 'plugins', 'sdd');
const CLI = path.join(PLUGIN_ROOT, 'scripts', 'sdd.mjs');
const HOOK = path.join(PLUGIN_ROOT, 'scripts', 'session-start.mjs');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    input: options.input,
    windowsHide: true
  });
}

function parseJson(text) {
  return JSON.parse(String(text).trim());
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function replaceComments(file, replacement = 'Verified repository-specific evidence.') {
  const content = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, replacement);
  fs.writeFileSync(file, content, 'utf8');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idf-sdd-test-'));
  write(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    scripts: {
      build: 'node -e "process.exit(0)"',
      test: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"'
    }
  }, null, 2));
  write(path.join(root, 'src', 'feature.js'), 'export function feature(value) { return value; }\n');
  const git = run('git', ['init'], { cwd: root });
  assert.equal(git.status, 0, git.stderr);

  const fakeCodeGraph = path.join(root, 'fake-codegraph.mjs');
  write(fakeCodeGraph, `
import fs from 'node:fs';
import path from 'node:path';
const command = process.argv[2];
const project = path.resolve(process.argv[3] || process.cwd());
if (command === 'version') {
  console.log('codegraph 1.5.0-test');
} else if (command === 'init') {
  fs.mkdirSync(path.join(project, '.codegraph'), { recursive: true });
  fs.writeFileSync(path.join(project, '.codegraph', 'codegraph.db'), 'fixture');
  console.log('Indexed fixture repository');
} else if (command === 'status' || command === 'sync') {
  if (!fs.existsSync(path.join(project, '.codegraph'))) process.exit(2);
  console.log('Graph ready; pending sync: none');
} else if (command === 'serve') {
  process.exit(0);
} else {
  console.error('unsupported command', command);
  process.exit(3);
}
`);
  return { root, fakeCodeGraph };
}

function cli(root, fakeCodeGraph, args) {
  return run(process.execPath, [CLI, ...args, '--root', root], {
    cwd: root,
    env: { SDD_CODEGRAPH_COMMAND: fakeCodeGraph }
  });
}

test('classifies lite, standard, and strict requests conservatively', () => {
  const lite = run(process.execPath, [CLI, 'classify', '--text', '给 UserResponse 增加 avatarUrl 字段']);
  assert.equal(lite.status, 0, lite.stderr);
  assert.equal(parseJson(lite.stdout).mode, 'lite');

  const standard = run(process.execPath, [CLI, 'classify', '--text', '实现订单筛选功能']);
  assert.equal(parseJson(standard.stdout).mode, 'standard');

  const strict = run(process.execPath, [CLI, 'classify', '--text', '增加企业成员权限和数据库迁移']);
  assert.equal(parseJson(strict.stdout).mode, 'strict');
});

test('runs the complete repository and change lifecycle with durable artifacts', () => {
  const { root, fakeCodeGraph } = fixture();
  try {
    let result = cli(root, fakeCodeGraph, ['init']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(root, '.codegraph', 'codegraph.db')));
    assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /\.codegraph\//);
    assert.ok(fs.existsSync(path.join(root, '.sdd', 'policy.md')));

    replaceComments(path.join(root, '.sdd', 'repository.md'));
    result = cli(root, fakeCodeGraph, ['validate', '--repo']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['change', 'create', '--id', 'REQ-101', '--title', 'Add avatar field', '--mode', 'lite']);
    assert.equal(result.status, 0, result.stderr);
    const directory = path.join(root, '.sdd', 'changes', 'REQ-101');

    replaceComments(path.join(directory, 'spec.md'), 'Verified requirement detail.');
    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-101', '--to', 'DEFINED']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['artifact', 'plan', '--id', 'REQ-101']);
    assert.equal(result.status, 0, result.stderr);
    replaceComments(path.join(directory, 'plan.md'), 'Verified technical evidence.');
    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-101', '--to', 'PLANNED']);
    assert.equal(result.status, 0, result.stderr);

    const planFile = path.join(directory, 'plan.md');
    let plan = fs.readFileSync(planFile, 'utf8').replaceAll('- [ ]', '- [x]');
    fs.writeFileSync(planFile, plan, 'utf8');
    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-101', '--to', 'BUILT']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['artifact', 'verification', '--id', 'REQ-101']);
    assert.equal(result.status, 0, result.stderr);
    const verificationFile = path.join(directory, 'verification.md');
    replaceComments(verificationFile, 'Verified executed evidence.');
    const verification = fs.readFileSync(verificationFile, 'utf8').replace('Verdict: PENDING', 'Verdict: PASS');
    fs.writeFileSync(verificationFile, verification, 'utf8');
    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-101', '--to', 'VERIFIED']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['artifact', 'delivery', '--id', 'REQ-101']);
    assert.equal(result.status, 0, result.stderr);
    const deliveryFile = path.join(directory, 'delivery.md');
    replaceComments(deliveryFile, 'Verified delivery content.');
    const delivery = fs.readFileSync(deliveryFile, 'utf8').replace('Delivery-Ref: PENDING', 'Delivery-Ref: https://example.test/pr/101');
    fs.writeFileSync(deliveryFile, delivery, 'utf8');

    const implementationFile = path.join(root, 'src', 'feature.js');
    const verifiedImplementation = fs.readFileSync(implementationFile, 'utf8');
    fs.writeFileSync(implementationFile, `${verifiedImplementation}// changed after verification\n`, 'utf8');
    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-101', '--to', 'IN_REVIEW', '--delivery-ref', 'https://example.test/pr/101']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /验证后发生了变化/);
    fs.writeFileSync(implementationFile, verifiedImplementation, 'utf8');

    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-101', '--to', 'IN_REVIEW', '--delivery-ref', 'https://example.test/pr/101']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-101', '--to', 'DONE', '--merged', '--accepted-ref', 'merge:abc123']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['validate']);
    assert.equal(result.status, 0, result.stderr);
    result = cli(root, fakeCodeGraph, ['status', '--id', 'REQ-101']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(parseJson(result.stdout).change.state, 'DONE');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects skipped states and incomplete artifacts', () => {
  const { root, fakeCodeGraph } = fixture();
  try {
    let result = cli(root, fakeCodeGraph, ['init']);
    assert.equal(result.status, 0, result.stderr);
    result = cli(root, fakeCodeGraph, ['change', 'create', '--id', 'REQ-102', '--title', 'Unsafe skip', '--mode', 'standard']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-102', '--to', 'BUILT']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /不允许/);

    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-102', '--to', 'DEFINED']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /完成门禁/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a plan that omits executable task contract fields', () => {
  const { root, fakeCodeGraph } = fixture();
  try {
    let result = cli(root, fakeCodeGraph, ['init']);
    assert.equal(result.status, 0, result.stderr);
    replaceComments(path.join(root, '.sdd', 'repository.md'));

    result = cli(root, fakeCodeGraph, ['change', 'create', '--id', 'REQ-103', '--title', 'Incomplete plan contract', '--mode', 'standard']);
    assert.equal(result.status, 0, result.stderr);
    const directory = path.join(root, '.sdd', 'changes', 'REQ-103');
    replaceComments(path.join(directory, 'spec.md'));
    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-103', '--to', 'DEFINED']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['artifact', 'plan', '--id', 'REQ-103']);
    assert.equal(result.status, 0, result.stderr);
    const planFile = path.join(directory, 'plan.md');
    replaceComments(planFile);
    const plan = fs.readFileSync(planFile, 'utf8').replace('  - 测试 seam：', '  - 缺少 seam：');
    fs.writeFileSync(planFile, plan, 'utf8');

    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-103', '--to', 'PLANNED']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /测试 seam/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects verification that collapses the two review axes', () => {
  const { root, fakeCodeGraph } = fixture();
  try {
    let result = cli(root, fakeCodeGraph, ['init']);
    assert.equal(result.status, 0, result.stderr);
    replaceComments(path.join(root, '.sdd', 'repository.md'));

    result = cli(root, fakeCodeGraph, ['change', 'create', '--id', 'REQ-104', '--title', 'Collapsed review', '--mode', 'strict']);
    assert.equal(result.status, 0, result.stderr);
    const directory = path.join(root, '.sdd', 'changes', 'REQ-104');
    replaceComments(path.join(directory, 'spec.md'));
    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-104', '--to', 'DEFINED']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['artifact', 'plan', '--id', 'REQ-104']);
    assert.equal(result.status, 0, result.stderr);
    const planFile = path.join(directory, 'plan.md');
    replaceComments(planFile);
    fs.writeFileSync(planFile, fs.readFileSync(planFile, 'utf8').replaceAll('- [ ]', '- [x]'), 'utf8');
    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-104', '--to', 'PLANNED']);
    assert.equal(result.status, 0, result.stderr);
    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-104', '--to', 'BUILT']);
    assert.equal(result.status, 0, result.stderr);

    result = cli(root, fakeCodeGraph, ['artifact', 'verification', '--id', 'REQ-104']);
    assert.equal(result.status, 0, result.stderr);
    const verificationFile = path.join(directory, 'verification.md');
    replaceComments(verificationFile);
    const verification = fs.readFileSync(verificationFile, 'utf8')
      .replace('### 工程质量', '### 综合评审')
      .replace('Verdict: PENDING', 'Verdict: PASS');
    fs.writeFileSync(verificationFile, verification, 'utf8');

    result = cli(root, fakeCodeGraph, ['transition', '--id', 'REQ-104', '--to', 'VERIFIED']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /工程质量审查/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('session hook reports SDD and CodeGraph context without mutation', () => {
  const { root, fakeCodeGraph } = fixture();
  try {
    let result = cli(root, fakeCodeGraph, ['init']);
    assert.equal(result.status, 0, result.stderr);
    result = run(process.execPath, [HOOK], {
      cwd: root,
      input: JSON.stringify({ cwd: root, hook_event_name: 'SessionStart' })
    });
    assert.equal(result.status, 0, result.stderr);
    const output = parseJson(result.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(output.hookSpecificOutput.additionalContext, /IDF-SDD/);
    assert.match(output.hookSpecificOutput.additionalContext, /CodeGraph 索引：已存在/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
