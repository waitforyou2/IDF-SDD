---
name: isdd-init
description: 初始化或修复业务 Git 仓库的 xingyun-sdd 环境，建立本地 CodeGraph 索引，识别工程命令，并创建随代码提交的架构、领域语言、决策和团队策略上下文。用户执行 /isdd-init、首次接入 xingyun-sdd，或需要修复缺失或过期的仓库元数据时使用。
---

# 初始化 xingyun-sdd

## 目标

一次性准备业务仓库，让后续阶段能够使用经过验证的代码结构、项目领域语言、历史决策、团队策略和确定性的状态流转。

调用参数：`$ARGUMENTS`

## 执行流程

1. 解析 Git 根目录并检查 `git status --short`。保留所有现有用户变更。不得在包含多个无关仓库的父目录中初始化。
2. 阅读 [CodeGraph 集成规范](../../references/codegraph.md)和[归档契约](../../references/artifacts.md)。
3. 执行初始化脚本，由脚本统一处理 CodeGraph、CodeCheck 和 CodeHub CLI 的安装和验证。**不要自行手动安装这些工具**——脚本内部会使用正确的私有仓库地址和 scope registry 配置进行安装，手动安装可能使用错误的 registry 导致失败：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" init --root "${CLAUDE_PROJECT_DIR}"
   ```

   脚本会依次执行：CodeGraph 安装和索引、CodeCheck CLI 安装（`@baize/codecheckcli`，使用 `@baize:registry` 私有仓库）、CodeHub CLI 安装（`@codehub/codehub-cli`，使用 `@codehub:registry` 私有仓库）。安装时临时配置私有仓库并禁用 SSL 校验，安装后恢复原配置。安装结果在脚本输出的 JSON 中包含 `codegraph_*`、`codecheck_*`、`codehub_*` 字段。
4. 检查 CodeHub CLI 认证状态。先清除可能存在的 `CODEHUB_TOKEN` 环境变量（它会覆盖 W3 认证导致 401），再运行 `codehub-cli auth status`。已登录则跳过。未登录时，从 `whoami` 或 `git config user.name` 获取用户工号，提示用户在独立终端运行 `codehub-cli auth login --w3 --username <工号> --all`（W3 登录，一键登录所有地域），在终端中输入 W3 密码完成登录。告诉用户完成后回来确认，然后重新检查 `codehub-cli auth status`。不得在当前会话中直接传密码。
5. 扫描当前仓库中用户的未完成 MR。认证通过后，从 `codehub-cli auth status` 或 `codehub-cli user info` 输出中获取当前用户工号。然后判断仓库模式：
   - 运行 `git remote -v` 获取 remote URL，解析出仓库路径（如 `b00937887/CMCManagementOperationsService`）。
   - 解析 remote URL 中是否包含当前用户工号。
   - **非 fork 模式**（remote URL 不含用户工号）：直接用当前仓库路径查 MR：
     ```bash
     codehub-cli mr list -p "<当前仓库路径>" --state opened --author <工号> --format json
     ```
   - **fork 模式**（remote URL 含用户工号）：MR 建在主仓库上，不在 fork 仓库上。先用 `codehub-cli project view -p "<fork仓库路径>" --format json` 获取 `forked_from_project` 字段拿到主仓库路径，再用主仓库路径查 MR：
     ```bash
     codehub-cli mr list -p "<主仓库路径>" --state opened --author <工号> --format json
     ```
   有未完成 MR 时告知用户每个 MR 的标题、URL 和状态摘要（门禁是否通过、是否有未处理检视意见），询问用户是否要先处理这些 MR 再开始新需求。用户选择跳过时继续 init 流程。

6. 使用一次聚焦的 `codegraph_explore` 仓库分析，覆盖仓库职责、入口、模块边界、主要调用流程、测试布局和高影响区域。构建文件、说明文档、配置、提交历史和 ADR 等图谱无法解释的内容，直接读取原文件。
7. **重新生成** `docs/isdd/repository.md`，用模板结构基于最新 CodeGraph 索引和仓库证据填写全部内容。重复初始化时整体重写，不做增量更新，确保文档始终反映仓库最新状态。至少包括：
   - 仓库职责、非职责、入口和深模块 seam；
   - 统一领域术语，以及不得混用的术语；
   - 已存在的 ADR 或其他持久决策记录；
   - 测试位置和成本最低的有效反馈命令；
   - 敏感区域、生成代码、兼容边界和代码归属。
8. 确认或修正 `docs/isdd/repository.yaml`，记录 CodeGraph 状态和至少一条实际可运行的低成本验证命令。不得根据图结构臆测业务语义或架构决策原因。检查评审人配置：如果 `reviewers` 列表或 `reviewer` 字段已有值则保留；如果都为空，**必须询问用户是否要填写评审人工号**，告知用户可以跳过（跳过则创建 MR 时会再次提醒，也可自行在 CodeHub 网站上填写）。用户提供后写入 `repository.yaml` 的 `reviewers` 列表字段。这些工号在 ship 阶段创建 MR 时通过 `--reviewers` 传入 CodeHub，填一次后后续 init 会自动保留。
9. `docs/isdd/repository.md`、`docs/isdd/repository.yaml` 和 `docs/isdd/policy.md` 是本地辅助文件，不提交到代码仓库（已被 `.gitignore` 忽略）。每次 init 时重新生成，确保始终反映仓库最新状态。`docs/isdd/changes/` 下的需求归档文件（spec.md、plan.md、verification.md、delivery.md）仍然随代码提交。
10. 执行：

    ```bash
    node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" validate --repo --root "${CLAUDE_PROJECT_DIR}"
    ```

11. 报告新增或修改的文件、CodeGraph 健康状态、工具链安装和认证状态、未完成 MR 提醒、识别出的工程命令、验证证据，以及仍需团队确认的事实。工具链安装状态只在会话报告中告知用户，不写入 `repository.md`。

## 完成条件

- `docs/isdd/repository.yaml`、`docs/isdd/repository.md` 和 `docs/isdd/policy.md` 均通过校验。
- `.codegraph/` 已存在，且 `codegraph status` 成功。
- CodeCheck CLI 已安装且 `codecheck --version` 可执行。
- CodeHub CLI 已安装且 `codehub-cli --version` 可执行。
- CodeHub CLI 已认证（已运行 `codehub-cli auth login --w3 --all`），或已在报告中明确标记待用户登录。
- `.codegraph/` 被 Git 忽略，而 `docs/isdd/` 保持可提交。
- 仓库架构和工程命令都有直接证据支持。
- 已记录统一领域语言和历史决策，或明确说明当前不存在。
- 未修改任何无关工作区内容。

## 禁止行为

- 未检查图谱和构建文件，就将生成的仓库上下文视为事实。
- 提交 `.codegraph/`。
- 静默安装 CodeGraph。
- 重复初始化时覆盖团队策略或仓库上下文。
- 把 CodeGraph 结构当成业务术语或架构决策原因的来源。
