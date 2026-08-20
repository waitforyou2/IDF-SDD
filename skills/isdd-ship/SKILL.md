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

5. 填写 `delivery.md`，按模板格式依次完成：MR 类型（feature/bugfix/refactor/docs/chore）、简要描述、修改原因、修改模块、影响范围、修改内容（按文件列出变更）、验证结论、风险与回滚、归档链接。影响生产的变更还必须记录分阶段发布、监控指标和阈值、适用时的功能开关负责人，以及可执行回滚步骤；仅本地变更需要说明为什么这些内容不适用。在外部评审对象创建前保留 `Delivery-Ref: PENDING`。
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
   - **标题**：固定格式 `【IDF-SDD】【<修改类型>】<简要描述>`。修改类型遵循 Conventional Commits 规范：`feat`（新功能）、`fix`（缺陷修复）、`refactor`（重构）、`docs`（文档）、`chore`（构建/工具）、`test`（测试）、`perf`（性能）、`style`（格式）、`ci`（CI 配置）。从 delivery.md 的【MR类型】字段取修改类型，从【简要描述】取描述内容。
   - **描述**：直接用 `delivery.md` 作为 MR 描述文件，通过 `--no-auto-template -F delivery.md` 传入。不创建临时描述文件，不修改 delivery.md 内容。
   - **指派人/评审人**：默认 `--recommend-assignee`；用户明确指定时改用 `--assignees`/`--reviewers`。
   - **Squash**：默认不开 `--squash`；用户明确要求时再加 `--squash --squash-commit-message "【IDF-SDD】【<修改类型>】<简要描述>"`。

   非 fork 模式基础命令：

   ```bash
   codehub-cli mr create -p "<org/repo>" \
     --source-branch "<当前分支>" \
     --target-branch "<目标分支>" \
     --title "【IDF-SDD】【<修改类型>】<简要描述>" \
     --no-auto-template -F delivery.md \
     --recommend-assignee
   ```

   fork 模式基础命令（先 push 再建 MR）：

   ```bash
   git push origin "<当前分支>"
   codehub-cli mr create -p "<fork仓库>" \
     --source-branch "<当前分支>" \
     --target-branch "<目标分支>" \
     --target-project-id "<主仓库项目ID>" \
     --title "【IDF-SDD】【<修改类型>】<简要描述>" \
     --no-auto-template -F delivery.md \
     --recommend-assignee
   ```

   创建成功后，从输出中提取 MR URL 和 MR IID。用 MR URL 替换 `Delivery-Ref: PENDING`，然后流转：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to IN_REVIEW --delivery-ref "<MR URL>" --root "${CLAUDE_PROJECT_DIR}"
   ```

10. 创建 MR 后自动进入后台监控循环，每 5 分钟检查一次，最多监控 30 分钟（6 轮）。使用 ScheduleWakeup 工具安排定时唤醒，用户无需反复手动触发。

    ### 10a. 监控启动

    创建 MR 并流转到 `IN_REVIEW` 后，立即执行第一轮检查（10b），然后使用 ScheduleWakeup 安排 5 分钟后的下一轮。告知用户："已启动 MR 后台监控，每 5 分钟检查一次，最长监控 30 分钟。有门禁报错或检视意见时会通知你。"

    ### 10b. 每轮检查（唤醒时执行）

    每轮唤醒后依次执行以下检查：

    **第一步：检查 MR 状态**

    ```bash
    codehub-cli mr view -p "<org/repo>" <mr-iid>
    ```

    - 状态为 `merged` → MR 已合入，通知用户，执行第 11 步流转到 DONE，结束监控。
    - 状态为 `closed` → MR 被关闭，通知用户处理，结束监控。
    - 状态为 `opened` → 继续第二步。

    **第二步：检查门禁状态**

    ```bash
    codehub-cli mr gate -p "<org/repo>" <mr-iid>
    ```

    - 门禁通过 → 继续第三步。
    - 门禁失败 → 通知用户门禁失败，提供流水线链接（从 `codehub-cli mr pipeline -p "<org/repo>" <mr-iid>` 获取 URL），让用户自行查看日志。不尝试自动修复门禁问题。询问用户是否继续监控：
      - 继续 → ScheduleWakeup 安排下一轮。
      - 停止 → 保持 `IN_REVIEW` 状态，结束监控。

    **第三步：检查评审意见**

    ```bash
    codehub-cli mr review list -p "<org/repo>" <mr-iid>
    ```

    - 无未处理的评审意见 → 安排下一轮 ScheduleWakeup（如未达 30 分钟上限）。
    - 有未处理的评审意见 → **停止后台监控**，展示每条意见的文件、行号、内容和严重级别，询问用户是否要自动修复：
      - **用户同意修复**：
        - 逐条分析评审意见，判断是否需要修改代码。
        - 用 Edit/Write 修复本地代码。
        - 用 `codehub-cli mr review reply -p "<org/repo>" <mr-iid> <review-id> --body "<回复内容>"` 回复每条意见。
        - 修复完成后重新运行交付前检查确认修复有效。
        - `git add` + `git commit` + push 回已有 MR（非 fork：`git push`；fork：`git push origin <分支>`）。
        - 通知用户修复已完成，询问是否继续后台监控 → 继续则重新启动 10a 监控循环。
      - **用户拒绝修复** → 保持 `IN_REVIEW` 状态，告知用户需在 CodeHub 上手动处理，结束监控。

    ### 10c. 监控结束条件

    以下任一条件满足时停止监控：
    - MR 状态为 `merged` → 执行第 11 步。
    - MR 状态为 `closed` → 通知用户。
    - 门禁失败且用户选择停止。
    - 发现未处理评审意见（暂停监控等待用户处理）。
    - 达到 30 分钟最大监控时长 → 通知用户监控已超时，告知当前 MR 状态摘要（状态、门禁、未处理评审意见数），询问用户是否重新启动一轮监控。

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
- MR 监控循环使用 ScheduleWakeup 后台定时检查，无需用户反复手动触发。
- 门禁失败时只提供流水线链接给用户查看，不自动修复门禁问题。
- 发现检视意见时停止监控并询问用户是否修复，修复后询问是否继续监控。

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
