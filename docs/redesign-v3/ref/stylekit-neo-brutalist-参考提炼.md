# StyleKit Neo-Brutalist 参考提炼（用户指定参考源）

> 来源：https://www.stylekit.top/zh/styles/neo-brutalist（规范全文）+ /styles/neo-brutalist/showcase（动效实演）。
> 原始抓取物在本目录：`style-zh.html` / `style-en.html` / `showcase.html`（Next.js SSR 页，含内联规范）、`style-zh-text.txt`（规范正文纯文本 786 行）、`showcase-inline-styles.css`（动效标本）。
> 用户原话：**保留并完善现有风格**；showcase 的动效「特别舒服，希望参考」。

## 一、规范要点（plain neo-brutalist，比现有 stylepkg「playful 变体」更严格）

### 边框/阴影/圆角
- 边框：纯黑 `border-2 md:border-4 border-black`；**禁止** border-gray-*/border-slate-*
- 阴影：仅硬边缘 `shadow-[Xpx_Xpx_0px_0px_rgba(0,0,0,1)]`；三档 token：小 2/4、中 4/8、大 6/12（mobile/md）；**禁止**任何 blur 阴影
- 圆角：`rounded-none`，装饰圆除外

### 字体排印
- 标题 font-black (900) tracking-tight；正文/标签 font-mono（标签额外 uppercase tracking-wider）
- 字号阶梯：Hero 4xl→6xl→8xl；H1 3xl→5xl；正文 sm→base；小字 xs→sm
- 间距阶梯：section py-12→24→32；卡片 p-4→6；gap 2/4/6

### 配色
- 主：黑 #000000 / 白 #ffffff；弱化正文 text-gray-700（黑白灰以外的灰阶仅此一档）
- 强调：粉 #ff006e（CTA/hover）· 荧光绿 #ccff00（成功/Hero 底）· 青 #00d9ff（链接/信息）· 橙 #ff9500（标签/警示）· 亮黄 #ffff00（hover 底色）
- 阴影色：默认黑；hover 可切强调色（品红）

### 响应式缩放（重要）
- **移动端数值 ≈ 桌面端 50%**：border-2 md:border-4；shadow 4px md:8px；间距/字号同比例——全站统一一条缩放律，替代现有两套断点并存

## 二、交互物理（用户「特别舒服」的动效核心）

### Physical Crushing（物理压平）
按钮 active 位移量 **必须等于**原始阴影偏移：6px 阴影 → `active:translate-x-[6px] active:translate-y-[6px] active:shadow-none`——按钮被完整压入表面。
- hover：**阴影增大**（6→10px）并向左上抬起 `hover:-translate-x-1 hover:-translate-y-1`（hover 不压平，active 才压平）
- ⚠️ 现网与 stylepkg-playful 的 hover 是「阴影归零+位移」——与新参考物理相反，重设计时统一为参考物理

### Brutal Snap（硬切换色）
hover 背景瞬间切高对比色（如 `hover:bg-[#ffff00]`），**禁止渐变/opacity 淡出**；duration-150 ease-out 只用于位移与阴影。

### 时长表
| 交互 | 时长 | 缓动 |
|---|---|---|
| hover 位移/阴影 | 150ms | ease-out |
| active 按压 | 瞬间 | — |
| 颜色瞬切 | 0ms | 硬切 |

### Showcase 动效标本（showcase-inline-styles.css 实测）
```css
@keyframes brutal-stamp { /* 盖章入场：overshoot 弹性 */
  0%   { transform: scale(1.4) rotate(-6deg); opacity: 0; }
  60%  { transform: scale(0.96) rotate(1deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
.brutal-stamp-anim { animation: brutal-stamp .35s cubic-bezier(0.16,1,0.3,1) forwards; }

@keyframes brutal-march { /* 蚂蚁线行军边框 */
  0% { background-position: 0 0; } 100% { background-position: 32px 0; }
}
.brutal-march-anim { animation: brutal-march .6s linear infinite; }
```
- 特征曲线：`cubic-bezier(0.16,1,0.3,1)`（easeOutExpo 系）；showcase 页全站 88 处 cubic-bezier，说明动效是「少而狠」：入场盖章、行军边框、压平、硬切
- 组合建议（供 tokens 落地）：入场=stamp（350ms/0.16,1,0.3,1）；持续氛围=march（仅装饰边框，注意 prefers-reduced-motion 降级）；hover=snap+grow；active=crush

## 三、与现有 stylepkg-playful 的差异对账（design-engineer 仲裁输入）

| 维度 | 现网 playful | 用户参考 plain | 建议 |
|---|---|---|---|
| 旋转倾斜 | rotate ±1~2deg 是签名特征 | 无旋转 | **保留少量旋转作为个性基因**，但限制在卡片/徽章，列表卡片禁旋转（信息密度） |
| hover 物理 | 阴影归零+位移（悬停压平） | hover 增影+抬起，active 压平 | 采纳参考物理（用户指定参考优先） |
| 色板 | #ff6b6b/#4ecdc4/#ffe66d | #ff006e/#ccff00/#00d9ff/#ff9500 | 多主题 tokens：默认主题可保留现网色板基因，新增主题按参考色板；饱和度分级（大面积底色用低饱和变体） |
| 字体 | 标题黑体大写、正文 mono（一致） | 同 | 保留，补中文栈（黑体大写对中文=粗黑字重，mono 对中文需定义 CJK mono 回退） |
| 禁止项 | 无圆角/无渐变/无模糊阴影（一致） | 同 + 禁 border-gray-* | 合并成一份统一禁止模式表进 tokens 文档 |
| 无障碍 | 未提 | WCAG 2.1 AA + 键盘可达 | 采纳为硬验收 |

## 四、落地注意（结合 01-现状盘点）
- 参考规范是 Tailwind class 形态；现网未接 Tailwind——tokens 需翻译成 CSS 变量层（design-engineer 负责）
- 参考自带「移动端 50% 缩放律」可收敛现网两套断点并存的问题
- stamp/march 入场动效与现网零动效基线：入场动效只给首屏关键元素与状态变化，列表项不做逐项入场（性能+认知负荷）