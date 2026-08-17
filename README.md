# IDF-SDD

IDF-SDD 是智能数据底座开发组统一使用的 AI 软件设计与交付插件。它规范仓库初始化、需求定义、技术规划、编码实现、验证审查和交付归档，同时让简单变更保持轻量，让高风险变更获得更严格的设计、证据和独立审查。

> 让智能数据底座的每一次变更，都有设计、有证据、有传承。

每项变更都会在代码仓库中留下可持续维护的 `docs/isdd/` 记录，说明需求是什么、为什么选择当前设计、最终实现如何偏离原计划，以及通过什么证据确认完成。

## 社区能力来源

IDF-SDD 不重复发明已经被社区验证的研发方法，而是有选择地吸收三个 MIT 许可项目的优秀实践。

| IDF-SDD 阶段 | 吸收的社区实践 |
|---|---|
| `init` | 吸收 Matt Pocock 关于领域语言和持久上下文的实践，并结合 IDF-SDD 自研的 CodeGraph 仓库分析与上下文归档。 |
| `define` | 吸收 Addy Osmani 的规格驱动开发、Superpowers 的分级澄清与规格自检、Matt Pocock 的聚焦追问与领域建模方法。 |
| `plan` | 吸收 Addy Osmani 的依赖式任务拆分、Superpowers 的精确路径与计划自检、Matt Pocock 的垂直切片、依赖边、深模块和测试 seam。 |
| `build` | 吸收 Addy Osmani 的增量实现与 TDD、Superpowers 的 RED-GREEN-REFACTOR 和系统化调试、Matt Pocock 的公共 seam 行为测试。 |
| `verify` | 吸收 Addy Osmani 的质量与风险审查、Superpowers 的最新证据与独立审查、Matt Pocock 的需求符合度和工程质量双轴评审。 |
| `ship` | 吸收 Addy Osmani 的灰度、监控和回滚实践、Superpowers 的分支收尾方法，并结合 IDF-SDD 自研的动作级授权和交付指纹。 |

主要上游来源：

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
- [obra/superpowers](https://github.com/obra/superpowers)
- [mattpocock/skills](https://github.com/mattpocock/skills)

这些项目是 IDF-SDD 的方法与实现来源，不是运行时依赖。团队成员只需安装 IDF-SDD。所有上游方法都被适配到统一的命令、状态机和归档契约中，因此上游升级不会静默改变团队流程。

IDF-SDD 有意保留以下差异：

- 包括 `lite` 在内的每项变更都保留精简的需求和计划，简单模式只降低深度，不取消追溯。
- 计划必须包含精确路径、符号、测试 seam 和证据，但不预写容易过期的完整实现代码。
- `build` 不自动提交；commit、push、创建 PR、merge 和 deploy 始终是独立授权动作。
- CodeGraph 影响分析、内容指纹和随代码提交的 `docs/isdd/` 归档属于 IDF-SDD 的集成设计。

版权和许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 环境要求

- CodeAgent CLI，或支持 Extension、Skill、Hook、MCP 和智能体的公司内部兼容工具。严格模式要求支持并行只读审查智能体。
- 使用 npm 发行的 CodeGraph CLI 时，需要 Node.js 20 至 24；IDF-SDD 自身脚本最低需要 Node.js 18。
- [CodeGraph](https://github.com/colbymchenry/codegraph) 已安装并可通过 `codegraph` 命令调用。

可通过 npm 安装经过验证的 CodeGraph 版本：

```bash
npm install -g @colbymchenry/codegraph@1.5.0
```

当前版本按 CodeGraph 1.5.0 的 MCP 与 CLI 契约开发，并会拒绝不兼容的旧版本。插件已经提供 `codegraph serve --mcp` 配置，无需额外执行 `codegraph install`。CodeGraph 是外部工具，不会被打包进 IDF-SDD。

## 本地安装

将当前目录打包为 ZIP（根目录即为 extensionId `idf-sdd`），通过 CodeAgent Extension 管理界面上传安装。ZIP 包需符合 [Extension 规范](https://wiki.huawei.com/domains/59421/wiki/286914/WIKI2026031610425678)的上传校验规则。

团队分发时，建议将 `idf-sdd` 迁移到独立的公司 Git 仓库，打包后上传到 CodeAgent Extension 市场。

## 使用流程

每个业务仓库首次接入时执行一次：

```text
/isdd-init
```

每项需求按以下阶段执行：

```text
/isdd-define <需求描述>
/isdd-plan <change-id>
/isdd-build <change-id>
/isdd-verify <change-id>
/isdd-ship <change-id> --create-pr
```

任何时候都可以运行 `/isdd-status`，查看当前变更、阻塞原因、归档缺口和下一条准确命令。

## 仓库归档

插件将以下文件与业务代码一起保存：

```text
docs/isdd/
|-- repository.yaml
|-- repository.md
|-- policy.md
`-- changes/
    `-- <change-id>/
        |-- spec.md
        |-- plan.md
        |-- verification.md
        `-- delivery.md
```

`repository.md` 保存架构、领域语言、ADR 索引、工程命令、测试 seam 和敏感区域。每项变更的归档保存需求、技术决策、实际偏差、验证证据和交付历史。

自动生成的 `.codegraph/` 是本地可重建缓存，会被加入 `.gitignore`，不得提交到业务仓库。

## 流程模式

- `lite`：局部、可回滚、影响范围小，且不涉及契约、数据、安全、依赖或基础设施。归档保持精简，可自动执行到验证阶段。
- `standard`：普通功能、缺陷和重构。需求与计划需要确认，验证阶段分别执行需求符合度和工程质量检查。
- `strict`：认证、授权、支付、个人数据、迁移、公共契约、基础设施或架构级变更。两个隔离的只读审查智能体会并行检查需求符合度和工程质量。

三种模式使用完全相同的阶段。模式只调整文档深度、审查独立性和门禁强度，不改变生命周期。

## 验证插件包

```bash
npm test
npm run validate
```
