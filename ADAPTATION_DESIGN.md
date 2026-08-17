# IDF-SDD 适配 CodeAgent Extension 规范 — 设计文档

> **目标读者**：IDF-SDD 维护者、CodeAgent Extension 审核者
> **规范来源**：[Extension模板](https://wiki.huawei.com/domains/59421/wiki/286914/WIKI2026031610425678)（WIKI2026031610425678，最后更新 2026-08-06）
> **适配目标**：三种场景（GC/OC/CAC）全部兼容
> **当前版本**：1.2.0 → 适配后 **1.3.0**（结构破坏性变更，按 SemVer 升次版本）

---

## 一、适配总原则

1. **内部组件逻辑零改动**：skills/agents/hooks/mcp 的业务逻辑、归档契约、状态机、CodeGraph 集成方式保持不变。
2. **只改外层包装与定位变量**：把 Claude Code 的 Marketplace 双层结构改成 CodeAgent Extension 单层结构；把 Claude Code 专属变量替换为 CodeAgent 通用变量。
3. **三种场景同时兼容**：保留 CAC 场景必需的 `.cac-plugin/plugin.json` 和 `.mcp.json`，新增 GC/OC 场景必需的 `codeagent-extension.json`。
4. **命名空间扁平化**：CodeAgent Extension 规范不支持 `插件名:skill名` 命名空间，skill 的 name 就是目录名。为避免与系统或其他扩展的 `init`/`plan` 等通用名冲突，统一加 `sdd-` 前缀。

---

## 二、当前结构 vs 目标结构

### 2.1 当前结构（Claude Code Marketplace 双层）

```
IDF-SDD-main/
├── .claude-plugin/
│   └── marketplace.json          ← Marketplace 清单（Claude Code 专属）
├── package.json
├── README.md
├── THIRD_PARTY_NOTICES.md
├── plugins/
│   └── sdd/                      ← 实际插件嵌套在子目录
│       ├── .claude-plugin/
│       │   └── plugin.json       ← 插件元数据（Claude Code 专属）
│       ├── .mcp.json
│       ├── agents/
│       ├── skills/
│       ├── hooks/
│       ├── references/
│       ├── scripts/
│       ├── assets/
│       └── settings.json
└── tests/
```

### 2.2 目标结构（CodeAgent Extension 单层，三场景兼容）

```
IDF-SDD-main/                       ← extensionId = "idf-sdd"（= 目录名/ZIP 名）
├── codeagent-extension.json        ← 【新增】GC/OC 场景核心清单（规范 3.1）
├── .cac-plugin/
│   └── plugin.json                 ← 【保留+修改】CAC 场景插件元数据（规范 3.2）
├── .mcp.json                       ← 【保留原样】CAC 场景 MCP 配置（规范 3.3）
├── README.md                       ← 【修改】更新安装说明和命令名
├── package.json                    ← 【修改】版本号同步
├── THIRD_PARTY_NOTICES.md          ← 保留原样
├── agents/                         ← 拍平到根目录
│   ├── sdd-spec-reviewer.md
│   └── sdd-quality-reviewer.md
├── skills/                         ← 【重命名子目录】加 sdd- 前缀
│   ├── sdd-init/
│   │   └── SKILL.md
│   ├── sdd-define/
│   │   └── SKILL.md
│   ├── sdd-plan/
│   │   └── SKILL.md
│   ├── sdd-build/
│   │   └── SKILL.md
│   ├── sdd-verify/
│   │   └── SKILL.md
│   ├── sdd-ship/
│   │   └── SKILL.md
│   └── sdd-status/
│       └── SKILL.md
├── hooks/
│   └── hooks.json                  ← 【修改】路径变量替换
├── references/                     ← 保留原样（内容修改见 §5）
│   ├── artifacts.md
│   ├── codegraph.md
│   ├── modes.md
│   └── workflow.md
├── scripts/                        ← 拍平到根目录
│   ├── sdd.mjs                     ← 【修改】命令名映射和提示文案
│   └── session-start.mjs           ← 【修改】提示文案
├── assets/
│   └── templates/
├── settings.json                   ← 保留原样
└── tests/
    ├── sdd-cli.test.mjs            ← 【修改】同步命令名和路径
    ├── skill-contract.test.mjs     ← 【修改】同步 skill name
    └── validate-plugin.mjs         ← 【修改】重写校验逻辑
```

### 2.3 删除项

| 文件/目录 | 原因 |
|---|---|
| `.claude-plugin/marketplace.json` | Claude Code 专属清单，CodeAgent 不识别 |
| `plugins/sdd/.claude-plugin/` | Claude Code 专属插件元数据目录，整体移除（`.cac-plugin/plugin.json` 替代其作用） |
| `plugins/` 中间层目录 | 单层结构不需要嵌套 |

---

## 三、改动详情

### 3.1 新增 `codeagent-extension.json`（根目录，必改）

**规范依据**：§3.1，GC/OC 场景的核心清单文件。

**合并来源**：marketplace.json（name/version/description）+ plugin.json（无额外字段）+ .mcp.json（mcpServers）。

```json
{
  "name": "idf-sdd",
  "version": "1.3.0",
  "description": "智能数据底座开发组统一的、归档驱动的软件设计与交付工作流。",
  "mcpServers": {
    "codegraph": {
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    }
  }
}
```

**字段校验对照**（规范 §3.1）：

| 字段 | 规范要求 | 当前值 | 合规 |
|---|---|---|---|
| `name` | 必填，非空，与 extensionId 一致，无 `@` | `idf-sdd`（= 目录名） | ✅ |
| `description` | 必填，非空 | 智能数据底座开发组统一的、归档驱动的软件设计与交付工作流。 | ✅ |
| `version` | 可选，SemVer | `1.3.0` | ✅ |
| `mcpServers` | 可选，GC 场景 MCP 配置 | codegraph stdio | ✅ |

> **OC 场景补充**：若后续需要 remote MCP（如 jira），在 `codeagent-extension.json` 增加 `mcp` 字段（规范 §3.1 示例）。当前 codegraph 是本地 stdio，`mcpServers` 字段即可被 GC 场景解析。

---

### 3.2 修改 `.cac-plugin/plugin.json`（CAC 场景，必改）

**规范依据**：§3.2，CAC 场景插件元数据。

**改动**：`description` 必须与 `codeagent-extension.json` 中的 description **完全一致**（规范 §3.2 字段校验规则明确要求）。当前两处措辞不同，统一为同一句话。`name` 也同步。

```json
{
  "name": "idf-sdd",
  "description": "智能数据底座开发组统一的、归档驱动的软件设计与交付工作流。",
  "version": "1.3.0",
  "author": {
    "name": "智能数据底座开发组"
  },
  "keywords": [
    "sdd",
    "engineering-workflow",
    "codegraph",
    "requirements",
    "verification"
  ]
}
```

> `author`/`keywords` 非规范字段，但 CAC 场景解析器会忽略未知字段，保留不影响合规。

---

### 3.3 `.mcp.json` 保留原样

**规范依据**：§3.3，CAC 场景 MCP 配置。

当前内容已符合规范示例格式（`mcpServers` + `command`/`args`），无需修改：

```json
{
  "mcpServers": {
    "codegraph": {
      "type": "stdio",
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    }
  }
}
```

> `type: "stdio"` 字段非规范强制，但属合法扩展，保留。

---

### 3.4 修改 `hooks/hooks.json`（路径变量替换）

**规范依据**：§4.4，Hooks 组件。

**改动**：`${CLAUDE_PLUGIN_ROOT}` → `${CAC_PLUGIN_ROOT}`（CAC 场景标准变量，规范 §3.3 示例使用）。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CAC_PLUGIN_ROOT}/scripts/session-start.mjs\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**校验对照**（规范 §4.4）：

