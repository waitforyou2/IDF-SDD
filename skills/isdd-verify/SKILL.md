---
name: isdd-verify
description: 将需求符合度和工程质量作为两个独立审查轴，使用固定 diff、最新执行证据、CodeGraph 影响分析和 strict 模式独立 Agent，验证 BUILT 状态的 IDF-SDD 变更。用户执行 /isdd-verify、要求交付前审查，或失败和评审修复后需要重新验证时使用。
---

# 验证审查

## 目标

同时证明实现的是正确需求，并且实现质量合格。在两项审查完成前，始终分开记录需求符合度和工程质量。验证阶段不得静默修改失败代码。

调用参数：`$ARGUMENTS`

## 执行流程

1. 解析 change id，要求当前状态为 `BUILT`。阅读 `spec.md`、`plan.md`、`docs/isdd/policy.md`、`docs/isdd/repository.yaml`、[CodeGraph 集成规范](../../references/codegraph.md)和[归档契约](../../references/artifacts.md)。
2. 影响分析前同步并检查 CodeGraph：

   ```bash
   codegraph sync "${CLAUDE_PROJECT_DIR}"
   codegraph status "${CLAUDE_PROJECT_DIR}"
   ```

3. 创建或复用验证归档：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" artifact verification --id <id> --root "${CLAUDE_PROJECT_DIR}"
   ```

4. 以 `base_ref` 固定审查起点，检查范围内全部已提交和工作区 diff。使用 `codegraph_explore` 分析变更符号、调用方、路由、边界跨越、受影响测试、兼容性和影响范围。CodeGraph 提示文件待同步或过期时，直接读取文件。
5. 每条测试、构建、lint、类型、安全或确定性观察，都必须在用作证据前重新执行。记录准确命令、退出结果和关键信号。build 阶段的历史证据只能作为上下文，不能证明当前工作区。
6. 执行 CodeCheck 门禁检查：
   - init 阶段已通过 npm 全局安装 `@baize/codecheckcli` 确保 codecheck CLI 可用。
   - **直接用 `codecheck fullcheck -f "<file1>,<file2>,..."` 指定变更文件路径执行全量检查**，不要先尝试基于 git diff 自动检测。从 plan.md 的实现步骤或 `git diff --name-only` 获取变更文件列表，用逗号拼接后通过 `-f` 传给 codecheck。例如：`codecheck fullcheck -f "models/kb.py,prompts/templates/analysis_system.md,tests/test_schema.py"`。
   - **只执行一次检查**，不要重复尝试不同方式。
   - **检查到的全部告警都必须修复**，不区分是本次新增还是存量代码遗留。修复后重新执行一次检查确认告警已清除。
   - 记录扫描范围（文件列表）、告警数量、修复结果和最终状态到 verification.md 的 CodeCheck 门禁章节。0 告警时写"无告警"。
   - 告警全部修复且复查无新增告警后才能通过验证。
7. 分别执行两项审查，任何一项都不能替代另一项：
   - **需求符合度：** 把每条验收条件映射到证据，检查可观察行为、非目标、范围漂移和已记录的计划偏差。
   - **工程质量：** 检查仓库规范、测试质量与 seam、正确性、错误处理、安全、性能、兼容、数据安全、依赖、死代码、文档、运维和回滚。
8. 根据模式控制审查深度：
   - Lite：在 `verification.md` 中简洁但明确地分别记录两项审查。
   - Standard：分两次独立执行审查；平台支持时使用新鲜的只读 Agent，不支持时记录该限制。
   - Strict：使用隔离上下文并行派发 `sdd-spec-reviewer` 和 `sdd-quality-reviewer`。只提供原始 spec、plan、固定 diff、CodeGraph 证据和实际命令输出，不得提供预期结论。合并报告并解决全部阻塞问题。
9. 任何检查或审查失败时，保留失败证据，验证阶段不得修改实现。写入 `Verdict: FAIL` 并返回规划状态：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to PLANNED --root "${CLAUDE_PROJECT_DIR}"
   ```

9. 只有每条验收条件通过、两项审查清晰、要求命令为最新结果且不存在未解决阻塞时，才能写入 `Verdict: PASS` 并流转：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to VERIFIED --root "${CLAUDE_PROJECT_DIR}"
   ```

10. 变更已在 `VERIFIED` 状态但实现文件在验证后发生了合法修改（如评审反馈的修复、文档订正）时，直接重新执行完整验证流程并再次流转到 `VERIFIED`。工具会重算指纹，无需先回退到 `BUILT`。必须重新运行所有要求命令并更新证据，不得只刷新指纹而跳过审查。

## 完成条件

- 每条验收条件都有证据和结果。
- 所有要求命令都已实际执行并记录。
- CodeGraph 同步后已检查最终影响和受影响测试。
- 需求符合度和工程质量分别记录。
- 不存在未解决的高严重度问题。
- strict 变更包含两个隔离的独立审查结果。
- `verification.md` 包含准确最终结论，并通过对应状态校验。

## 禁止行为

- 只运行本次新增测试，而不检查受影响的现有测试。
- 验证阶段修改代码，却继续复用修改前证据。
- 依赖实现者总结，而不检查实际 diff。
- 后续通过后删除之前的失败证据。
- 把测试通过当成需求覆盖或代码质量的全部证明。
- 复用最终实现修改之前运行的命令。
