#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WORKFLOW_VERSION = '1.0.0';
const CODEGRAPH_MIN_VERSION = '1.5.0';
const CODEGRAPH_NPM_PACKAGE = '@colbymchenry/codegraph';
const CODECHECK_MIN_VERSION = '2.1.1';
const CODECHECK_NPM_PACKAGE = '@baize/codecheckcli';
const CODECHECK_NPM_REGISTRY = 'https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/';
const CODEHUB_MIN_VERSION = '1.0.0';
const CODEHUB_NPM_PACKAGE = '@codehub/codehub-cli';
const CODEHUB_NPM_REGISTRY = 'https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, '..');
const TEMPLATE_DIR = path.join(PLUGIN_ROOT, 'assets', 'templates');

const STATES = [
  'DRAFT',
  'DEFINED',
  'PLANNED',
  'BUILT',
  'VERIFIED',
  'DONE',
  'ABANDONED'
];

const ALLOWED_TRANSITIONS = new Map([
  ['DRAFT', new Set(['DEFINED'])],
  ['DEFINED', new Set(['PLANNED'])],
  ['PLANNED', new Set(['BUILT', 'DRAFT'])],
  ['BUILT', new Set(['VERIFIED', 'PLANNED', 'DRAFT'])],
  ['VERIFIED', new Set(['DONE', 'VERIFIED', 'PLANNED', 'DRAFT'])],
  ['DONE', new Set(['DEFINED', 'VERIFIED'])],
  ['ABANDONED', new Set()]
]);

const NEXT_COMMAND = {
  DRAFT: '/isdd-define',
  DEFINED: '/isdd-plan',
  PLANNED: '/isdd-build',
  BUILT: '/isdd-verify',
  VERIFIED: '/isdd-ship',
  DONE: null,
  ABANDONED: null
};

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
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const equalIndex = token.indexOf('=');
    if (equalIndex !== -1) {
      flags[token.slice(2, equalIndex)] = token.slice(equalIndex + 1);
      continue;
    }
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { flags, positionals };
}

function projectRoot(flags) {
  return path.resolve(String(flags.root || process.env.CLAUDE_PROJECT_DIR || process.cwd()));
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeText(file, content) {
  ensureDirectory(path.dirname(file));
  fs.writeFileSync(file, content.replace(/\r?\n/g, '\n'), 'utf8');
}

function copyTemplate(name, destination, replacements = {}) {
  const source = path.join(TEMPLATE_DIR, name);
  if (!fs.existsSync(source)) fail(`找不到模板：${source}`);
  let content = readText(source);
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, String(value));
  }
  writeText(destination, content);
}

function yamlScalar(value) {
  if (value === null || value === undefined) return '""';
  return JSON.stringify(String(value));
}

function parseYamlScalar(raw) {
  let value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value);
    } catch {
      value = value.slice(1, -1);
    }
  }
  return String(value);
}

function parseYamlConfig(content) {
  const metadata = {};
  for (const line of content.split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!item) continue;
    metadata[item[1]] = parseYamlScalar(item[2]);
  }
  return metadata;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) fail('spec.md 缺少 YAML frontmatter。');
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!item) continue;
    metadata[item[1]] = parseYamlScalar(item[2]);
  }
  return { metadata, body: content.slice(match[0].length) };
}