| 校验项 | 状态 |
|---|---|
| `hooks` 属性存在且为 JSONObject | ✅ |
| EventType `SessionStart` 在 `ExtensionEventEnum` 枚举内 | ✅ |
| HookType `command` 在 `ExtensionHookTypeEnum` 枚举内 | ✅ |

> **GC 场景不确定性**：规范未明确 GC 场景 hooks.json 的扩展根变量名（§3.1 示例用 `${extensionPath}`，但那是 mcpServers 的 cwd，不是 hooks）。先按 CAC 场景 `${CAC_PLUGIN_ROOT}` 实施；GC 场景若不识别，后续在 `codeagent-extension.json` 层补充 hooks 配置或实测后调整。此项标记为**待实测验证**。

---

### 3.5 命名空间扁平化（skills 重命名 + 全局命令名替换）

**规范依据**：§4.3，skill 的 name = 目录名，无命名空间机制。

#### 3.5.1 skill 目录与 name 字段重命名

| 原目录 | 原 name | 新目录 | 新 name |
|---|---|---|---|
| `skills/init/` | `init` | `skills/sdd-init/` | `sdd-init` |
| `skills/define/` | `define` | `skills/sdd-define/` | `sdd-define` |
| `skills/plan/` | `plan` | `skills/sdd-plan/` | `sdd-plan` |
| `skills/build/` | `build` | `skills/sdd-build/` | `sdd-build` |
| `skills/verify/` | `verify` | `skills/sdd-verify/` | `sdd-verify` |
| `skills/ship/` | `ship` | `skills/sdd-ship/` | `sdd-ship` |
| `skills/status/` | `status` | `skills/sdd-status/` | `sdd-status` |

