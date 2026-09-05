/**
 * stylelint 守护清单（04 §4.7 禁止项机器化，T18/M4-E1）
 *
 * 立规来源：①提炼文档「匹配即拒绝」禁止项（playful+plain 合并清单补 border-gray-*）
 * ②03 §11.1 组件层禁止字面色值（04 §3.1 铁律 2 的机器化）。
 *
 * 两波口径（04 任务书：存量分两波，收编达标后转 error）：
 * - ERROR（新犯拦截，存量当前为 0）：
 *   · border-radius 直角铁律（现全文件 0 声明）
 *   · box-shadow inset 模糊影（硬影以外的玻璃态语汇）
 *   · max-nesting-depth 3
 *   · 断点白名单 width ∈ 480/640/720/1024/1280（§4.5 目标四档 480/720/1024/1280 +
 *     存量 640 一档放行——收编后从白名单移除；hover/reduced-motion 特性查询不受限）
 * - WARNING（存量两波：155 行 hex + 5 处 !important，收编后转 error）：
 *   · 颜色只准 var()/transparent（§3.1 铁律 2；tokens/** 定义层豁免——hex 的合法居所）
 *   · declaration-no-important（reduced-motion 无障碍块 2 处属合法豁免口径）
 *
 * R8 静止 rotate 检查：stylelint 粗防线不做（误杀 :active/@keyframes/装饰白名单，
 * 04 §4.7 落地口径=CDP computed-style 反解为权威门）。
 */
module.exports = {
  ignoreFiles: ['dist/**', 'node_modules/**', '**/tokens/**'],
  rules: {
    // ---- 直角铁律（error：禁非零圆角；border-radius: 0 的表单归一化声明放行——iOS Safari 输入框默认圆角的规一化是必要声明）----
    'declaration-property-value-disallowed-list': {
      'border-radius': [/^(?!(0|0px|0%)?$)/],
    },
    // ---- 硬影以外禁 inset 模糊影 ----
    'declaration-property-value-disallowed-list': {
      'box-shadow': [/^inset/i],
    },
    // ---- 50% 律断点白名单（error：480/640/720/1024/1280；hover/reduced-motion 特性查询不在其列）----
    'media-feature-name-value-allowed-list': {
      width: ['480px', '640px', '720px', '1024px', '1280px'],
    },
    // ---- 嵌套深度 3 ----
    'max-nesting-depth': 3,
    // ---- 存量两波（warning）：155 行 hex + 5 处 !important，收编后转 error ----
    'declaration-property-value-allowed-list': [
      {
        '/^(color|background-color|border(-[a-z-]+)?-color)$/': ['/^var\\(--/', '/^transparent$/'],
      },
      { severity: 'warning' },
    ],
    'declaration-no-important': [true, { severity: 'warning' }],
  },
  overrides: [
    {
      // 令牌定义层：hex 是色板原子的合法居所（定义层与消费层分离——§3.1 铁律 2 管的是消费侧）
      files: ['**/tokens/**'],
      rules: {
        'declaration-property-value-allowed-list': null,
      },
    },
  ],
}