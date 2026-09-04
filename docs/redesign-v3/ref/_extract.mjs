// 提取 stylekit.top 参考页的可见文本（供 IA 提案引用，只读工具脚本）
import fs from 'node:fs'

const dir = 'D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref'
for (const name of ['showcase.html', 'style-zh.html', 'style-en.html']) {
  let html = fs.readFileSync(`${dir}/${name}`, 'utf8')
  // 去掉 script/style 内容量大的块（但保留 <style> 里的 keyframes 名单，单独提取）
  const keyframes = [...html.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])
  const keyframesBlocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)]
    .map(m => m[1])
    .join('\n')
    .match(/@keyframes[\s\S]*?\n\s*}/g)
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  // 块级标签换行、行内标签去壳
  body = body
    .replace(/<\/(div|section|header|footer|nav|p|h[1-6]|li|tr|table|article|aside|main|details|summary|button|a|label)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  // 实体与空白压缩
  body = body
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 0).join('\n')
  const out = `# ${name} 提取文本\n\n## @keyframes 名单\n${keyframes.join(', ')}\n\n## <style> 块中的 keyframes 定义\n\`\`\`css\n${(keyframesBlocks || []).slice(0, 40).join('\n\n')}\n\`\`\`\n\n## 可见文本\n${body}`
  fs.writeFileSync(`${dir}/${name.replace('.html', '.txt')}`, out)
  console.log(`${name} → ${name.replace('.html', '.txt')} (${out.length}B, ${keyframes.length} keyframes)`)
}
