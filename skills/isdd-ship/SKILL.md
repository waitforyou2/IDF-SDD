---
name: isdd-ship
description: 完成 VERIFIED 状态的 IDF-SDD 分支，准备并在获得独立授权后发布人工评审包，自动创建 CodeHub MR，持续监控 MR 状态、门禁和评审意见并支持自动修复，归档证据、风险、按需发布与监控、回滚和最终验收记录。用户执行 /isdd-ship、要求准备或创建 PR、需要查看分支收尾选项，或要把已合并变更标记完成时使用。
---

# 准备交付

## 目标

把已经验证的工作整理成可追溯、可回滚的评审包，自动创建 CodeHub MR，持续监控 MR 状态直到合入。准备交付不代表已经获得 commit、push、创建 PR、merge、丢弃工作或 deploy 的授权。

调用参数：`$ARGUMENTS`

## 执行流程

1. 解析 change id。阅读 `spec.md`、`plan.md`、`verification.md`、`docs/isdd/policy.md`、[工作流契约](../../references/workflow.md)、[归档契约](../../references/artifacts.md)和[CodeHub CLI 命令参考](../../references/codehub-cli-reference.md)。
2. 提供 `--complete` 时，要求当前状态为 `IN_REVIEW`，确认交付已经合并或验收，取得不可变的合并或验收引用，然后执行：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to DONE --merged --accepted-ref "<引用>" --root "${CLAUDE_PROJECT_DIR}"
   ```

   报告归档结果后停止。
3. 其他情况要求当前状态为 `VERIFIED`。检查 Git 状态和范围内完整 diff。状态工具会比较当前变更文件内容指纹与验证阶段指纹；任何实现修改都会阻止交付。此时可直接重新执行 `/isdd-verify` 刷新指纹，无需回退状态。
4. 创建或复用 `delivery.md`：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" artifact delivery --id <id> --root "${CLAUDE_PROJECT_DIR}"
   ```

5. 填写可评审标题、为什么修改、修改内容、可观察结果、验证证据、风险、归档链接和人工关注点。影响生产的变更还必须记录分阶段发布、监控指标和阈值、适用时的功能开关负责人，以及可执行回滚步骤；仅本地变更需要说明为什么这些内容不适用。在外部评审对象创建前保留 `Delivery-Ref: PENDING`。
6. 重新运行成本最低的交付前检查，确认分支仍与 `verification.md` 一致。实现一致性以内容指纹为准，不得创建第二套验证结论。
7. 分别处理授权参数：
   - `--commit` 只授权暂存已确认的范围内路径并创建一次提交。
   - `--push` 只授权推送已确认分支。
   - `--create-mr` 只授权创建最多一个 MR 并进入监控循环。
   - 任何一个参数都不授权 merge 或 deploy。合入 MR 需要 `--complete` 独立授权。
   缺少授权时必须询问，不得推断。混合工作区不得使用宽泛的全量暂存路径。
