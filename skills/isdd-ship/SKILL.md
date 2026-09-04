---
name: isdd-ship
description: 完成 VERIFIED 状态的 xingyun-sdd 分支，准备并在获得独立授权后创建 CodeHub MR，将文档状态同步推送到 MR 分支，持续监控 MR 门禁和评审意见并支持返工修复，归档证据、风险、按需发布与回滚记录。用户执行 /isdd-ship、要求准备或创建 PR、或要把变更交付评审时使用。
---

# 准备交付

## 目标

把已经验证的工作整理成可追溯、可回滚的评审包，创建 CodeHub MR，并将文档状态变更同步推送到 MR 分支。准备交付不代表已经获得 commit、push、创建 PR、merge、丢弃工作或 deploy 的授权。

调用参数：`$ARGUMENTS`

## 执行流程

1. 解析 change id。阅读 `spec.md`、`plan.md`、`verification.md`、`docs/isdd/policy.md`、[工作流契约](../../references/workflow.md)、[归档契约](../../references/artifacts.md)和[CodeHub CLI 命令参考](../../references/codehub-cli-reference.md)。
2. 要求当前状态为 `VERIFIED`。检查 Git 状态和范围内完整 diff。状态工具会比较当前变更文件内容指纹与验证阶段指纹；任何实现修改都会阻止交付。此时可直接重新执行 `/isdd-verify` 刷新指纹，无需回退状态。
3. 创建或复用 `delivery.md`：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" artifact delivery --id <id> --root "${CLAUDE_PROJECT_DIR}"
   ```

4. 填写 `delivery.md`，按模板格式依次完成：需求单号（从 `spec.md` 的 `e2e_issue` 字段获取）、MR 类型（feat/fix/refactor/docs/chore/test/perf/style/ci）、简要描述、修改原因、修改模块、影响范围、修改内容（按文件列出变更）、验证结论、风险与回滚、归档链接。影响生产的变更还必须记录分阶段发布、监控指标和阈值、适用时的功能开关负责人，以及可执行回滚步骤；仅本地变更需要说明为什么这些内容不适用。在外部评审对象创建前保留 `Delivery-Ref: PENDING`。
5. 重新运行成本最低的交付前检查，确认分支仍与 `verification.md` 一致。实现一致性以内容指纹为准，不得创建第二套验证结论。
6. 分别处理授权参数：
   - `--commit` 只授权暂存已确认的范围内路径并创建一次提交。
   - `--push` 只授权推送已确认分支。
   - `--create-mr` 只授权创建最多一个 MR 并执行文档状态同步推送。
   - 任何一个参数都不授权 merge 或 deploy。
   缺少授权时必须询问，不得推断。混合工作区不得使用宽泛的全量暂存路径。
7. 未授权外部发布时，完成 `delivery.md`，展示可选下一步，保持 `VERIFIED` 状态并停止。不得把删除分支或 worktree 当成默认收尾动作。
8. 授权创建 MR 后，按以下步骤执行：

   ### 8a. 认证检查

   - 清除可能存在的 `CODEHUB_TOKEN` 环境变量（它会覆盖 W3 认证导致 401）：`unset CODEHUB_TOKEN`
   - 运行 `codehub-cli auth status` 检查认证状态。
   - 未认证时，从 `whoami` 或 `git config user.name` 获取用户工号，运行 `codehub-cli auth login --w3 --username <工号> --all`。该命令在非交互模式下需要用户在独立终端输入密码，提示用户完成后回来确认，再重新检查认证状态。不在当前会话中传密码。
   - 认证失败或 token 过期时，参考[CodeHub CLI 错误码参考](../../references/codehub-cli-error-codes.md)排查。

   ### 8b. 重复 MR 检测

   创建 MR 前先检查是否已有可复用的 MR：

   1. 从 `spec.md` 的 `delivery_ref` 字段取 MR URL。
   2. 为空或为空字符串 → 第一次创建，继续 8c。
   3. 有值 → 从 URL 解析 MR IID，运行 `codehub-cli mr view -p "<org/repo>" <mr-iid> --format json` 检查：
      - **状态为 `opened` 且 `source_branch` == 当前分支** → 复用已有 MR，不重复创建。直接 push 代码到已有分支（MR 自动更新），然后用 `codehub-cli mr update -p "<org/repo>" <mr-iid> --title "<新标题>" -F delivery.md` 更新 MR 描述。跳到 8e。
      - **状态为 `opened` 但分支不一致** → 旧 MR 已失效，新建 MR。继续 8c。
      - **状态为 `merged` 或 `closed`** → 已结束，新建 MR。继续 8c。
      - **URL 无效或查询失败** → 询问用户是否已有 MR，用户提供 MR URL 或确认新建。

   ### 8c. fork 模式判断与提交推送

   - 运行 `git remote -v` 获取所有 remote URL。
   - 解析 remote URL 中是否包含当前用户工号（`git config user.name` 或 `whoami`）。
   - **fork 模式**（remote URL 含用户工号）：需要先 push 到 fork 仓库，再用 `codehub-cli mr create --target-project-id <父仓库ID>` 创建 MR 到主仓库。`--target-project-id` 通过 `codehub-cli project view -p "<主仓库路径>"` 获取。
   - **非 fork 模式**（remote URL 不含用户工号）：直接用 `codehub-cli mr create`，push 和 MR 创建一步完成。
   - 无法判断时，询问用户当前是 fork 还是直接仓库。
   - 暂存已确认的范围内路径并创建提交（`--commit` 授权范围）。
   - 推送分支到远程（`--push` 授权范围）。

   ### 8d. 创建 MR

   - **源分支**：当前分支 `git branch --show-current`；用户明确指定时从其值。
   - **目标分支**：默认 `master`；用户明确指定时从其值。
   - **仓库**：从当前 Git remote 解析 `org/repo` 传入 `-p`。
   - **标题**：固定格式 `【xingyun-sdd】【<修改类型>】<简要描述>`。修改类型遵循 Conventional Commits 规范：`feat`（新功能）、`fix`（缺陷修复）、`refactor`（重构）、`docs`（文档）、`chore`（构建/工具）、`test`（测试）、`perf`（性能）、`style`（格式）、`ci`（CI 配置）。从 delivery.md 的【MR类型】字段取修改类型，从【简要描述】取描述内容。
   - **描述**：直接用 `delivery.md` 作为 MR 描述文件，通过 `--no-auto-template -F delivery.md` 传入。不创建临时描述文件，不修改 delivery.md 内容。
   - **指派人/评审人**：读取 `docs/isdd/repository.yaml` 中的评审人配置。优先读取 `reviewers` 列表字段（多个人号列表），将所有人号用逗号拼接传入 `--reviewers`；如果 `reviewers` 不存在，则读取 `reviewer` 单字段。两个字段都没有时，**必须询问用户是否要填写评审人**，告知用户可以跳过（跳过则自行在 CodeHub 网站上填写），用户提供后写入 `repository.yaml`。同时使用 `--recommend-assignee` 让 CodeHub 自动填充指派人。
   - **E2E 单号**：从 `spec.md` 的 frontmatter `e2e_issue` 字段获取，传入 `--e2e-issues`。**字段为空时必须询问用户提供，用户必须提供单号才能创建 MR。** 用户提供后更新 `spec.md` 的 `e2e_issue` 字段和 `delivery.md` 的需求单号章节，再创建 MR。
   - **Squash**：默认不开 `--squash`；用户明确要求时再加 `--squash --squash-commit-message "【xingyun-sdd】【<修改类型>】<简要描述>"`。

   非 fork 模式基础命令：

   ```bash
   codehub-cli mr create -p "<org/repo>" \
     --source-branch "<当前分支>" \
     --target-branch "<目标分支>" \
     --title "【xingyun-sdd】【<修改类型>】<简要描述>" \
     --no-auto-template -F delivery.md \
     --recommend-assignee \
     --reviewers "<评审人工号>" \
     --e2e-issues "<E2E单号>"
   ```

   fork 模式基础命令（先 push 再建 MR）：

   ```bash
   git push origin "<当前分支>"
   codehub-cli mr create -p "<fork仓库>" \
     --source-branch "<当前分支>" \
     --target-branch "<目标分支>" \
     --target-project-id "<主仓库项目ID>" \
     --title "【xingyun-sdd】【<修改类型>】<简要描述>" \
     --no-auto-template -F delivery.md \
     --recommend-assignee \
     --reviewers "<评审人工号>" \
     --e2e-issues "<E2E单号>"
   ```

   创建成功后，从输出中提取 MR URL 和 MR IID。

   ### 8e. 流转状态、更新 MR 描述并推送文档状态

   创建 MR 得到 MR URL 后（或复用已有 MR 时），立即流转到 DONE：

   ```bash
   node "${CODEAGENT3_PLUGIN_ROOT}/scripts/sdd.mjs" transition --id <id> --to DONE --delivery-ref "<MR URL>" --root "${CLAUDE_PROJECT_DIR}"
   ```

   transition 会更新 delivery.md 中的 `Delivery-Ref: PENDING` 为真实 MR URL。更新后用 `mr update` 把包含真实 MR URL 的 delivery.md 重新推为 MR 描述，同时添加 `AI` 标签标识此 MR 由插件创建：

   ```bash
   codehub-cli mr update -p "<org/repo>" <mr-iid> -F delivery.md --labels "AI"
   ```

   transition 完成后，文档状态已更新（spec.md 和 delivery.md），创建提交并推送：

   ```bash
   git add docs/isdd/changes/<id>/spec.md docs/isdd/changes/<id>/delivery.md
   git commit -m "chore(isdd): 更新变更状态为 DONE，记录 MR 交付引用"
   git push origin "<当前分支>"
   ```

   推送后告知用户：MR 已就绪，文档状态已同步推送。MR 进入人工评审阶段。

9. 推送文档后自动进入后台监控循环，每 5 分钟检查一次，最多监控 30 分钟（6 轮）。使用 ScheduleWakeup 工具安排定时唤醒，用户无需反复手动触发。文档状态已是 DONE，监控的目的是发现检视意见和门禁问题，触发返工或通知用户。

    ### 9a. 监控启动

    推送文档后立即执行第一轮检查（9b），然后使用 ScheduleWakeup 安排 5 分钟后的下一轮。告知用户："已启动 MR 后台监控，每 5 分钟检查一次，最长监控 30 分钟。有门禁报错或检视意见时会通知你。"

    ### 9b. 每轮检查（唤醒时执行）

    每轮唤醒后依次执行以下检查：

    **第一步：检查 MR 状态**

    ```bash
    codehub-cli mr view -p "<org/repo>" <mr-iid>
    ```

    - 状态为 `merged` → MR 已合入，通知用户变更已交付，结束监控。
    - 状态为 `closed` → MR 被关闭，通知用户处理，结束监控。
    - 状态为 `opened` → 继续第二步。

    **第二步：检查评审意见（每轮必查，最高优先级）**

    ```bash
    codehub-cli mr review list -p "<org/repo>" <mr-iid> --format json
    ```

    用 `--format json` 获取结构化数据。返回一个数组，每个元素是一条评审讨论。从数组中筛选 `resolved` 为 `false` 的条目。每条意见的字段结构：
    - `id`：评审讨论 ID（顶层字段，用于回复 `mr review reply`）
    - `resolved`：是否已处理（顶层字段，`false` 表示未处理）
    - `notes`：回复和意见内容数组，取 `notes[0]` 获取首条意见：
      - `notes[0].body`：意见正文
      - `notes[0].file_path`：文件路径（可能为 `null`，表示是 MR 级别意见而非行级意见）
      - `notes[0].line`：行号（可能为 `null`）
      - `notes[0].author.username`：意见作者
    - 严重级别通常嵌在 `notes[0].body` 文本中，需从正文解析

    - 无未处理的评审意见（`resolved=false` 为空）→ 安排下一轮 ScheduleWakeup（如未达 30 分钟上限）。
    - 有未处理的评审意见 → **停止后台监控**，展示每条意见的文件、行号、严重级别和内容，逐条分析并按以下 5 种分类处理：
      1. **需要修改**：意见合理，需要改代码 → 用 Edit/Write 修复本地代码，回复"感谢指正，已按建议修改。"
      2. **已修复**：意见合理但已在后续提交中修复 → 不改代码，回复"感谢指正，该问题已在后续提交中修复。"
      3. **不合理**：意见不合理，当前实现是正确的 → 不改代码，回复"感谢建议。经分析，当前实现是合理的：<具体原因>"
      4. **风格偏好**：属于风格争议，没有对错 → 不改代码，回复"感谢建议。此处为风格偏好，保持当前写法。"
      5. **无需修改**：意见合理但不需要改（如已用其他方式覆盖）→ 不改代码，回复"感谢建议。<解释为什么不需要改>"

      回复每条意见使用 `codehub-cli mr review reply -p "<org/repo>" <mr-iid> <review-id> --body "<回复内容>"`。`<review-id>` 取评审讨论的 `id` 字段（长 hash 字符串）。**所有未处理意见都必须回复，不得遗漏。**

      回复完成后，根据返工规模选择路径：
      - **小问题修复**（修改了代码但不改变设计方案）：
        - 流转到 `VERIFIED`：`transition --id <id> --to VERIFIED`（`delivery_ref` 保留，MR 仍然有效）。
        - **修复后门禁检查**（必须全部通过才能 push）：
          1. 编译：运行项目构建命令确认编译通过。
          2. 单元测试：运行全部 UT 确认无失败（不只是新增测试，包括受影响的现有测试）。
          3. CodeCheck：运行 `codecheck fullcheck -f "<变更文件>"` 确认无告警。有告警则按 verify 阶段的扫描-修复循环处理。
        - 门禁全部通过后，重新执行 ship 流程：ship 会检测到 `delivery_ref` 有值且 MR 为 `opened` → 复用已有 MR（push 代码 + `mr update` 更新描述），不重复创建。
        - 通知用户修复已完成，询问是否继续后台监控 → 继续则重新启动 9a 监控循环。
      - **全流程返工**（评审意见提出不同实现方式，需要重新设计需求）：
        - 流转到 `DEFINED`：`transition --id <id> --to DEFINED`（`delivery_ref` 被清空，旧 MR 失效）。
        - 告知用户需要重新走 define → plan → build → verify → ship 完整流程。
        - 用户完成重新开发后，ship 会检测到 `delivery_ref` 为空 → 新建 MR。
      - **用户拒绝修复** → 保持 `DONE` 状态，告知用户需在 CodeHub 上手动处理，结束监控。

    **第三步：检查门禁状态**

    ```bash
    codehub-cli mr gate -p "<org/repo>" <mr-iid>
    ```

    检查门禁结果中以下关键项：
    - `must_relate_issue`：仓库是否要求 MR 必须关联 issue/DTS 单号。
    - `all_issues_passed`：所有关联的 issue 检查是否通过。
    - `e2e_check_passed`：E2E 检查是否通过。

    - 门禁全部通过 → 告知用户门禁已通过，安排下一轮 ScheduleWakeup（如未达 30 分钟上限）。
    - **e2e 单号关联失败**（`all_issues_passed=false` 或 `e2e_check_passed=false`）→ 单号可能有误。用 `codehub-cli mr view -p "<org/repo>" <mr-iid>` 查看 `related_issues` 字段确认当前关联的单号。告知用户 e2e 单号门禁未通过，要求用户提供正确的单号。用户提供后：
      1. 更新 `spec.md` 的 `e2e_issue` 字段为新单号。
      2. 更新 `delivery.md` 的需求单号章节。
      3. 用 `codehub-cli mr update -p "<org/repo>" <mr-iid> --e2e-issues "<新单号>"` 更新 MR 关联单号。
      4. 重新走 verify（`/isdd-verify`）刷新指纹。
      5. 重新执行 ship 流程：transition DONE → commit + push 文档变更到已有 MR 分支。
      6. 重新检查门禁，继续监控。
    - **其他门禁失败**（流水线/CodeCheck 等）→ 通知用户门禁失败，提供流水线链接（从 `codehub-cli mr pipeline -p "<org/repo>" <mr-iid>` 获取 URL），让用户自行查看日志。不尝试自动修复门禁问题。询问用户是否继续监控：
      - 继续 → ScheduleWakeup 安排下一轮。
      - 停止 → 保持 `DONE` 状态，结束监控。

    ### 9c. 监控结束条件

    以下任一条件满足时停止监控：
    - MR 状态为 `merged` → 通知用户变更已交付。
    - MR 状态为 `closed` → 通知用户。
    - 门禁失败且用户选择停止。
    - 发现未处理评审意见（暂停监控等待用户处理）。
    - 达到 30 分钟最大监控时长 → 通知用户监控已超时，告知当前 MR 状态摘要（状态、门禁、未处理评审意见数），询问用户是否重新启动一轮监控。

## 完成条件

- 交付内容与当前已验证 diff 一致。
- 已链接需求、计划、验证、发布和回滚证据。
- 生产变更可回滚、可观察，并定义推进或回滚信号。
- 范围内文件全部可解释，且未包含用户无关变更。
- 所有外部动作都有动作级明确授权。
- `DONE` 状态有真实 MR URL 作为 delivery_ref。
- MR 创建前已通过 CodeHub 认证检查。
- fork/非 fork 模式已自动判断并正确处理。
- 文档状态变更（spec.md + delivery.md）已推送到 MR 分支，不存在仅本地可见的幽灵状态。
- 创建 MR 前已检查 `delivery_ref`，不重复创建已有 MR。
- 检视意见监控循环使用 ScheduleWakeup 后台定时检查，无需用户反复手动触发。
- 门禁失败时只提供流水线链接给用户查看，不自动修复门禁问题。
- 发现检视意见时根据返工规模选择 `DONE → VERIFIED`（小问题）或 `DONE → DEFINED`（全流程返工）。

## 禁止行为

- 假设 `/isdd-ship` 自动授权 push、创建 MR、merge 或 deploy。
- 实现文件修改后复用旧验证。
- 创建 MR 后不推送文档状态变更就结束流程。
- 在交付摘要中隐藏已知风险或失败检查。
- 把 deploy 当作 ship 授权的一部分，或在没有回滚路径时发布生产变更。
- 在当前会话中直接传密码或 token。
- 未经用户授权自动合入 MR。
- 未经用户授权自动修复评审意见或门禁问题。
- 评审意见未回复就 push 修复代码。