function serializeFrontmatter(metadata, body) {
  const preferredOrder = [
    'id',
    'title',
    'state',
    'mode',
    'workflow_version',
    'created_at',
    'updated_at',
    'base_ref',
    'verified_fingerprint',
    'delivery_ref',
    'e2e_issue',
    'blocked',
    'block_reason'
  ];
  const keys = [
    ...preferredOrder.filter((key) => Object.hasOwn(metadata, key)),
    ...Object.keys(metadata).filter((key) => !preferredOrder.includes(key)).sort()
  ];
  const lines = keys.map((key) => `${key}: ${yamlScalar(metadata[key])}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\s+/, '')}`;
}

function safeId(raw) {
  const id = String(raw || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || id.includes('..')) {
    fail('Change id 必须由 1-128 个字母、数字、点、下划线或连字符组成，且不能包含“..”。');
  }
  return id;
}

function slugify(text) {
  const normalized = String(text || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'change';
}

function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function isoNow() {
  return new Date().toISOString();
}

function sddDirectory(root) {
  return path.join(root, 'docs', 'isdd');
}

function changeDirectory(root, id) {
  return path.join(sddDirectory(root), 'changes', safeId(id));
}

function specPath(root, id) {
  return path.join(changeDirectory(root, id), 'spec.md');
}

function requireInitialized(root) {
  const config = path.join(sddDirectory(root), 'repository.yaml');
  if (!fs.existsSync(config)) {
    fail('仓库尚未初始化，请先执行 /isdd-init。', { root });
  }
}

function loadChange(root, id) {
  const file = specPath(root, id);
  if (!fs.existsSync(file)) fail(`找不到变更：${id}`, { expected: file });
  const content = readText(file);
  const parsed = parseFrontmatter(content);
  if (!STATES.includes(parsed.metadata.state)) {
    fail(`未知的变更状态：${parsed.metadata.state}`, { id });
  }
  return { ...parsed, file, id: parsed.metadata.id || id };
}

function run(command, args, options = {}) {
  const spawnOptions = {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout || 60_000,
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

function runCodeGraph(args, root, timeout = 600_000) {
  const configured = process.env.SDD_CODEGRAPH_COMMAND || 'codegraph';
  const isScript = /\.(?:mjs|cjs|js)$/i.test(configured);
  const command = isScript ? process.execPath : configured;
  const commandArgs = isScript ? [configured, ...args] : args;
  const result = run(command, commandArgs, { cwd: root, timeout });
  if (result.error) {
    fail('无法启动 CodeGraph 命令。', {
      command: configured,
      cause: result.error.message,
      install: 'npm install -g @colbymchenry/codegraph'
    });
  }
  if (result.status !== 0) {
    fail('CodeGraph 命令执行失败。', {
      command: [configured, ...args].join(' '),
      status: result.status,
      stdout: (result.stdout || '').trim(),
      stderr: (result.stderr || '').trim()
    });
  }
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim()
  };
}

const CODEGRAPH_FALLBACK_REGISTRY = 'https://mirrors.tools.huawei.com/npm/';

function detectCodegraphVersion(root) {
  const configured = process.env.SDD_CODEGRAPH_COMMAND || 'codegraph';
  const isScript = /\.(?:mjs|cjs|js)$/i.test(configured);
  const command = isScript ? process.execPath : configured;
  const commandArgs = isScript ? [configured, 'version'] : ['version'];
  const result = run(command, commandArgs, { cwd: root, timeout: 15_000 });
  if (result.status !== 0) return null;
  return versionTuple((result.stdout || result.stderr || '').trim());
}

function ensureCodegraph(root) {
  const version = detectCodegraphVersion(root);
  if (version && compareVersions(version, versionTuple(CODEGRAPH_MIN_VERSION)) >= 0) {
    return { installed: true, version: version.join('.'), autoInstalled: false };
  }

  // 第一次尝试：直接安装
  let installResult = run('npm', ['install', '-g', CODEGRAPH_NPM_PACKAGE], { cwd: root, timeout: 300_000 });

  // 第一次失败：配置华为镜像源后重试
  if (installResult.status !== 0) {
    const savedRegistry = run('npm', ['config', 'get', 'registry'], { cwd: root, timeout: 10_000 });
    const savedValue = savedRegistry.status === 0 ? (savedRegistry.stdout || '').trim() : '';
    run('npm', ['config', 'set', 'registry', CODEGRAPH_FALLBACK_REGISTRY], { cwd: root, timeout: 10_000 });
    installResult = run('npm', ['install', '-g', CODEGRAPH_NPM_PACKAGE], { cwd: root, timeout: 300_000 });
    // 恢复原始 registry
    if (savedValue && savedValue !== 'undefined') {
      run('npm', ['config', 'set', 'registry', savedValue], { cwd: root, timeout: 10_000 });
    } else {
      run('npm', ['config', 'delete', 'registry'], { cwd: root, timeout: 10_000 });
    }
  }

  if (installResult.status !== 0) {
    return {
      installed: false,
      version: null,
      autoInstalled: false,
      error: `npm install -g ${CODEGRAPH_NPM_PACKAGE} 失败：${(installResult.stderr || '').trim()}`
    };
  }
  const recheckVersion = detectCodegraphVersion(root);
  if (!recheckVersion) {
    return {
      installed: false,
      version: null,
      autoInstalled: true,
      error: '安装后仍无法执行 codegraph version，可能需要重启终端。'
    };
  }
  return { installed: true, version: recheckVersion.join('.'), autoInstalled: true };
}

function ensureCodecheck(root) {
  const result = run('codecheck', ['--version'], { cwd: root, timeout: 15_000 });
  if (result.status === 0) {
    const version = versionTuple((result.stdout || result.stderr || '').trim());
    if (version && compareVersions(version, versionTuple(CODECHECK_MIN_VERSION)) >= 0) {
      return { installed: true, version: version.join('.'), autoInstalled: false };
    }
  }

  // 保存当前 npm 配置，安装后恢复
  const npmGet = (key) => {
    const r = run('npm', ['config', 'get', key], { cwd: root, timeout: 10_000 });
    return r.status === 0 ? (r.stdout || '').trim() : '';
  };
  const savedStrictSsl = npmGet('strict-ssl');
  const savedRegistry = npmGet('@baize:registry');

  // 配置华为内部私有仓库
  run('npm', ['config', 'set', 'strict-ssl', 'false'], { cwd: root, timeout: 10_000 });
  run('npm', ['config', 'set', '@baize:registry', CODECHECK_NPM_REGISTRY], { cwd: root, timeout: 10_000 });

  const installResult = run('npm', ['install', '-g', CODECHECK_NPM_PACKAGE], { cwd: root, timeout: 300_000 });

  // 恢复原始 npm 配置
  run('npm', ['config', 'set', 'strict-ssl', savedStrictSsl || 'true'], { cwd: root, timeout: 10_000 });
  if (savedRegistry && savedRegistry !== 'undefined') {
    run('npm', ['config', 'set', '@baize:registry', savedRegistry], { cwd: root, timeout: 10_000 });
  } else {
    run('npm', ['config', 'delete', '@baize:registry'], { cwd: root, timeout: 10_000 });
  }

  if (installResult.status !== 0) {
    return {
      installed: false,
      version: null,
      autoInstalled: false,
      error: `npm install -g ${CODECHECK_NPM_PACKAGE} 失败：${(installResult.stderr || '').trim()}`
    };
  }
  const recheck = run('codecheck', ['--version'], { cwd: root, timeout: 15_000 });
  if (recheck.status !== 0) {
    return {
      installed: false,
      version: null,
      autoInstalled: true,
      error: '安装后仍无法执行 codecheck --version，可能需要重启终端。'
    };
  }
  const version = versionTuple((recheck.stdout || recheck.stderr || '').trim());
  return { installed: true, version: version ? version.join('.') : 'unknown', autoInstalled: true };
}

function ensureCodehub(root) {
  const result = run('codehub-cli', ['--version'], { cwd: root, timeout: 15_000 });
  if (result.status === 0) {
    const version = versionTuple((result.stdout || result.stderr || '').trim());
    if (version && compareVersions(version, versionTuple(CODEHUB_MIN_VERSION)) >= 0) {
      return { installed: true, version: version.join('.'), autoInstalled: false };
    }
  }

  const npmGet = (key) => {
    const r = run('npm', ['config', 'get', key], { cwd: root, timeout: 10_000 });
    return r.status === 0 ? (r.stdout || '').trim() : '';
  };
  const savedStrictSsl = npmGet('strict-ssl');
  const savedRegistry = npmGet('@codehub:registry');

  run('npm', ['config', 'set', 'strict-ssl', 'false'], { cwd: root, timeout: 10_000 });
  run('npm', ['config', 'set', '@codehub:registry', CODEHUB_NPM_REGISTRY], { cwd: root, timeout: 10_000 });

  const installResult = run('npm', ['install', '-g', CODEHUB_NPM_PACKAGE], { cwd: root, timeout: 300_000 });

  run('npm', ['config', 'set', 'strict-ssl', savedStrictSsl || 'true'], { cwd: root, timeout: 10_000 });
  if (savedRegistry && savedRegistry !== 'undefined') {
    run('npm', ['config', 'set', '@codehub:registry', savedRegistry], { cwd: root, timeout: 10_000 });
  } else {
    run('npm', ['config', 'delete', '@codehub:registry'], { cwd: root, timeout: 10_000 });
  }

  if (installResult.status !== 0) {
    return {
      installed: false,
      version: null,
      autoInstalled: false,
      error: `npm install -g ${CODEHUB_NPM_PACKAGE} 失败：${(installResult.stderr || '').trim()}`
    };
  }
  const recheck = run('codehub-cli', ['--version'], { cwd: root, timeout: 15_000 });
  if (recheck.status !== 0) {
    return {
      installed: false,
      version: null,
      autoInstalled: true,
      error: '安装后仍无法执行 codehub-cli --version，可能需要重启终端。'
    };
  }
  const version = versionTuple((recheck.stdout || recheck.stderr || '').trim());
  return { installed: true, version: version ? version.join('.') : 'unknown', autoInstalled: true };
}

function versionTuple(value) {
  const match = String(value || '').match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function requireCodeGraphVersion(output) {
  const detected = versionTuple(output);
  const minimum = versionTuple(CODEGRAPH_MIN_VERSION);
  if (!detected) fail('无法解析已安装的 CodeGraph 版本。', { output });
  if (compareVersions(detected, minimum) < 0) {
    fail(`需要 CodeGraph ${CODEGRAPH_MIN_VERSION} 或更高版本。`, {
      detected: detected.join('.'),
      upgrade: 'codegraph upgrade 1.5.0'
    });
  }
  return detected.join('.');
}

function gitValue(root, args, fallback = '') {
  const result = run('git', args, { cwd: root, timeout: 15_000 });
  if (result.status !== 0) return fallback;
  return (result.stdout || '').trim() || fallback;
}

function packageManager(root) {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function detectCommands(root) {
  const commands = { build: '', test: '', lint: '', typecheck: '', format: '' };
  const technologies = [];
  const packageFile = path.join(root, 'package.json');
  if (fs.existsSync(packageFile)) {
    try {
      const packageJson = JSON.parse(readText(packageFile));
      const manager = packageManager(root);
      technologies.push(`node:${manager}`);
      const scripts = packageJson.scripts || {};
      for (const key of Object.keys(commands)) {
        if (scripts[key]) commands[key] = key === 'test' && manager === 'npm' ? 'npm test' : `${manager} run ${key}`;
      }
    } catch (error) {
      fail('package.json 不是有效的 JSON。', { cause: error.message });
    }
  }
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'))) {
    technologies.push('python');
    if (!commands.test) commands.test = 'python -m pytest';
  }
  if (fs.existsSync(path.join(root, 'go.mod'))) {
    technologies.push('go');
    commands.build ||= 'go build ./...';
    commands.test ||= 'go test ./...';
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
    technologies.push('rust');
    commands.build ||= 'cargo build';
    commands.test ||= 'cargo test';
    commands.lint ||= 'cargo clippy --all-targets --all-features';
    commands.format ||= 'cargo fmt --check';
  }
  if (fs.existsSync(path.join(root, 'pom.xml'))) {
    technologies.push('java:maven');
    commands.build ||= 'mvn package';
    commands.test ||= 'mvn test';
  }
  if (fs.existsSync(path.join(root, 'build.gradle')) || fs.existsSync(path.join(root, 'build.gradle.kts'))) {
    technologies.push('java:gradle');
    const gradle = process.platform === 'win32' && fs.existsSync(path.join(root, 'gradlew.bat')) ? 'gradlew.bat' : './gradlew';
    commands.build ||= `${gradle} build`;
    commands.test ||= `${gradle} test`;
  }
  const dotnet = fs.readdirSync(root, { withFileTypes: true }).some((entry) => /\.(?:sln|csproj)$/i.test(entry.name));
  if (dotnet) {
    technologies.push('dotnet');
    commands.build ||= 'dotnet build';
    commands.test ||= 'dotnet test';
  }
  return { commands, technologies };
}

function renderRepositoryYaml(root, detection, codegraphEnabled, existingReviewer) {
  const commandLines = Object.entries(detection.commands)
    .map(([key, value]) => `  ${key}: ${yamlScalar(value)}`)
    .join('\n');
  const reviewerLine = existingReviewer ? `reviewer: ${yamlScalar(existingReviewer)}\n` : '';
  return `workflow_version: ${yamlScalar(WORKFLOW_VERSION)}\ninitialized_at: ${yamlScalar(isoNow())}\nrepository_root: "."\ntechnologies:\n${detection.technologies.length ? detection.technologies.map((item) => `  - ${yamlScalar(item)}`).join('\n') : '  - "unknown"'}\ncommands:\n${commandLines}\ncodegraph:\n  provider: "colbymchenry/codegraph"\n  minimum_version: ${yamlScalar(CODEGRAPH_MIN_VERSION)}\n  enabled: ${codegraphEnabled ? 'true' : 'false'}\n  index_directory: ".codegraph"\n  auto_sync: true\npolicy:\n  file: "docs/isdd/policy.md"\n  default_mode: "standard"\n  require_human_delivery: true\nartifacts:\n  directory: "docs/isdd/changes"\n  commit_with_code: true\n${reviewerLine}`;
}

function ensureGitignore(root) {
  const file = path.join(root, '.gitignore');
  const current = fs.existsSync(file) ? readText(file) : '';
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes('.codegraph/') || lines.includes('/.codegraph/')) return false;
  const separator = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  writeText(file, `${current}${separator}\n# 本地 CodeGraph 索引（可重建缓存）\n.codegraph/\n`);
  return true;
}

function initRepository(root, flags) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail('仓库根目录不存在。', { root });
  const gitRoot = gitValue(root, ['rev-parse', '--show-toplevel']);
  if (!gitRoot && !flags['allow-non-git']) fail('/isdd-init 需要在 Git 仓库中运行。', { root });

  let graphResult = { stdout: '已明确跳过 CodeGraph。', stderr: '' };
  let codegraphVersion = null;
  let codegraphAutoInstalled = false;
  const codegraphEnabled = !flags['skip-codegraph'];
  if (codegraphEnabled) {
    const codegraphStatus = ensureCodegraph(root);
    if (!codegraphStatus.installed) {
      fail('CodeGraph 安装失败，请手动安装后重试。', {
        install: `npm install -g ${CODEGRAPH_NPM_PACKAGE}`,
        error: codegraphStatus.error
      });
    }
    codegraphAutoInstalled = codegraphStatus.autoInstalled;
    codegraphVersion = codegraphStatus.version;
    if (fs.existsSync(path.join(root, '.codegraph'))) {
      graphResult = runCodeGraph(['status', root], root, 120_000);
    } else {
      graphResult = runCodeGraph(['init', root], root, 900_000);
    }
  }

  const directory = sddDirectory(root);
  const configFile = path.join(directory, 'repository.yaml');
  const repositoryFile = path.join(directory, 'repository.md');
  const policyFile = path.join(directory, 'policy.md');
  ensureDirectory(path.join(directory, 'changes'));
  const detection = detectCommands(root);
  let existingReviewer = '';
  if (fs.existsSync(configFile)) {
    const metadata = parseYamlConfig(readText(configFile));
    existingReviewer = String(metadata.reviewer || '').trim();
  }
  if (!fs.existsSync(configFile) || flags.force) writeText(configFile, renderRepositoryYaml(root, detection, codegraphEnabled, existingReviewer));
  if (!fs.existsSync(repositoryFile)) copyTemplate('repository.md', repositoryFile);
  if (!fs.existsSync(policyFile)) copyTemplate('policy.md', policyFile);
  const gitignoreChanged = ensureGitignore(root);

  const codecheckResult = ensureCodecheck(root);
  const codehubResult = ensureCodehub(root);

  emit({
    ok: true,
    action: 'init',
    root,
    codegraph_enabled: codegraphEnabled,
    codegraph_version: codegraphVersion,
    codegraph_auto_installed: codegraphAutoInstalled,
    codegraph_summary: graphResult.stdout.slice(0, 4000),
    codecheck_installed: codecheckResult.installed,
    codecheck_version: codecheckResult.version,
    codecheck_auto_installed: codecheckResult.autoInstalled,
    codecheck_error: codecheckResult.error || null,
    codehub_installed: codehubResult.installed,
    codehub_version: codehubResult.version,
    codehub_auto_installed: codehubResult.autoInstalled,
    codehub_error: codehubResult.error || null,
    detected: detection,
    gitignore_changed: gitignoreChanged,
    artifacts: [configFile, repositoryFile, policyFile],
    next: '请根据已核验的 CodeGraph 和仓库证据完善 docs/isdd/repository.md，然后执行 validate --repo。'
  });
}

function classifyMode(text, flags) {
  const normalized = String(text || '').toLowerCase();
  const strictPatterns = [
    /auth(?:entication|orization)?|oauth|jwt|permission|role|payment|billing|secret|crypt|personal data|pii|migration|database schema|public api|breaking change|infrastructure|deploy|distributed|concurrency/,
    /认证|鉴权|授权|权限|角色|支付|账单|密钥|加密|隐私|个人信息|迁移|数据库结构|公共接口|破坏性变更|基础设施|部署|分布式|并发/
  ];
  const litePatterns = [
    /add (?:a )?field|rename|copy change|text change|guard clause|simple if|small config|typo/,
    /增加.*字段|添加.*字段|文案|错别字|简单.*if|保护条件|小.*配置|重命名/
  ];
  const reasons = [];
  let mode = 'standard';
  if (strictPatterns.some((pattern) => pattern.test(normalized))) {
    mode = 'strict';
    reasons.push('需求包含严格模式风险触发项。');
  } else if (litePatterns.some((pattern) => pattern.test(normalized))) {
    mode = 'lite';
    reasons.push('需求影响范围局部，且变更可逆。');
  } else {
    reasons.push('没有充分证据采用轻量模式，也未触发严格模式；默认采用标准模式。');
  }
  const files = Number(flags.files || 0);
  const impact = String(flags.impact || '').toLowerCase();
  if (impact === 'high' || files > 15) {
    mode = 'strict';
    reasons.push('申报的影响范围较大。');
  } else if (mode === 'lite' && (impact === 'medium' || files > 5)) {
    mode = 'standard';
    reasons.push('申报的影响范围超过轻量模式限制。');
  }
  emit({ ok: true, mode, reasons, requires_confirmation_to_downgrade: true });
}

function uniqueGeneratedId(root, title) {
  const base = `${dateStamp()}-${slugify(title)}`;
  let candidate = base;
  let suffix = 2;
  while (fs.existsSync(changeDirectory(root, candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createChange(root, flags) {
  requireInitialized(root);
  const title = String(flags.title || '').trim();
  if (!title) fail('change create 必须提供 --title。');
  const mode = String(flags.mode || 'standard').toLowerCase();
  if (!['lite', 'standard', 'strict'].includes(mode)) fail('模式必须是 lite、standard 或 strict。');
  const id = flags.id ? safeId(flags.id) : uniqueGeneratedId(root, title);
  const directory = changeDirectory(root, id);
  if (fs.existsSync(directory)) fail(`变更已存在：${id}`);
  ensureDirectory(directory);
  const now = isoNow();
  const baseRef = gitValue(root, ['rev-parse', 'HEAD'], 'unborn');
  const e2eIssue = String(flags['e2e'] || '').trim();
  copyTemplate('spec.md', path.join(directory, 'spec.md'), {
    ID: id,
    TITLE: title,
    MODE: mode,
    CREATED_AT: now,
    UPDATED_AT: now,
    BASE_REF: baseRef,
    E2E_ISSUE: e2eIssue
  });
  emit({
    ok: true,
    action: 'change-create',
    id,
    mode,
    e2e_issue: e2eIssue || null,
    state: 'DRAFT',
    directory,
    next_command: `/isdd-define ${id}`
  });
}

function createArtifact(root, type, flags) {
  const id = safeId(flags.id);
  const change = loadChange(root, id);
  const definitions = {
    plan: { file: 'plan.md', template: 'plan.md', states: ['DEFINED', 'PLANNED'] },
    verification: { file: 'verification.md', template: 'verification.md', states: ['BUILT', 'PLANNED', 'VERIFIED'] },
    delivery: { file: 'delivery.md', template: 'delivery.md', states: ['VERIFIED'] }
  };
  const definition = definitions[type];
  if (!definition) fail('交付件类型必须是 plan、verification 或 delivery。');
  if (!definition.states.includes(change.metadata.state)) {
    fail(`当前状态为 ${change.metadata.state}，不能创建 ${type} 交付件。`, { allowed_states: definition.states });
  }
  const target = path.join(changeDirectory(root, id), definition.file);
  const existed = fs.existsSync(target);
  if (!fs.existsSync(target)) copyTemplate(definition.template, target);
  emit({ ok: true, action: 'artifact-create', id, type, file: target, existed });
}

function normalizedGitPath(file) {
  return file.replaceAll('\\', '/').replace(/^\.\//, '');
}

function excludedFingerprintPath(file) {
  const normalized = normalizedGitPath(file);
  return normalized === 'docs/isdd' || normalized.startsWith('docs/isdd/') || normalized === '.codegraph' || normalized.startsWith('.codegraph/');
}

function gitLines(root, args) {
  const result = run('git', args, { cwd: root, timeout: 60_000 });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function changeFingerprint(root, baseRef) {
  let changed = [];
  if (baseRef && baseRef !== 'unborn') {
    const refCheck = run('git', ['cat-file', '-t', baseRef], { cwd: root, timeout: 15_000 });
    if (refCheck.status !== 0) {
      fail(`base_ref（${baseRef}）已失效，可能主分支被 rebase 或 force-push。请重新执行 /isdd-verify 刷新 base_ref。`, { base_ref: baseRef });
    }
    changed = gitLines(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', baseRef, '--']);
  } else {
    changed = gitLines(root, ['ls-files']);
  }
  const untracked = gitLines(root, ['ls-files', '--others', '--exclude-standard']);
  const files = [...new Set([...changed, ...untracked].map(normalizedGitPath))]
    .filter((file) => !excludedFingerprintPath(file))
    .sort((left, right) => left.localeCompare(right));
  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) && absolute !== path.resolve(root)) {
      fail('拒绝为仓库外路径生成指纹。', { relative });
    }
    hash.update(`path:${relative}\n`);
    if (!fs.existsSync(absolute)) {
      hash.update('<deleted>\n');
      continue;
    }
    const stats = fs.lstatSync(absolute);
    if (stats.isSymbolicLink()) {
      hash.update(`symlink:${fs.readlinkSync(absolute)}\n`);
    } else if (stats.isFile()) {
      hash.update(fs.readFileSync(absolute));
      hash.update('\n');
    }
  }
  return { algorithm: 'sha256', value: hash.digest('hex'), files };
}

function sectionMap(content) {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const matches = [...withoutFrontmatter.matchAll(/^##\s+(.+?)\s*$/gm)];
  const sections = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const start = current.index + current[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : withoutFrontmatter.length;
    sections.set(current[1].trim(), withoutFrontmatter.slice(start, end).trim());
  }
  return sections;
}

function meaningful(content) {
  const cleaned = String(content || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\|?\s*[-:]+(?:\s*\|\s*[-:]+)+\s*\|?$/gm, '')
    .replace(/^\|\s*验收条件\s*\|[\s\S]*?证据\s*\|$/gm, '')
    .trim();
  return cleaned.length > 0 && !/^(?:TODO|TBD|PENDING|待填写|待确认|无内容)$/i.test(cleaned);
}

function validateRequiredSections(file, names) {
  if (!fs.existsSync(file)) return [`缺少交付件：${file}`];
  const sections = sectionMap(readText(file));
  const errors = [];
  for (const name of names) {
    if (!sections.has(name)) errors.push(`${path.basename(file)} 缺少章节：${name}`);
    else if (!meaningful(sections.get(name))) errors.push(`${path.basename(file)} 的章节仍为空或仅含占位内容：${name}`);
  }
  return errors;
}

function validateSpec(root, id) {
  const file = specPath(root, id);
  const errors = validateRequiredSections(file, [
    '背景与问题',
    '目标',
    '范围',
    '非目标',
    '验收条件',
    '风险与假设',
    '模式说明'
  ]);
  if (!fs.existsSync(file)) return errors;
  const { metadata } = parseFrontmatter(readText(file));
  if (!['lite', 'standard', 'strict'].includes(metadata.mode)) errors.push('spec.md 的 mode 必须是 lite、standard 或 strict。');
  if (metadata.workflow_version !== WORKFLOW_VERSION) errors.push(`spec.md 的 workflow_version 必须是 ${WORKFLOW_VERSION}。`);
  return errors;
}

function validatePlan(root, id, requireBuilt = false) {
  const file = path.join(changeDirectory(root, id), 'plan.md');
  const errors = validateRequiredSections(file, [
    '当前实现分析',
    '推荐方案',
    '备选方案与取舍',
    '影响范围',
    '实现步骤',
    '测试计划',
    '风险与回滚'
  ]);
  if (!fs.existsSync(file)) return errors;
  const content = readText(file);
  const sections = sectionMap(content);
  const taskContract = [
    ['依赖任务：', '任务依赖边'],
    ['路径 / 符号：', '精确路径和符号'],
    ['测试 seam：', '已确认的测试 seam'],
    ['RED / 基线：', 'RED 或基线信号'],
    ['验证：', '验证命令或确定性观察']
  ];
  for (const [marker, label] of taskContract) {
    if (!content.includes(marker)) errors.push(`plan.md 任务必须包含${label}（${marker}）。`);
  }
  if (requireBuilt) {
    if (/^-\s*\[\s\]/m.test(sections.get('实现步骤') || '')) errors.push('plan.md 仍有未完成的实现步骤。');
    if (!meaningful(sections.get('实际实现偏差'))) errors.push('plan.md 必须记录实际实现偏差，或明确说明无偏差。');
  }
  return errors;
}

function validateVerification(root, id) {
  const file = path.join(changeDirectory(root, id), 'verification.md');
  const errors = validateRequiredSections(file, [
    '验收证据',
    '自动化检查',
    'CodeCheck 门禁',
    'CodeGraph 影响分析',
    '评审发现',
    '已知限制',
    '结论'
  ]);
  if (!fs.existsSync(file)) return errors;
  const content = readText(file);
  if (!/^###\s+\u9700\u6c42\u7b26\u5408\u5ea6\s*$/m.test(content)) errors.push('verification.md 必须包含独立的需求符合度审查。');
  if (!/^###\s+\u5de5\u7a0b\u8d28\u91cf\s*$/m.test(content)) errors.push('verification.md 必须包含独立的工程质量审查。');
  if (!/^Verdict:\s*PASS\s*$/im.test(content)) errors.push('verification.md 必须包含完全匹配的 `Verdict: PASS` 行。');
  if (/\|\s*FAIL\s*\|/i.test(content)) errors.push('verification.md 的验收证据表中仍有失败项。');
  const codecheckContent = (sectionMap(content).get('CodeCheck 门禁') || '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (/忽略|跳过.*检查|跳过.*告警|豁免.*规则|豁免.*告警|不影响.*告警|不影响.*检查|不影响.*规则|误报|无需修复|暂不处理/.test(codecheckContent)) {
    errors.push('verification.md 的 CodeCheck 门禁章节包含绕过措辞（忽略/跳过检查/豁免规则/误报/无需修复等），所有告警必须修复，不得跳过。');
  }
  if (codecheckContent && !/无告警|0\s*告警|告警.*已修复|全部.*修复|告警已清除/.test(codecheckContent)) {
    errors.push('verification.md 的 CodeCheck 门禁章节必须明确记录"无告警"或"全部已修复"。');
  }
  return errors;
}

function validateDelivery(root, id) {
  const file = path.join(changeDirectory(root, id), 'delivery.md');
  const errors = validateRequiredSections(file, [
    '需求单号',
    'MR类型',
    '简要描述',
    '修改原因',
    '修改模块',
    '影响范围',
    '修改内容',
    '验证结论',
    '风险与回滚',
    '归档链接',
    '交付引用'
  ]);
  if (!fs.existsSync(file)) return errors;
  const content = readText(file);
  if (!/^Delivery-Ref:\s*(?!PENDING\s*$).+$/im.test(content)) errors.push('delivery.md 必须包含值不为 PENDING 的 `Delivery-Ref:` 行。');
  return errors;
}

function validateRepository(root) {
  const errors = [];
  const directory = sddDirectory(root);
  for (const name of ['repository.yaml', 'repository.md', 'policy.md']) {
    if (!fs.existsSync(path.join(directory, name))) errors.push(`缺少仓库级交付件：docs/isdd/${name}`);
  }
  const repositoryFile = path.join(directory, 'repository.md');
  if (fs.existsSync(repositoryFile)) {
    const required = [
      '职责与边界',
      '技术栈',
      '架构与入口',
      '领域语言',
      '决策记录',
      '构建与验证命令',
      '测试布局',
      '工程规范',
      '关键与敏感区域'
    ];
    errors.push(...validateRequiredSections(repositoryFile, required));
  }
  return errors;
}

function rank(state) {
  return STATES.indexOf(state);
}

function validateChangeForState(root, id, state) {
  const errors = [];
  if (rank(state) >= rank('DEFINED')) errors.push(...validateSpec(root, id));
  if (rank(state) >= rank('PLANNED')) errors.push(...validatePlan(root, id, rank(state) >= rank('BUILT')));
  if (rank(state) >= rank('VERIFIED')) errors.push(...validateVerification(root, id));
  if (rank(state) >= rank('DONE')) errors.push(...validateDelivery(root, id));
  return errors;
}

function transition(root, flags) {
  requireInitialized(root);
  const id = safeId(flags.id);
  const target = String(flags.to || '').toUpperCase();
  if (!STATES.includes(target)) fail(`未知的目标状态：${target}`);
  const change = loadChange(root, id);
  const current = change.metadata.state;
  if (!ALLOWED_TRANSITIONS.get(current).has(target)) {
    fail(`不允许从 ${current} 转换到 ${target}。`, { allowed: [...ALLOWED_TRANSITIONS.get(current)] });
  }

  if (target === 'DONE') {
    const deliveryRef = String(flags['delivery-ref'] || '').trim();
    if (!deliveryRef) fail('创建 MR 后，转换到 DONE 必须提供 --delivery-ref <MR URL>。');
    const currentFingerprint = changeFingerprint(root, change.metadata.base_ref);
    if (!change.metadata.verified_fingerprint || currentFingerprint.value !== change.metadata.verified_fingerprint) {
      fail('实现文件在验证后发生了变化。请重新执行 /isdd-verify 刷新指纹后再交付。', {
        verified_fingerprint: change.metadata.verified_fingerprint || null,
        current_fingerprint: currentFingerprint.value,
        files: currentFingerprint.files
      });
    }
    change.metadata.delivery_ref = deliveryRef;
    const deliveryFile = path.join(changeDirectory(root, id), 'delivery.md');
    if (fs.existsSync(deliveryFile)) {
      const deliveryContent = readText(deliveryFile);
      const updatedContent = deliveryContent.replace(
        /^Delivery-Ref:\s*.*$/m,
        `Delivery-Ref: ${deliveryRef}`
      );
      if (updatedContent !== deliveryContent) writeText(deliveryFile, updatedContent);
    }
  }

  const errors = validateChangeForState(root, id, target);
  if (errors.length) fail(`${target} 的完成门禁未通过。`, errors);
  if (target === 'VERIFIED') {
    const fingerprint = changeFingerprint(root, change.metadata.base_ref);
    change.metadata.verified_fingerprint = fingerprint.value;
  }
  if (target === 'PLANNED' || target === 'DRAFT' || target === 'DEFINED') {
    change.metadata.verified_fingerprint = '';
    change.metadata.delivery_ref = '';
  }
  change.metadata.state = target;
  change.metadata.updated_at = isoNow();
  change.metadata.blocked = 'false';
  change.metadata.block_reason = '';
  writeText(change.file, serializeFrontmatter(change.metadata, change.body));
  emit({ ok: true, action: 'transition', id, from: current, to: target, next_command: NEXT_COMMAND[target] });
}

function listChanges(root) {
  const directory = path.join(sddDirectory(root), 'changes');
  if (!fs.existsSync(directory)) return [];
  const changes = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(directory, entry.name, 'spec.md');
    if (!fs.existsSync(file)) continue;
    try {
      const { metadata } = parseFrontmatter(readText(file));
      changes.push({
        id: metadata.id || entry.name,
        title: metadata.title || '',
        state: metadata.state || 'UNKNOWN',
        mode: metadata.mode || 'unknown',
        blocked: metadata.blocked === 'true',
        block_reason: metadata.block_reason || '',
        next_command: NEXT_COMMAND[metadata.state] || null
      });
    } catch {
      changes.push({ id: entry.name, state: 'INVALID', next_command: null });
    }
  }
  return changes.sort((a, b) => a.id.localeCompare(b.id));
}

function status(root, flags) {
  requireInitialized(root);
  if (flags.id) {
    const id = safeId(flags.id);
    const change = loadChange(root, id);
    const errors = validateChangeForState(root, id, change.metadata.state);
    emit({
      ok: errors.length === 0,
      root,
      change: {
        id,
        title: change.metadata.title,
        state: change.metadata.state,
        mode: change.metadata.mode,
        blocked: change.metadata.blocked === 'true',
        block_reason: change.metadata.block_reason,
        delivery_ref: change.metadata.delivery_ref,
        e2e_issue: change.metadata.e2e_issue || null,
        verified_fingerprint: change.metadata.verified_fingerprint,
        next_command: NEXT_COMMAND[change.metadata.state]
      },
      validation_errors: errors
    });
    return;
  }
  const repositoryErrors = validateRepository(root);
  const changes = listChanges(root);
  emit({
    ok: repositoryErrors.length === 0,
    root,
    repository_ready: repositoryErrors.length === 0,
    repository_errors: repositoryErrors,
    active_changes: changes.filter((change) => change.state !== 'DONE' && change.state !== 'ABANDONED'),
    completed_changes: changes.filter((change) => change.state === 'DONE')
  });
}

function validate(root, flags) {
  requireInitialized(root);
  const repositoryErrors = validateRepository(root);
  if (flags.repo) {
    if (repositoryErrors.length) fail('仓库级交付件校验失败。', repositoryErrors);
    emit({ ok: true, scope: 'repository', root });
    return;
  }
  if (flags.id) {
    const id = safeId(flags.id);
    const change = loadChange(root, id);
    const errors = validateChangeForState(root, id, change.metadata.state);
    if (errors.length) fail(`变更校验失败：${id}`, errors);
    emit({ ok: true, scope: 'change', id, state: change.metadata.state });
    return;
  }
  const results = [];
  for (const item of listChanges(root)) {
    if (!STATES.includes(item.state)) {
      results.push({ id: item.id, errors: [`无效状态：${item.state}`] });
      continue;
    }
    results.push({ id: item.id, errors: validateChangeForState(root, item.id, item.state) });
  }
  const changeErrors = results.filter((item) => item.errors.length > 0);
  if (repositoryErrors.length || changeErrors.length) {
    fail('SDD 校验失败。', { repository: repositoryErrors, changes: changeErrors });
  }
  emit({ ok: true, scope: 'all', root, validated_changes: results.length });
}

function block(root, flags) {
  const id = safeId(flags.id);
  const reason = String(flags.reason || '').trim();
  if (!reason) fail('block 必须提供 --reason。');
  const change = loadChange(root, id);
  change.metadata.blocked = 'true';
  change.metadata.block_reason = reason;
  change.metadata.updated_at = isoNow();
  writeText(change.file, serializeFrontmatter(change.metadata, change.body));
  emit({ ok: true, action: 'block', id, state: change.metadata.state, reason });
}

function abandon(root, flags) {
  const id = safeId(flags.id);
  const change = loadChange(root, id);
  if (change.metadata.state === 'DONE') fail('已完成的变更不能取消。如需回滚，请新建变更。');
  change.metadata.state = 'ABANDONED';
  change.metadata.blocked = 'true';
  change.metadata.block_reason = String(flags.reason || '').trim() || '变更已取消';
  change.metadata.updated_at = isoNow();
  writeText(change.file, serializeFrontmatter(change.metadata, change.body));
  emit({ ok: true, action: 'abandon', id, state: 'ABANDONED', reason: change.metadata.block_reason });
}

function help() {
  emit({
    ok: true,
    commands: {
      init: 'init [--root <path>] [--skip-codegraph] [--force]',
      classify: 'classify --text <request> [--files <n>] [--impact low|medium|high]',
      change_create: 'change create --title <title> [--id <id>] [--mode lite|standard|strict] [--e2e <E2E单号>]',
      artifact: 'artifact <plan|verification|delivery> --id <id>',
      transition: 'transition --id <id> --to <state> [--delivery-ref <ref>]',
      block: 'block --id <id> --reason <reason>',
      abandon: 'abandon --id <id> [--reason <reason>]',
      status: 'status [--id <id>]',
      validate: 'validate [--repo|--id <id>]'
    }
  });
}

const [command, ...rest] = process.argv.slice(2);
const { flags, positionals } = parseArgs(rest);
const root = projectRoot(flags);

switch (command) {
  case 'init':
    initRepository(root, flags);
    break;
  case 'classify':
    classifyMode(flags.text || positionals.join(' '), flags);
    break;
  case 'change':
    if (positionals[0] !== 'create') fail('change 目前仅支持 create 子命令。');
    createChange(root, flags);
    break;
  case 'artifact':
    createArtifact(root, positionals[0], flags);
    break;
  case 'transition':
    transition(root, flags);
    break;
  case 'block':
    block(root, flags);
    break;
  case 'abandon':
    abandon(root, flags);
    break;
  case 'status':
    status(root, flags);
    break;
  case 'validate':
    validate(root, flags);
    break;
  case 'help':
  case undefined:
    help();
    break;
  default:
    fail(`未知命令：${command}`);
}