**规范校验**：§4.3 要求"子目录名 = SKILL.md 中 name 字段"，重命名后仍满足。

#### 3.5.2 命令调用形式变更

CodeAgent 无 `/插件名:skill名` 命名空间，skill 通过 name 直接调用。命令形式变更：

| 原调用 | 新调用 |
|---|---|
| `/sdd:init` | `/sdd-init` |
| `/sdd:define <需求>` | `/sdd-define <需求>` |
| `/sdd:plan <id>` | `/sdd-plan <id>` |
| `/sdd:build <id>` | `/sdd-build <id>` |
| `/sdd:verify <id>` | `/sdd-verify <id>` |
| `/sdd:ship <id> --create-pr` | `/sdd-ship <id> --create-pr` |
| `/sdd:status` | `/sdd-status` |

#### 3.5.3 全局 `/sdd:xxx` 引用替换清单

以下文件中所有 `/sdd:<name>` 需替换为 `/sdd-<name>`：

| 文件 | 引用数量 | 改动类型 |
|---|---|---|
| `README.md` | 8 处 | 命令示例和说明 |
| `scripts/sdd.mjs` | 9 处 | `NEXT_COMMAND` 映射表 + 提示文案 |
| `scripts/session-start.mjs` | 2 处 | 提示文案 |
| `references/workflow.md` | 7 处 | 生命周期表和说明 |
| `skills/sdd-init/SKILL.md` | 1 处（description） | 自引用 |
| `skills/sdd-define/SKILL.md` | 1 处 + 1 处引用 status | description + 流程内引用 |
| `skills/sdd-plan/SKILL.md` | 1 处 + 1 处引用 status | description + 流程内引用 |
| `skills/sdd-build/SKILL.md` | 1 处（description） | 自引用 |
| `skills/sdd-verify/SKILL.md` | 1 处 + 2 处 codegraph 命令 | description + sync/status 命令（不变） |
| `skills/sdd-ship/SKILL.md` | 3 处 | description + 流程内引用 |
| `skills/sdd-status/SKILL.md` | 1 处（description） | 自引用 |
| `agents/sdd-spec-reviewer.md` | 1 处（description） | 引用 verify |
| `agents/sdd-quality-reviewer.md` | 1 处（description） | 引用 verify |
| `tests/sdd-cli.test.mjs` | 待核查 | 测试用例命令名 |
| `tests/skill-contract.test.mjs` | 待核查 | skill name 断言 |
| `tests/validate-plugin.mjs` | 7 处 | `expectedSkills` 数组 |