8. 未授权外部发布时，完成 `delivery.md`，展示可选下一步，保持 `VERIFIED` 状态并停止。不得把删除分支或 worktree 当成默认收尾动作。
9. 授权创建 MR 后，先检查 CodeHub 认证，再自动判断 fork 模式，最后创建 MR：

   ### 9a. 认证检查

   - 清除可能存在的 `CODEHUB_TOKEN` 环境变量（它会覆盖 W3 认证导致 401）：`unset CODEHUB_TOKEN`
   - 运行 `codehub-cli auth status` 检查认证状态。
   - 未认证时，询问用户工号，然后运行 `codehub-cli auth login --w3 --username <工号> --all`。该命令在非交互模式下需要用户在独立终端输入密码，提示用户完成后回来确认，再重新检查认证状态。不在当前会话中传密码。
   - 认证失败或 token 过期时，参考[CodeHub CLI 错误码参考](../../references/codehub-cli-error-codes.md)排查。

   ### 9b. fork 模式自动判断

   - 运行 `git remote -v` 获取所有 remote URL。
   - 解析 remote URL 中是否包含当前用户工号（`git config user.name` 或 `whoami`）。
   - **fork 模式**（remote URL 含用户工号）：需要先 push 到 fork 仓库，再用 `codehub-cli mr create --target-project-id <父仓库ID>` 创建 MR 到主仓库。`--target-project-id` 通过 `codehub-cli project view -p "<主仓库路径>"` 获取。
   - **非 fork 模式**（remote URL 不含用户工号）：直接用 `codehub-cli mr create`，push 和 MR 创建一步完成。
   - 无法判断时，询问用户当前是 fork 还是直接仓库。

   ### 9c. 创建 MR

   - **源分支**：当前分支 `git branch --show-current`；用户明确指定时从其值。
   - **目标分支**：默认 `master`；用户明确指定时从其值。
   - **仓库**：从当前 Git remote 解析 `org/repo` 传入 `-p`。
   - **标题**：取 `delivery.md` 的交付标题。
   - **描述**：从 `delivery.md` 提炼「变更摘要」「评审关注点」「风险与回滚」「归档链接」四块，写入临时文件后用 `--no-auto-template -F <file>` 传入；不要把整个 delivery.md 原样塞入，也不要保留模板占位注释。
   - **指派人/评审人**：默认 `--recommend-assignee`；用户明确指定时改用 `--assignees`/`--reviewers`。
   - **Squash**：默认不开 `--squash`；用户明确要求时再加 `--squash --squash-commit-message "<交付标题>"`。

   非 fork 模式基础命令：

   ```bash
   codehub-cli mr create -p "<org/repo>" \
     --source-branch "<当前分支>" \
     --target-branch "<目标分支>" \
     --title "<交付标题>" \
     --no-auto-template -F "<临时描述文件>" \
     --recommend-assignee
   ```

   fork 模式基础命令（先 push 再建 MR）：

   ```bash
   git push origin "<当前分支>"
   codehub-cli mr create -p "<fork仓库>" \
     --source-branch "<当前分支>" \
     --target-branch "<目标分支>" \
     --target-project-id "<主仓库项目ID>" \
     --title "<交付标题>" \
     --no-auto-template -F "<临时描述文件>" \
     --recommend-assignee
   ```

   创建成功后，从输出中提取 MR URL 和 MR IID。用 MR URL 替换 `Delivery-Ref: PENDING`，然后流转：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to IN_REVIEW --delivery-ref "<MR URL>" --root "${CLAUDE_PROJECT_DIR}"
   ```

10. 创建 MR 后进入监控循环，持续跟踪直到 MR 合入或用户选择停止：

    ### 10a. 检查 MR 状态

    ```bash
    codehub-cli mr view -p "<org/repo>" <mr-iid>
    ```

    - 状态为 `merged` → MR 已合入，执行第 11 步流转到 DONE。
    - 状态为 `closed` → MR 被关闭，提示用户处理。
    - 状态为 `opened` → 继续检查门禁和评审意见。

    ### 10b. 检查门禁状态

    ```bash
    codehub-cli mr gate -p "<org/repo>" <mr-iid>
    ```

    - 门禁通过 → 告知用户门禁已通过，继续检查评审意见。
    - 门禁失败 → 展示失败详情，提示用户是否要自动修复。用户同意后：
      - 运行 `codehub-cli mr pipeline -p "<org/repo>" <mr-iid>` 查看流水线详情。
      - 运行 `codehub-cli pipeline failure <pipeline-id>` 诊断 CodeCheck 问题。
      - 根据诊断结果修复代码。
      - 重新运行交付前检查确认修复有效。
      - `git add` + `git commit` + push 回已有 MR（非 fork：`git push`；fork：`git push origin <分支>`）。
      - 回到 10a 继续监控。

    ### 10c. 检查评审意见

    ```bash
    codehub-cli mr review list -p "<org/repo>" <mr-iid>
    ```

    - 无未处理的评审意见 → 告知用户当前无新意见，询问是否继续等待。
    - 有未处理的评审意见 → 展示每条意见的文件、行号、内容和严重级别，提示用户是否要自动修复。用户同意后：
      - 逐条分析评审意见，判断是否需要修改代码。
      - 用 Edit/Write 修复本地代码。
      - 用 `codehub-cli mr review reply -p "<org/repo>" <mr-iid> <review-id> --body "<回复内容>"` 回复每条意见。
      - 修复完成后重新运行交付前检查确认修复有效。
      - `git add` + `git commit` + push 回已有 MR。
      - 回到 10a 继续监控。
    - 用户选择不修复时，保留评审意见不处理，告知用户需在 CodeHub 上手动处理。

    每轮监控循环结束后，告知用户当前 MR 状态摘要（状态、门禁、未处理评审意见数），询问是否继续下一轮监控。用户选择停止时保持 `IN_REVIEW` 状态并停止。

11. MR 已合入后，流转到 DONE：

    ```bash
    node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to DONE --merged --accepted-ref "<MR URL>" --root "${CLAUDE_PROJECT_DIR}"
    ```

    报告归档结果后停止。

## 完成条件

- 交付内容与当前已验证 diff 一致。
- 已链接需求、计划、验证、发布和回滚证据。
- 生产变更可回滚、可观察，并定义推进或回滚信号。
- 范围内文件全部可解释，且未包含用户无关变更。
- 所有外部动作都有动作级明确授权。
- `IN_REVIEW` 有真实 MR URL，`DONE` 有已合入 MR 引用。
- MR 创建前已通过 CodeHub 认证检查。
- fork/非 fork 模式已自动判断并正确处理。
- MR 监控循环中每轮都向用户报告状态摘要。

## 禁止行为

- 假设 `/isdd-ship` 自动授权 push、创建 MR、merge 或 deploy。
- 实现文件修改后复用旧验证。
- 只有本地 PR 文本时就标记 `IN_REVIEW`。
- 在交付摘要中隐藏已知风险或失败检查。
- 把 deploy 当作 ship 授权的一部分，或在没有回滚路径时发布生产变更。
- 在当前会话中直接传密码或 token。
- 未经用户授权自动合入 MR。
- 未经用户授权自动修复评审意见或门禁问题。
- 评审意见未回复就 push 修复代码。
