import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_ROOT = ROOT;

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function skill(name) {
  return read(path.join('skills', name, 'SKILL.md'));
}

function includesAll(content, values, subject) {
  for (const value of values) {
    assert.ok(content.includes(value), `${subject} 必须包含 ${JSON.stringify(value)}`);
  }
}

test('init 归档代码结构、领域语言和历史决策', () => {
  const content = skill('isdd-init');
  includesAll(content, [
    'codegraph_explore',
    '统一领域术语',
    'ADR',
    '深模块 seam',
    '不得根据图结构臆测业务语义'
  ], 'init');
});

test('define 按风险调整澄清深度并保持范围和术语一致', () => {
  const content = skill('isdd-define');
  includesAll(content, [
    '能力地图',
    '显式列出会影响结果的重要假设',
    '仓库统一语言',
    '自行检查规格',
    'lite 模式只有在待决问题',
    '此阶段不得设计技术方案'
  ], 'define');
});

test('plan 强制垂直切片、依赖边、测试 seam 和计划自检', () => {
  const content = skill('isdd-plan');
  includesAll(content, [
    '垂直 tracer bullet',
    '明确的依赖边',
    '精确的仓库相对路径和符号',
    'RED 信号或基线观察',
    '最高且稳定的公共测试 seam',
    '最终计划进行规格对照检查',
    '推测性完整实现代码'
  ], 'plan');

  const template = read('assets/templates/plan.md');
  includesAll(template, [
    '依赖任务：',
    '路径 / 符号：',
    '测试 seam：',
    'RED / 基线：',
    'GREEN:',
    '验证：'
  ], 'plan 模板');
});

test('build 强制行为优先反馈和系统化调试', () => {
  const content = skill('isdd-build');
  includesAll(content, [
    'RED-GREEN-REFACTOR',
    '因为预期原因失败',
    '最小完整生产代码',
    '一个可证伪假设',
    '增加回归测试',
    '不得 commit、push、创建 PR、merge 或 deploy'
  ], 'build');
});

test('verify 保持需求符合度和工程质量相互独立', () => {
  const content = skill('isdd-verify');
  includesAll(content, [
    '**需求符合度：**',
    '**工程质量：**',
    '在用作证据前重新执行',
    'sdd-spec-reviewer',
    'sdd-quality-reviewer',
    '使用隔离上下文并行派发',
    '验证阶段不得修改实现'
  ], 'verify');

  const template = read('assets/templates/verification.md');
  includesAll(template, ['### 需求符合度', '### 工程质量'], 'verification 模板');
  assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'agents', 'sdd-spec-reviewer.md')));
  assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'agents', 'sdd-quality-reviewer.md')));
});

test('ship 保持外部动作授权独立并确保生产交付可回滚', () => {
  const content = skill('isdd-ship');
  includesAll(content, [
    '分阶段发布',
    '监控指标和阈值',
    '可执行回滚步骤',
    '--commit',
    '--push',
    '--create-mr',
    '任何一个参数都不授权 merge 或 deploy'
  ], 'ship');
});

test('README 说明社区复用、适配边界和许可', () => {
  const readme = read('README.md');
  includesAll(readme, [
    '# xingyun-sdd',
    '## 社区能力来源',
    'addyosmani/agent-skills',
    'obra/superpowers',
    'mattpocock/skills',
    '不是运行时依赖',
    'xingyun-sdd 有意保留',
    'THIRD_PARTY_NOTICES.md'
  ], 'README');

  const notices = read('THIRD_PARTY_NOTICES.md');
  includesAll(notices, [
    '# 第三方版权与许可说明',
    'Copyright (c) 2025 Addy Osmani',
    'Copyright (c) 2025 Jesse Vincent',
    'Copyright (c) 2026 Matt Pocock',
    'MIT License'
  ], '第三方许可说明');
});

test('全部面向智能体的工作流文档使用中文说明', () => {
  const skillNames = ['isdd-init', 'isdd-define', 'isdd-plan', 'isdd-build', 'isdd-verify', 'isdd-ship', 'isdd-status', 'security-audit'];
  for (const name of skillNames) {
    const content = skill(name);
    assert.match(content, /^description:\s*[^\n]*[\u4e00-\u9fff]/m, `${name} 的触发描述必须为中文`);
    assert.match(content, /^#\s+.*[\u4e00-\u9fff]/m, `${name} 的主标题必须为中文`);
  }

  for (const name of ['artifacts.md', 'codegraph.md', 'modes.md', 'workflow.md']) {
    assert.match(read(path.join('references', name)), /^#\s+.*[\u4e00-\u9fff]/, `${name} 的主标题必须为中文`);
  }

  for (const name of ['repository.md', 'policy.md']) {
    assert.match(read(path.join('assets', 'templates', name)), /^#\s+.*[\u4e00-\u9fff]/, `${name} 模板的主标题必须为中文`);
  }
});