> **注意**：`codegraph sync` / `codegraph status` 命令中的 `status` 是 codegraph 子命令，不是 sdd skill，**不替换**。只替换 `/sdd:status` 这种 sdd 命令引用。

---

### 3.6 skills/agents/scripts 中的路径变量替换

**改动**：`${CLAUDE_PLUGIN_ROOT}` → `${CAC_PLUGIN_ROOT}`；`${CLAUDE_PROJECT_DIR}` 保留（CodeAgent CLI 兼容此变量，且 scripts 内有 `process.cwd()` fallback）。

#### 替换清单

| 文件 | `${CLAUDE_PLUGIN_ROOT}` | `${CLAUDE_PROJECT_DIR}` |
|---|---|---|
| `hooks/hooks.json` | 1 处 | — |
| `skills/sdd-init/SKILL.md` | 2 处 | 2 处 |
| `skills/sdd-define/SKILL.md` | 3 处 | 3 处 |
| `skills/sdd-plan/SKILL.md` | 2 处 | 2 处 |
| `skills/sdd-build/SKILL.md` | 2 处 | 2 处 |
| `skills/sdd-verify/SKILL.md` | 3 处 | 5 处 |
| `skills/sdd-ship/SKILL.md` | 3 处 | 3 处 |
| `skills/sdd-status/SKILL.md` | 1 处 | 2 处 |
| `references/workflow.md` | 1 处 | — |
| `scripts/sdd.mjs` | — | 1 处（env 读取） |
| `scripts/session-start.mjs` | — | 1 处（env 读取） |

**合计**：`${CLAUDE_PLUGIN_ROOT}` 约 18 处，`${CLAUDE_PROJECT_DIR}` 约 20 处（保留不变）。

> **scripts 内部的 env 读取**：`process.env.CLAUDE_PROJECT_DIR` 保留，因为 CodeAgent CLI 会设置此环境变量，且有 `process.cwd()` fallback。若实测 GC 场景不设置此 env，再补 `process.env.CAC_PROJECT_DIR ||` 兜底。

---

### 3.7 修改 `tests/validate-plugin.mjs`（校验脚本重写）

**改动原因**：目录拍平后，原脚本基于 marketplace.json 的校验逻辑全部失效。

**新校验逻辑要点**：

1. 校验 `codeagent-extension.json` 存在，`name === 'idf-sdd'`，`description` 非空，`version` 符合 SemVer。
2. 校验 `.cac-plugin/plugin.json` 存在，`name`/`description`/`version` 与 `codeagent-extension.json` **完全一致**。
3. 校验 `.mcp.json` 的 `mcpServers.codegraph` 配置。
4. 校验 `hooks/hooks.json` 的 `SessionStart` hook 和 `scripts/session-start.mjs` 存在。
5. 校验 7 个 skill 目录（`sdd-init` 等），目录名与 SKILL.md `name` 字段一致，description 非空。
6. 校验 2 个 agent 文件存在且 `disallowedTools` 包含 Write/Edit（只读审查）。
7. 校验 scripts 语法和 `sdd.mjs help` 可运行。
8. 校验 `THIRD_PARTY_NOTICES.md` 存在。
9. 校验 README 包含社区来源声明。

---

### 3.8 修改 `package.json` 和 `README.md`

**package.json**：`version` 同步为 `1.3.0`。

**README.md**：
- 安装说明从 Claude Code 的 `/plugin marketplace add` 改为 CodeAgent Extension 安装方式。
- 命令示例 `/sdd:xxx` → `/sdd-xxx`。
- 环境要求中 "Claude Code" 改为 "CodeAgent CLI 或兼容工具"。

---

## 四、合规性自检矩阵

对照规范章节，逐项确认适配后合规性：

