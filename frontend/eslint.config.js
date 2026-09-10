// RF-1 安全网：ESLint 平铺配置（ESLint 9）。
//
// 设计取舍（重要）：**只开 error 级、且只收正确性规则**，不收风格规则。
// 理由：这套代码库此前 0 lint，一次开满 stylistic 会瞬间几千条告警 →
// 变成"人人 --no-verify"的噪音门禁。先立能挡住真问题的门。
//
// 基准：eslint-plugin-vue 的 flat/essential（Vue 正确性：重复 key、改 props、未用组件…）
//      + @typescript-eslint 的未使用变量（_ 前缀豁免）
//      + 少量通用正确性规则。
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'src/api/generated.*', 'src/**/*.d.ts'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    // Vue SFC：vue-eslint-parser 负责模板，<script lang="ts"> 交给 TS parser
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
  },
  {
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // TS 里由编译器负责，避免与 vue-tsc 重复报错
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // 正确性（非风格）
      'no-dupe-keys': 'error',
      'no-dupe-else-if': 'error',
      'no-unsafe-negation': 'error',
      'no-self-assign': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-unreachable': 'error',
      'no-console': 'off',
      // 项目既有命名：允许单词组件名
      'vue/multi-word-component-names': 'off',
      // v-html 是刻意行为（Markdown 已 DOMPurify），不因 lint 报错
      'vue/no-v-html': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
]
