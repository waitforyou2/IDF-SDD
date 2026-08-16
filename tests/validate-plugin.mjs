import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKETPLACE_FILE = path.join(ROOT, '.claude-plugin', 'marketplace.json');
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

check(fs.existsSync(MARKETPLACE_FILE), 'Missing .claude-plugin/marketplace.json');
const marketplace = readJson(MARKETPLACE_FILE);
check(marketplace.name === 'idf-sdd', 'Marketplace name must be idf-sdd');
check(Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1, 'Marketplace must contain exactly one plugin');

const entry = marketplace.plugins?.[0] || {};
const pluginRoot = path.resolve(ROOT, entry.source || 'missing');
check(pluginRoot.startsWith(`${ROOT}${path.sep}`), 'Plugin source must remain inside the marketplace');
check(fs.existsSync(pluginRoot), `Plugin source does not exist: ${entry.source}`);

const manifest = readJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
check(manifest.name === 'sdd', 'Plugin manifest name must be sdd');
check(manifest.version === entry.version, 'Plugin and marketplace versions must match');
check(fs.existsSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md')), 'Missing THIRD_PARTY_NOTICES.md');

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
for (const upstream of ['addyosmani/agent-skills', 'obra/superpowers', 'mattpocock/skills']) {
  check(readme.includes(upstream), `README must document community source: ${upstream}`);
}

const expectedSkills = ['init', 'define', 'plan', 'build', 'verify', 'ship', 'status'];
for (const name of expectedSkills) {
  const file = path.join(pluginRoot, 'skills', name, 'SKILL.md');
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

const expectedAgents = ['sdd-spec-reviewer', 'sdd-quality-reviewer'];
for (const name of expectedAgents) {
  const file = path.join(pluginRoot, 'agents', `${name}.md`);
  check(fs.existsSync(file), `Missing review agent: ${name}`);
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  check(new RegExp(`^name:\\s*${name}\\s*$`, 'm').test(content), `${name}.md has the wrong name`);
  check(/^disallowedTools:\s*.*Write.*Edit/m.test(content), `${name}.md must be read-only`);
}
check(!fs.existsSync(path.join(pluginRoot, 'agents', 'sdd-reviewer.md')), 'Legacy combined reviewer must not remain');

const hooks = readJson(path.join(pluginRoot, 'hooks', 'hooks.json'));
check(Array.isArray(hooks.hooks?.SessionStart), 'SessionStart hook is missing');
check(fs.existsSync(path.join(pluginRoot, 'scripts', 'session-start.mjs')), 'SessionStart script is missing');

const mcp = readJson(path.join(pluginRoot, '.mcp.json'));
check(mcp.mcpServers?.codegraph?.command === 'codegraph', 'CodeGraph MCP command must be codegraph');
check(JSON.stringify(mcp.mcpServers?.codegraph?.args) === JSON.stringify(['serve', '--mcp']), 'CodeGraph MCP args must be serve --mcp');

for (const script of ['sdd.mjs', 'session-start.mjs']) {
  const file = path.join(pluginRoot, 'scripts', script);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  check(result.status === 0, `${script} syntax check failed: ${(result.stderr || '').trim()}`);
}

const help = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'sdd.mjs'), 'help'], { encoding: 'utf8' });
check(help.status === 0, `sdd.mjs help failed: ${(help.stderr || '').trim()}`);

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`已验证 IDF-SDD Marketplace、插件、${expectedSkills.length} 个 Skill、${expectedAgents.length} 个审查智能体、许可说明、Hook、MCP 和脚本。\n`);