| 规范章节 | 规范要求 | 适配后状态 |
|---|---|---|
| §2.1 目录结构 | 单层结构，`codeagent-extension.json` 在根 | ✅ |
| §3.1 codeagent-extension.json | name/description/version/mcpServers | ✅ |
| §3.2 .cac-plugin/plugin.json | name/description/version，description 与 §3.1 一致 | ✅ |
| §3.3 .mcp.json | mcpServers + command/args | ✅ |
| §4.1 command | 无 command 组件 | N/A |
| §4.2 agent | `agents/` 一级 .md，name=文件名，description 从 frontmatter | ✅ |
| §4.3 skill | `skills/一级子目录/SKILL.md`，目录名=name，description 必填 | ✅ |
| §4.4 hooks | hooks.json，EventType/HookType 合法枚举 | ✅ |
| §4.5 mcp | codeagent-extension.json 的 mcp 字段（OC 场景） | N/A（当前无 remote mcp） |
| §4.6 plugin | `plugins/` 一级 .ts（OC 场景 TS 插件） | N/A |
| §5.1 版本号 | SemVer，新版本 > 当前最新 | ✅ 1.3.0 |
| §5.3 其他 | name ≤50 字符，无 `@`，与清单一致 | ✅ |

---

## 五、风险与待验证项

| 风险项 | 影响 | 缓解措施 |
|---|---|---|
| GC 场景 hooks.json 的 `${CAC_PLUGIN_ROOT}` 是否被识别 | SessionStart hook 可能不触发 | 上传后在 GC 场景实测；若失败，改用 `${extensionPath}` 或在 codeagent-extension.json 补 hooks 配置 |
| CodeAgent CLI 是否设置 `CLAUDE_PROJECT_DIR` 环境变量 | scripts 内业务仓库路径定位失败 | 已有 `process.cwd()` fallback；若实测失败，补 `CAC_PROJECT_DIR` env 兜底 |
| `/sdd-xxx` 命令名是否被 CodeAgent 正确注册为可调用 skill | 用户无法通过斜杠命令触发 | 上传后测试 `/sdd-init` 调用；CodeAgent skill 调用机制规范未详述，需实测 |
| skill name 加 `sdd-` 前缀后 description 中的自引用需同步 | description 文案与实际命令名不一致 | 已纳入 §3.5.3 替换清单，全部同步 |
| OC 场景未配置 TS plugin 和 remote mcp | OC 场景功能受限 | 当前 OC 场景非主目标；后续按需补充 `mcp` 字段和 `plugins/*.ts` |

---

## 六、实施顺序

建议按以下顺序实施，每步可独立验证：

1. **目录拍平**：`plugins/sdd/*` → 根目录；删除 `.claude-plugin/` 和 `plugins/`。
2. **新增清单**：创建 `codeagent-extension.json`；修改 `.cac-plugin/plugin.json`。
3. **命名空间改造**：重命名 7 个 skill 目录 + SKILL.md name 字段。
4. **全局命令名替换**：`/sdd:xxx` → `/sdd-xxx`（15 个文件）。
5. **路径变量替换**：`${CLAUDE_PLUGIN_ROOT}` → `${CAC_PLUGIN_ROOT}`（18 处）。
6. **scripts 更新**：sdd.mjs 的 NEXT_COMMAND 映射和提示文案。
7. **测试脚本重写**：validate-plugin.mjs + 其他 test 文件。
8. **文档更新**：README.md 安装说明和命令示例；package.json 版本号。
9. **本地验证**：`node tests/validate-plugin.mjs` + `npm test`。
10. **打包验证**：ZIP 打包，检查无路径穿越、条目数和大小符合 §5.2。

---

## 七、改动量汇总

| 类型 | 文件数 | 说明 |
|---|---|---|
| 新增 | 1 | codeagent-extension.json |
| 删除 | 2 | marketplace.json、plugins/sdd/.claude-plugin/plugin.json |
| 移动（拍平） | ~25 | plugins/sdd/* → 根目录 |
| 重命名 | 7 | skill 目录 init→sdd-init 等 |
| 内容修改 | ~15 | 路径变量 + 命令名 + description 同步 |
| 重写 | 1 | validate-plugin.mjs |
| 不动 | ~10 | references（除 workflow.md）、assets、settings.json、agents 内容（除 description） |

**总评**：核心业务逻辑零改动，改动集中在结构重组和标识符替换，属机械性批量变更，风险可控。
