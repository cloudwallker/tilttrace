# TiltTrace

A zero-dependency, offline decision sensitivity lab.

**你的偏好只要改变多少，当前首选就会失去领先优势？**

[English](README.md) · [开始使用](#start) · [演示](#example) · [数据格式](#data-format) · [计算方法](docs/METHOD.md) · [测试](#tests)

![TiltTrace 合成办公地点决策演示](assets/demo.jpg)

TiltTrace 是轻量、离线的决策敏感性实验室。为方案打分并分配权重后，它计算每个竞争方案追平当前首选所需的最少权重重分配。可追平的结果附有可以直接应用、复验的具体权重。

**English description:** TiltTrace is a zero-dependency, offline decision sensitivity lab that finds the minimum weight redistribution needed to tie the current leader, with replayable numerical witnesses.

## 主要功能

- **最小转移量：** “2.22 pp”表示在标准之间搬动 2.22 个百分点的权重，总权重始终为 100%。
- **锁定标准：** 固定不能变化的权重，只在其余标准之间重新分配。
- **复验结果：** 查看转移清单，应用见证权重，核对完整排名，再撤回预览。
- **完全本地：** 原生 HTML、CSS 和 JavaScript，无依赖、构建步骤、CDN、网络请求、遥测或持久化存储。
- **便于保存：** 中英文界面，显式导入、导出 JSON。

加权打分和敏感性分析已有成熟方法。TiltTrace 的特色是把权重总和守恒、锁定标准、最小总变差距离和可重放数值见证组合成小型离线工具，不声称算法首创。

<a id="start"></a>
## 开始使用

1. 下载仓库 ZIP 并解压。
2. 双击 `index.html`，用现代浏览器打开；断网也能使用。
3. 修改标题、标准和方案名称，编辑分数，拖动权重滑条。
4. 锁定固定权重，查看竞争方案的追平边界并预览见证。
5. 导出 JSON 保存。刷新或关闭页面会丢弃内存中的决策。

所有分数都是 **0–10 的主观评价，越高越好**。`Cost` 应填写对价格或负担能力的满意度，而非金额；`Commute` 分数越高表示通勤越理想。修改一个权重时，其余未锁定权重按原有比例分配剩余份额；若它们原来全为零，则平均分配。

首版界面可编辑现有行。需要改变标准或方案数量时，导入包含 2–8 个标准和 2–8 个方案的 JSON。

<a id="example"></a>
## 演示：Choose a place to work

全部数据均为合成示例，不代表对真实办公地点的推荐。

| 方案 | Focus · 40% | Cost · 30% | Commute · 20% | Flexibility · 10% | 加权分数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Quiet studio | 9 | 4 | 8 | 5 | 6.9 |
| Shared hub | 6 | 8 | 7 | 9 | 7.1 |
| Home desk | 5 | 10 | 10 | 3 | 7.3 |

Home desk 暂时领先。将 **20/9 ≈ 2.22 pp 从 Commute 转到 Flexibility**，Shared hub 就能追平它。见证权重约为 `[40, 30, 17.777778, 12.222222]`，此时两者分数均约为 `7.144444`。

这是**追平边界**，并非已经严格获胜。结果中的 `canWin` 表示在允许的权重空间内，竞争方案有机会严格超过本次计算的基准首选；**只能追平（tie-only）**表示最多达到相等；**不可达（unreachable）**表示当前锁定条件下连追平都做不到。

每次计算都以计算开始时的首选为基准。**追平该首选不等于成为全局第一**：在见证权重下，第三个方案可能得分更高。应用见证后应查看完整排名。

<a id="data-format"></a>
## 数据格式

导入 UTF-8 JSON，文件最多 **64 KiB（65,536 字节）**。模型最多 **8 个标准 × 8 个方案**，两者均至少 2 个；每个方案的分数数量必须与标准数量一致。权重为 0–100 的有限数值，允许为零，总和须在 `1e-7` 误差内等于 100。分数为 0–10 的有限数值；标题为 1–120 个字符，标准和方案名称为 1–60 个字符；`locked` 为布尔值。非法数据和未知版本会被拒绝，未识别字段会被丢弃。

```json
{
  "schemaVersion": 1,
  "title": "Choose a place to work",
  "criteria": [
    { "name": "Focus", "weight": 40, "locked": false },
    { "name": "Cost", "weight": 30, "locked": false },
    { "name": "Commute", "weight": 20, "locked": false },
    { "name": "Flexibility", "weight": 10, "locked": false }
  ],
  "options": [
    { "name": "Quiet studio", "scores": [9, 4, 8, 5] },
    { "name": "Shared hub", "scores": [6, 8, 7, 9] },
    { "name": "Home desk", "scores": [5, 10, 10, 3] }
  ]
}
```

## 如何理解结果

距离采用**总变差**：所有权重变化绝对值之和的一半。把 3 pp 从一个标准转到另一个标准，距离是 **3 pp**，不是 6 pp。它衡量分数不变时，排名对你所设权重的敏感程度，不是判断错误的概率，也不是现实结果的置信度。

已经并列时距离为零；锁定标准可能使追平不可达。计算使用小数值容差；界面展示的四舍五入权重可能无法精确复现并列。使用“重放”应用完整见证，再导出该模型，即可保存完整精度的权重。详见[模型、证明与限制](docs/METHOD.md)。

<a id="tests"></a>
## 测试

安装 **Node.js 20 或更新版本**后，在项目目录执行：

```sh
npm test
```

无需 `npm install`。测试使用 Node 内置测试运行器；GitHub Actions 同样直接运行此命令，不安装包。日常打开应用不需要 Node。

## 许可证

[MIT](LICENSE) · Copyright (c) 2026 [cloudwallker](https://github.com/cloudwallker)
