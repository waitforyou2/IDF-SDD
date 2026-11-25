# xingyun-sdd 使用指南

> 让每一次代码变更，都有设计、有证据、有传承。

xingyun-sdd 是一个 AI 驱动的软件开发工作流插件。从需求定义到 MR 交付，全程有规范、有归档、有门禁。**任何需求——不管是加个字段还是重构架构——都走同一套流程，简单变更自动轻量，高风险变更自动加严。**

Java 21 Spring MVC 服务可单独复制 [isdd-api-test](skills/isdd-api-test/SKILL.md) 整个目录，无需初始化 SDD。用 audit 盘点、plan 设计、write/backfill 编写、verify 验收、report 查看结果。SDD 的 plan、build、verify 和 MR 小修复复用同一套证据。[接入 Maven / Gradle](skills/isdd-api-test/references/setup.md)

## 快速开始

### 1. 安装插件

将 xingyun-sdd 打包为 ZIP，通过 CodeAgent Extension 管理界面上传安装。

### 2. 初始化仓库（每个仓库一次）

```
/isdd-init
```

自动完成：CodeGraph 索引、CodeCheck/CodeHub CLI 安装、W3 认证、仓库架构分析、评审人配置。扫描未完成 MR 并提醒。

### 3. 开发需求（每次需求）

```
/isdd-define 添加用户头像字段
/isdd-plan add-avatar-field
/isdd-build add-avatar-field
/isdd-verify add-avatar-field
/isdd-ship add-avatar-field --create-mr
```

五条命令，从需求到 MR，全程 AI 执行，关键动作人工授权。

## 流程总览

```
/isdd-init（仓库初始化，每个仓库一次）
    │
    ▼
/isdd-define  需求定义     → spec.md
    │
    ▼
/isdd-plan    技术规划     → plan.md
    │
    ▼
/isdd-build   编码实现     → 代码 + 测试
    │
    ▼
/isdd-verify  验证审查     → verification.md
    │
    ▼
/isdd-ship    交付 MR     → delivery.md + CodeHub MR
    │
    ▼
  MR 合入，变更完成
```

任何时候运行 `/isdd-status` 查看当前状态和下一条命令。

## 学习模式与 `/isdd-learn`（消除黑盒与能力退化）

`/isdd-define` 确认需求后，会轻量提示是否开启**学习模式**（默认关闭，零打扰）。开启后可任选或同时启用两种能力：

- **检视导览（`review`）**：`/isdd-verify` 通过后由独立只读 Subagent `sdd-learn-guide` 分析 Diff（不污染主会话上下文），通过 `scripts/learn.mjs` 精确回填仓库真实源码并渲染离线单文件「精装代码研读本」HTML（含执行流路线图、默认纯源码 + 行内朱批折页、步进聚光模式、隐藏陷阱盲盒、苏格拉底思考题与一分钟排障急救卡），并持续更新跨仓库个人认知账本 `~/.xingyun-sdd/learning-profile.yaml`。
- **留白共建（`co-build`）**：`/isdd-plan` 挑出 1–2 个高含金量核心槽位（10–30 行），`/isdd-build` 先由 AI 搭好 90% 样板与红灯单测并留下 `TODO(human)`，开发者亲手写出核心逻辑并由独立导师 Subagent `sdd-cobuild-coach` 做对比点评；亲手编写的代码段会在研读本中获得 **`✦ 亲手共建`** 专属烫金标线。`sdd.mjs` 自动拦截未清理的 `TODO(human)` 防止误提交。

无论是否开启学习模式，随时都可以独立运行 `/isdd-learn` 学习自己的变更或同事的代码：

```bash
/isdd-learn <change-id>            # 研读 SDD 变更
/isdd-learn --commit <sha>         # 学习同事或历史任意 Commit
/isdd-learn --mr <iid>             # 学习 CodeHub 任意 MR（附带评审区点评）
/isdd-learn --path <目录或文件>     # 存量黑盒模块考古
```

## 各阶段说明

### init — 初始化仓库

每个仓库执行一次。自动安装工具链、建立 CodeGraph 索引、分析仓库架构。重复执行时刷新索引和仓库文档，不覆盖团队配置（评审人工号等）。

### define — 需求定义

输入需求描述，AI 澄清范围、识别风险、选择模式（lite/standard/strict），生成 `spec.md`。可填 E2E 单号，ship 阶段创建 MR 时必填。

**需求变了？** 重新执行 `/isdd-define <id>` 即可，自动回退状态，保留原文参考。

### plan — 技术规划

AI 用 CodeGraph 分析调用链，拆成垂直切片任务，每个任务包含精确文件路径、符号、测试 seam 和验证命令。生成 `plan.md`。

### build — 编码实现

按 plan 中的任务顺序实现，测试优先（RED-GREEN-REFACTOR）。不自动提交，commit/push 需用户授权。

