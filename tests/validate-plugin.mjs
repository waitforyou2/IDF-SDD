import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(ROOT, file)}: ${error.message}`);
    return {};
  }
}

// 1. codeagent-extension.json（GC/OC 场景清单）
const extensionFile = path.join(ROOT, 'codeagent-extension.json');
check(fs.existsSync(extensionFile), 'Missing codeagent-extension.json');
const extension = readJson(extensionFile);
check(extension.name === 'idf-sdd', 'codeagent-extension.json name must be idf-sdd');
check(typeof extension.description === 'string' && extension.description.length > 0, 'codeagent-extension.json description must be non-empty');
check(/^\d+\.\d+\.\d+$/.test(extension.version || ''), 'codeagent-extension.json version must be SemVer');

// 2. .cac-plugin/plugin.json（CAC 场景清单）
const cacPluginFile = path.join(ROOT, '.cac-plugin', 'plugin.json');
check(fs.existsSync(cacPluginFile), 'Missing .cac-plugin/plugin.json');
const cacPlugin = readJson(cacPluginFile);
check(cacPlugin.name === 'idf-sdd', '.cac-plugin/plugin.json name must be idf-sdd');
check(typeof cacPlugin.description === 'string' && cacPlugin.description.length > 0, '.cac-plugin/plugin.json description must be non-empty');
check(/^\d+\.\d+\.\d+$/.test(cacPlugin.version || ''), '.cac-plugin/plugin.json version must be SemVer');

// 3. 两个清单的 name/description/version 必须一致
check(extension.name === cacPlugin.name, 'name must match between codeagent-extension.json and .cac-plugin/plugin.json');
check(extension.description === cacPlugin.description, 'description must match between codeagent-extension.json and .cac-plugin/plugin.json');
check(extension.version === cacPlugin.version, 'version must match between codeagent-extension.json and .cac-plugin/plugin.json');

// 4. .mcp.json（CAC 场景 MCP）
const mcp = readJson(path.join(ROOT, '.mcp.json'));
check(mcp.mcpServers?.codegraph?.command === 'codegraph', 'CodeGraph MCP command must be codegraph');
check(JSON.stringify(mcp.mcpServers?.codegraph?.args) === JSON.stringify(['serve', '--mcp']), 'CodeGraph MCP args must be serve --mcp');

// 5. codeagent-extension.json 的 mcpServers（GC 场景 MCP）
check(extension.mcpServers?.codegraph?.command === 'codegraph', 'codeagent-extension.json mcpServers.codegraph.command must be codegraph');

// 6. hooks/hooks.json
const hooks = readJson(path.join(ROOT, 'hooks', 'hooks.json'));
check(Array.isArray(hooks.hooks?.SessionStart), 'SessionStart hook is missing');
check(fs.existsSync(path.join(ROOT, 'scripts', 'session-start.mjs')), 'SessionStart script is missing');

// 7. hooks.json 中的路径变量应为 ${CODEAGENT3_PLUGIN_ROOT}
const hooksRaw = fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8');
check(!hooksRaw.includes('CLAUDE_PLUGIN_ROOT'), 'hooks.json must not use ${CLAUDE_PLUGIN_ROOT}');
check(hooksRaw.includes('CODEAGENT3_PLUGIN_ROOT'), 'hooks.json must reference ${CODEAGENT3_PLUGIN_ROOT}');

// 8. skills（7 个，目录名 = SKILL.md name 字段，加 sdd- 前缀）
const expectedSkills = ['isdd-init', 'isdd-define', 'isdd-plan', 'isdd-build', 'isdd-verify', 'isdd-ship', 'isdd-status'];
for (const name of expectedSkills) {
  const file = path.join(ROOT, 'skills', name, 'SKILL.md');
  check(fs.existsSync(file), `Missing skill: ${name}`);
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  check(Boolean(frontmatter), `${name}/SKILL.md has no frontmatter`);
  check(new RegExp(`^name:\\s*${name}\\s*$`, 'm').test(frontmatter?.[1] || ''), `${name}/SKILL.md has the wrong name`);
  check(/^description:\s*\S.+$/m.test(frontmatter?.[1] || ''), `${name}/SKILL.md needs a description`);
  check(content.split(/\r?\n/).length < 500, `${name}/SKILL.md exceeds 500 lines`);

  for (const match of content.matchAll(/\]\((\.\.\/\.\.\/references\/[^)]+)\)/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    check(fs.existsSync(target), `${name}/SKILL.md references missing file ${match[1]}`);
  }
}

// 9. agents（2 个只读审查智能体）
const expectedAgents = ['sdd-spec-reviewer', 'sdd-quality-reviewer'];
for (const name of expectedAgents) {
  const file = path.join(ROOT, 'agents', `${name}.md`);
  check(fs.existsSync(file), `Missing review agent: ${name}`);
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  check(new RegExp(`^name:\\s*${name}\\s*$`, 'm').test(content), `${name}.md has the wrong name`);
  check(/^disallowedTools:\s*.*Write.*Edit/m.test(content), `${name}.md must be read-only`);
}
check(!fs.existsSync(path.join(ROOT, 'agents', 'sdd-reviewer.md')), 'Legacy combined reviewer must not remain');

// 10. scripts 语法检查和 help
for (const script of ['sdd.mjs', 'session-start.mjs']) {
  const file = path.join(ROOT, 'scripts', script);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  check(result.status === 0, `${script} syntax check failed: ${(result.stderr || '').trim()}`);
}

const help = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'sdd.mjs'), 'help'], { encoding: 'utf8' });
check(help.status === 0, `sdd.mjs help failed: ${(help.stderr || '').trim()}`);

// 11. 许可说明
check(fs.existsSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md')), 'Missing THIRD_PARTY_NOTICES.md');

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
for (const upstream of ['addyosmani/agent-skills', 'obra/superpowers', 'mattpocock/skills']) {
  check(readme.includes(upstream), `README must document community source: ${upstream}`);
}

// 12. 确认无 Claude Code 残留结构
check(!fs.existsSync(path.join(ROOT, '.claude-plugin')), 'Legacy .claude-plugin directory must not remain');
check(!fs.existsSync(path.join(ROOT, 'plugins')), 'Legacy plugins/ directory must not remain');

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`已验证 CodeAgent Extension 清单（codeagent-extension.json + .cac-plugin/plugin.json）、${expectedSkills.length} 个 Skill、${expectedAgents.length} 个审查智能体、MCP、Hook、脚本和许可说明。\n`);
