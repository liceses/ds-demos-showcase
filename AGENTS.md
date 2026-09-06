## dsh-project-model 协议（项目模型）
<!-- dsh-project-model:protocol:v1 -->

- 先读 `docs/model/`（CIM 需求层 / PIM 设计层），再读代码。
- 模型与代码冲突时，**以代码为准**；PIM 真理源 = 代码，偏差即错误。
- 骨架段（`pim.generated.*`）由脚本生成，勿手改；改动后跑 `python tooling/extract.py`。
- 语义段（`docs/model/modules/*.json`）改动需通过 `python tooling/validate.py`。
- 本段由 @icelily/dsh-project-model 管理；再次安装检测到标记即跳过。