### verify — 验证审查

同时检查"做对了需求"和"做好了质量"。CodeCheck 扫描-修复循环（fix 自动修 + AI 手动修）。strict 模式下两个隔离 Agent 并行审查。

**验证后改了代码？** 重新执行 `/isdd-verify` 刷新指纹，无需回退状态。

### ship — 交付 MR

填写 `delivery.md` → 用户授权 commit/push → 自动创建 CodeHub MR（fork/非 fork 自动判断）→ 后台监控 MR 状态、门禁和评审意见。

**评审意见处理：** 发现检视意见时停止监控，AI 逐条分析（5 种分类：需要修改/已修复/不合理/风格偏好/无需修改）。修复后执行编译、UT 和 CodeCheck；Java MVC 服务重新验证接口场景及覆盖证据，全部通过后再 push 回 MR。

## 流程模式

| 模式 | 适用场景 | 特点 |
|---|---|---|
| lite | 文案修改、小配置、简单字段 | 精简归档，可自动执行到验证 |
| standard | 普通功能、缺陷、重构 | 需求确认 + 双轴审查 |
| strict | 认证、支付、迁移、架构 | 两个隔离 Agent 并行审查 |

三种模式走完全相同的阶段，只调整深度和门禁强度。AI 根据需求描述自动分类，用户可覆盖。

## 归档结构

**随代码提交的（团队共享）：**

```
docs/isdd/changes/<change-id>/
├── spec.md            需求定义
├── plan.md            技术计划
├── verification.md    验证报告
└── delivery.md        交付记录
```

**本地辅助文档（不提交，每次 init 重新生成）：**

```
docs/isdd/
├── repository.yaml    仓库配置（工程命令、CodeGraph、评审人）
├── repository.md      仓库架构（领域语言、ADR、测试 seam）
└── policy.md          团队策略
```

## 状态流转

```
DRAFT → DEFINED → PLANNED → BUILT → VERIFIED → DONE
```

返工不需要记命令，重新执行对应阶段的命令即可：

| 场景 | 操作 |
|---|---|
| 需求要改 | `/isdd-define <id>` |
| 验证失败 | `/isdd-verify <id>` 修复后重新验证 |
| 评审小问题 | ship 监控自动处理，`DONE → VERIFIED` |
| 评审要改方案 | ship 监控自动处理，`DONE → DEFINED` |
| 变更不要了 | `/isdd-abandon <id>` |

## 环境要求

- CodeAgent CLI 或兼容工具
- Node.js 18+（CodeGraph CLI 需要 20-24）
- CodeGraph、CodeCheck、CodeHub CLI 无需预装，init 自动安装
- W3 认证（CodeHub CLI 登录需要，在独立终端执行）

## 常见问题

### CodeHub CLI 认证 401

清除 token 环境变量后重新登录：

```bash
unset CODEHUB_TOKEN
codehub-cli auth status                          # 检查状态
codehub-cli auth login --w3 --username <工号> --all  # 在独立终端执行
```

### 指纹不匹配

验证后改了代码但没重新验证。执行 `/isdd-verify <id>` 刷新指纹即可，无需回退状态。

### MR 创建失败说分支不存在

MR 是远端两个分支的对比，源分支必须已 push。先 `--push` 再 `--create-mr`。

### 监控停止了

关闭 CodeAgent 会话后监控自动停止。重新执行 `/isdd-ship <id> --create-mr` 恢复，会自动复用已有 MR。

### base_ref 失效

主分支被 rebase 后，创建变更时记录的 commit 已失效。执行 `/isdd-verify <id>` 刷新。

## 验证插件包

```bash
npm test
npm run validate
```

Java 接口能力可用 `python tests/api-metrics-test.py` 快速验证统计逻辑。设置 JDK 21、Maven（可从本地缓存解析测试依赖）和 Python 后，运行 `npm run test:java-api`。它在临时业务仓实测独立 Skill、漏测、业务回归、行覆盖和 SDD/MR 状态门禁。Maven 和 Gradle 可运行的构建配置见 [订单服务样例](tests/fixtures/java-api/)。

## 社区能力来源

xingyun-sdd 不重复发明已经被社区验证的研发方法，而是有选择地吸收三个 MIT 许可项目的优秀实践。

主要上游来源（这些项目是方法与实现来源，不是运行时依赖）：

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
- [obra/superpowers](https://github.com/obra/superpowers)
- [mattpocock/skills](https://github.com/mattpocock/skills)

xingyun-sdd 有意保留以下差异：包括 lite 在内的每项变更都保留精简的需求和计划；计划包含精确路径和测试 seam 但不预写完整实现代码；commit/push/merge 始终是独立授权动作；CodeGraph 影响分析和内容指纹属于集成设计。

版权和许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
