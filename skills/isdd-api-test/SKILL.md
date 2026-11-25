---
name: isdd-api-test
description: 为 JDK 21 Spring MVC 微服务盘点和补写 REST 业务组件测试，或在需求的 plan、TDD 和 verify 中复用同一套场景与覆盖门禁。可独立用于 Git 仓库，无需 SDD 初始化或 CodeGraph。
---

# Java 接口业务测试

接受 audit、plan、write（或 backfill）、verify、report，以及可选服务、变更 ID、Git 基线和范围。直接提出“补全订单服务的接口测试”时，顺序完成盘点、设计、编写和验证。仅要求看现状时执行 audit。独立使用只需本目录、Python 3.9+、Git、项目的 JDK 21 和构建工具。所有脚本、探针和参考均在本 Skill 内。以下 SCRIPT 代表本目录的 scripts/api_test.py；所有路径配置相对业务仓根目录。

## audit：盘点和接入

1. 运行 `python SCRIPT discover --root <repo>`。读构建文件、MVC 配置、业务模块、发布 profile、现有 UT/IT、错误码与依赖。可复用已有 repository.md 和 CodeGraph。找到 WebFlux、函数式、动态注册、自定义 servlet、多 MVC 上下文或无法启动的发布配置时，列出边界；未覆盖的入口不允许报告全服务完成。
2. 首次接入按 [构建与配置](references/setup.md) 建立提交入库的配置和完整应用路由探针，记录每个业务模块和发布配置。把现有可信组件用例接入采集。可选为已有 MockMvc 测试加入 hitRecorder，区分已访问和已验证。对照部署配置、已有 OpenAPI 或发布清单核实分母，对不可发现的已知操作用 expectedOperations 固定。源码只能提供线索。
3. 运行 `python SCRIPT audit --root <repo> --base <ref>`。读取 operations、status、tests、excluded 和 lines。audit 在真实套件完成后允许输出缺口。缺报告与执行失败须列为阻塞。全仓接口业务覆盖率用 covered/total 展示，名称包含模块/profile；行数按源文件和行号求并集。暂未启用 JaCoCo 的团队看到未采集；已配置的报告缺失会失败。

## plan：为存量或新需求确定独立预期

把批准范围写到 `config/isdd/api-plans/<id>.json`，每条场景包含 suite、operation、id、expected。SDD 将其与 spec 验收项和 plan 的测试 seam 对照。只改 Service、鉴权、Advice 或序列化时，仍须向上查调用到的 REST 行为。增量不能用“已有接口覆盖”代替新增验收场景。确实无 REST 行为变化时记录 noBehaviorChange 的具体理由，由审查者核对。接口发生替换或下线时，明确消费者契约、替代入口和旧路由的负向断言。

存量用历史缺陷、消费者契约、可信 UT 或经确认的样例确定预期。只观察到的旧输出标为待确认。scope 取全服务或经批准的一批；批次计划保存当时 audit 的全部已覆盖键。新增功能用需求预期和现有项目的单元测试约定。见 [场景和断言](references/scenarios.md)。

## write / backfill：让请求穿过业务层

写每条用例时，先看验收断言依赖什么行为，并复用项目已有的测试设施。固定查询结果、异常或消息发送次数通常用 Mockito 即可。只有后续操作必须观察前一次实际写入的状态（如写后读、同键去重），且项目缺少合适实现时，才随用例在当前测试类内写最小 Fake。按项目约定注入业务已有的出站接口，并隔离各用例的状态。多处测试确实复用时再提取到项目已有的测试包。盘点与计划阶段不生成 Fake，不预建公共目录或复制通用模板。

在项目测试源码中按计划生成普通 JUnit 用例。MockMvc 进入真实 Controller、Service、领域对象，保留生效的校验、序列化、异常映射与安全链。DB、Redis、MQ 和远程调用在已有出站边界替换。复用已有 Controller 测试类或仓库约定，SDD 下遵守 DT 命名和增量 UT 标准。用业务验收场景关联 evidence.scenario，列出实际参与决策的业务 Bean。辅助请求不记为该用例验证的业务操作。该标记是需评审的事实声明，运行器只能核对实际 Handler、Bean 实例和测试执行结果。

增量执行真实 RED → GREEN → REFACTOR，写业务单测和接口行为测试；故障先复现。纯存量补测允许“原先存在覆盖缺口 → 新测试通过并消除缺口”为基线。有历史缺陷样本时验证其能使断言失败。隔离初始化中的迁移器、监听器、定时任务和连接探测，检查禁用项没有把业务路由或核心规则一起关闭。运行时无需 Docker 和共享中间件。

## verify / report：由构建结果裁定

- 独立验收：`python SCRIPT verify --root <repo> --change <id> --base <ref>`。全仓无变更计划可省略 --change；设置增量行门槛时必须给 --base。SDD 使用 spec.md 的 base_ref、change ID。运行结束从 JSON 摘录覆盖分子/分母、缺口、场景名、JUnit 测试标识、UT 和合并行覆盖、增量覆盖及不适用原因。完整报告在 .isdd-api/runs/<run>/report.json。
- report 查看上次结果（含失败时的原因），标明运行批次和时效。正式复核可用 `python SCRIPT check --root <repo> --change <id> --base <ref>`；它只接受当前代码与计划对应的成功 verify。新一次 audit 或失败的 verify 不可充当通过凭证。
- 报告不完整、计划行为缺证据、已覆盖接口回退、适用门槛未达或构建失败时保持失败。由业务断言的独立评审确认语义质量。跳过、前置鉴权拦截或只替换 Service 的 Web 切片单独记录。业务接口 100% 表示每个操作有通过的代表性业务场景。
