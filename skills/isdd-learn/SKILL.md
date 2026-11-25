---
name: isdd-learn
description: 为 SDD 变更、任意 Git Commit/分支、CodeHub MR 或存量代码模块生成“检视即学习”导览，产出高颜值离线精装代码研读本、行内朱批与苏格拉底反向检视，并维护跨仓库个人认知账本。用户执行 /isdd-learn、学习同事代码、复盘需求实现或回传研读批注时使用。
---

# 检视即学习导览

## 目标

彻底消除 AI 编程带来的“黑盒理解债”与开发者能力退化：将平铺 Diff 重构为按运行时执行流组织的精装研读体验，只讲高价值增量（新 API、设计巧思、隐藏边界、排障地图），并通过 2–3 道实战思考题边学边查真实漏洞。所有大段源码分析必须交由独立只读 Subagent 完成，保护主会话上下文不被撑爆。

调用参数：`$ARGUMENTS`

## 支持的调用形式

- `/isdd-learn <change-id>`：研读当前仓库的 SDD 变更（结合 `spec.md`、`plan.md`、Diff 与 Co-Build 亲手编写标记）。
- `/isdd-learn --commit <sha>` 或 `/isdd-learn --range <A..B>`：研读同事或历史任意 Commit / 分支改动。
- `/isdd-learn --mr <iid或URL> [--repo <org/repo>]`：研读 CodeHub 任意 MR（自动一并提取评审区里的资深点评）。
- `/isdd-learn --path <目录或文件>`：存量黑盒模块考古，生成核心调用链与排障地图。
- `/isdd-learn --sync '<JSON>'`：接收离线网页端复制回传的同步指令，更新 `~/.xingyun-sdd/learning-profile.yaml` 并处理用户标记的 Bug/批注。

## 执行流程

### A. 若参数包含 `--sync`（网页端回传闭环）

1. 执行同步脚本更新跨仓库个人认知账本：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/learn.mjs" sync --payload '<JSON>'
   ```

2. 汇总本次更新：新增 `已悟` 知识点数、新增 `待巩固` 盲区数。
3. 若载荷中包含 `review_notes` 或 `quiz_flagged_bugs`，逐条展示给用户确认，询问是否立即定位修复对应代码（若处于 SDD 变更流程中，修复后须重新走 `/isdd-verify` 刷新指纹）。

### B. 标准学习导览流程

1. **确定性素材采集（零主会话大段读取）**：根据参数调用 `prepare` 生成 `.isdd-learn/<slug>/context.json`（已自动携带 `~/.xingyun-sdd/learning-profile.yaml` 中用户已掌握的知识黑名单与薄弱项）：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/learn.mjs" prepare <来源参数> --root "${CLAUDE_PROJECT_DIR}"
   ```

2. **派发独立只读 Subagent（严禁在主会话直接塞入全量 Diff 编写长篇导览）**：
   - 派发 `sdd-learn-guide` 只读 Subagent，只传 `contextPath`、`tourPath` 和目标仓库路径。
   - `sdd-learn-guide` 在隔离上下文中读取 `context.json`、按需调用 `codegraph_explore` 补全调用链，过滤掉用户已掌握的知识点，将结构化 JSON 返回给主会话写入 `.isdd-learn/<slug>/tour.json`（注意：Subagent 只输出 `file + startLine..endLine` 与 `humanLines`，不手抄源码）。
3. **确定性源码回填与高颜值离线 HTML 渲染**：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/learn.mjs" render --slug <slug> --root "${CLAUDE_PROJECT_DIR}"
   ```

   脚本会从仓库真实源码精确回填代码行与行号（零幻觉）、标记用户 Co-Build 亲手编写的代码段（`✦ 亲手共建` 烫金标线），并静态注入精装模板生成 `.isdd-learn/<slug>/index.html`。
4. **双载体呈现与轻量交互**：
   - 始终输出简明扼要的**终端全景摘要**（一句话本质 + 核心站点列表 + 折叠样板数 + 离线 HTML 路径）。
   - 若用户希望在浏览器中打开精美交互页，可运行即用即停本地服务规避 `file://` 限制：

     ```bash
     node "${CODEAGENT3_PLUGIN_ROOT}/scripts/learn.mjs" open --slug <slug> --root "${CLAUDE_PROJECT_DIR}"
     ```

   - 在纯 CLI 场景下，依次引导用户进行 **2–3 题苏格拉底反向检视**（先问不剧透，用户用大白话作答后点评，若抓出真实代码漏洞立刻记入修复清单），并输出「1 分钟排障急救卡」。
5. **沉淀认知账本**：交互结束时调用 `scripts/learn.mjs sync` 将用户确认掌握或存疑的知识点写入 `~/.xingyun-sdd/learning-profile.yaml`。

## 完成条件

- 大段 Diff 与导览分析由独立 Subagent `sdd-learn-guide` 完成，未污染主会话上下文。
- 源码行号由 `scripts/learn.mjs render` 从真实文件校验并回填，无编造行号或抄错代码。
- 用户亲手共建的代码段已通过 `humanLines` 准确标记。
- 生成的 `.isdd-learn/<slug>/index.html` 可离线打开且零外部 CDN 依赖。
- 个人认知账本保存在用户目录 `~/.xingyun-sdd/learning-profile.yaml`，不污染业务 Git 仓库。

## 禁止行为

- 不得由 LLM 手写整份 HTML/CSS/JS 页面，必须走 `tour.json` + `scripts/learn.mjs render`。
- 不得把 `.isdd-learn/` 临时研读产物提交进业务 Git 仓库。
- 不得对 `learning-profile.yaml` 中已标为 `understood`/`practiced` 的旧概念反复长篇科普。
- 不得在未询问用户前直接修改业务源码或跳过苏格拉底思考直接剧透全部答案。
