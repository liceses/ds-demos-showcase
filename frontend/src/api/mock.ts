// Mock API —— 前端独立运行时使用的占位数据与逻辑。
// 切换到真实后端：设置环境变量 VITE_USE_MOCK=false，api/index.ts 会改走 axios。

import type {
  AdminDemo,
  AdminUser,
  Announcement,
  AuthResponse,
  Comment,
  CreateDemoPayload,
  DemoDetail,
  DemoListParams,
  DemoSummary,
  Paginated,
  SessionLog,
  Settings,
  Tag,
  UpdateDemoPayload,
  User,
} from './types'

const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms))

const announcements: Announcement[] = [
  { id: 1, type: 'manual', title: '站点公告', content: '欢迎来到 DS 民间科研成果展示站，欢迎大家投稿 AI 生成的网页 Demo！', demo_slug: null, created_by: 1, created_at: '2025-01-02T00:00:00Z' },
  { id: 2, type: 'auto', title: '新 Demo 发布', content: '植物大战僵尸（极简版）', demo_slug: 'pvz-demo', created_by: 2, created_at: '2025-03-01T10:00:00Z' },
  { id: 3, type: 'demo_update', title: 'Demo 更新：植物大战僵尸', content: '修复第二关音效不同步的问题', demo_slug: 'pvz-demo', created_by: 2, created_at: '2025-03-02T15:30:00Z' },
  { id: 4, type: 'update', title: '站点更新', content: 'feat: 整站公告系统上线', demo_slug: null, created_by: null, created_at: '2025-03-03T09:00:00Z' },
]

function svgCover(bg: string, text: string, sub: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="${bg}"/>
  <rect x="14" y="14" width="612" height="452" fill="none" stroke="#000" stroke-width="8"/>
  <text x="320" y="220" font-family="Arial, sans-serif" font-size="96" font-weight="900" text-anchor="middle" fill="#000">${text}</text>
  <text x="320" y="290" font-family="monospace" font-size="22" font-weight="700" text-anchor="middle" fill="#000">${sub}</text>
  <rect x="20" y="430" width="120" height="20" fill="#000"/>
  <rect x="500" y="20" width="120" height="20" fill="#000"/>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const users: User[] = [
  { id: 1, username: 'admin', role: 'admin', status: 'active', bio: '站点管理员', created_at: '2025-01-01T00:00:00Z' },
  { id: 2, username: 'tester', role: 'user', status: 'active', bio: 'AI Demo 爱好者', created_at: '2025-02-11T08:00:00Z' },
  { id: 3, username: 'alice', role: 'user', status: 'active', bio: '收集各种网页小玩具', created_at: '2025-03-02T10:30:00Z' },
]

const passwordOf: Record<string, string> = {
  admin: 'admin123',
  tester: 'password',
  alice: 'password',
}

let currentUser: User | null = null

const tags: Tag[] = [
  { id: 1, key: 'model', value: 'dsv4', description: '模型版本总类', parent_id: null, demo_count: 6, child_count: 2 },
  { id: 2, key: 'model', value: 'dsv4-flash', description: 'DeepSeek V4 Flash —— 快速推理', parent_id: 1, demo_count: 3, child_count: 0 },
  { id: 3, key: 'model', value: 'dsv4-pro', description: 'DeepSeek V4 Pro —— 强推理', parent_id: 1, demo_count: 3, child_count: 0 },
  { id: 4, key: 'plugin', value: 'routing-suite', description: '路由套件插件', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 5, key: 'skills', value: 'J-space', description: 'J-space 技能工作区', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 6, key: 'preset', value: 'router-standard', description: '标准路由预设', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 7, key: 'type', value: 'effect', description: '视觉特效类', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 8, key: 'type', value: 'widget', description: '小组件类', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 9, key: 'type', value: 'game', description: '小游戏类', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 10, key: 'author', value: 'tester', description: '系统作者标签', parent_id: null, demo_count: 3, child_count: 0 },
  { id: 11, key: 'author', value: 'alice', description: '系统作者标签', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 12, key: 'author', value: 'admin', description: '系统作者标签', parent_id: null, demo_count: 1, child_count: 0 },
]

const demos: DemoDetail[] = [
  {
    slug: 'demo_粒子星空',
    title: '粒子星空',
    description: 'Canvas 粒子星空，鼠标移动产生引力扰动，适合作为背景特效。',
    cover_url: svgCover('#4ecdc4', '✦', 'particle starfield'),
    author: 'tester',
    author_id: 2,
    tags: [
      { key: 'model', value: 'dsv4-flash' },
      { key: 'skills', value: 'J-space' },
      { key: 'type', value: 'effect' },
      { key: 'author', value: 'tester' },
    ],
    view_count: 128,
    download_count: 12,
    comment_count: 3,
    created_at: '2025-03-01T09:00:00Z',
    status: 'approved',
    session_log_count: 1,
    commit_count: 3,
    is_author: false,
    previewHtml: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;overflow:hidden;background:#000}canvas{display:block}</style></head><body><canvas id="c"></canvas><script>
const cv=document.getElementById('c'),x=cv.getContext('2d');let W,H,P=[],M={x:-1e3,y:-1e3};
function rs(){W=cv.width=innerWidth;H=cv.height=innerHeight;P=Array.from({length:180},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2+0.5,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4}))}
addEventListener('resize',rs);addEventListener('mousemove',e=>{M.x=e.clientX;M.y=e.clientY});rs();
function tick(){x.fillStyle='rgba(0,0,0,.18)';x.fillRect(0,0,W,H);for(const p of P){p.x+=p.vx;p.y+=p.vy;const dx=p.x-M.x,dy=p.y-M.y,d=Math.hypot(dx,dy);if(d<160){p.x+=dx/d*1.6;p.y+=dy/d*1.6}if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;x.fillStyle='#ffe66d';x.beginPath();x.arc(p.x,p.y,p.r,0,7);x.fill()}requestAnimationFrame(tick)}tick();
</script></body></html>`,
  },
  {
    slug: 'demo_霓虹时钟',
    title: '霓虹时钟',
    description: '霓虹数字时钟，七段数码管风格，深色底上发光。',
    cover_url: svgCover('#ff6b6b', '21:47', 'neon clock'),
    author: 'tester',
    author_id: 2,
    tags: [
      { key: 'model', value: 'dsv4-pro' },
      { key: 'preset', value: 'router-standard' },
      { key: 'type', value: 'widget' },
      { key: 'author', value: 'tester' },
    ],
    view_count: 96,
    download_count: 8,
    comment_count: 2,
    created_at: '2025-03-02T12:00:00Z',
    status: 'approved',
    session_log_count: 1,
    commit_count: 3,
    is_author: false,
    previewHtml: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#ff6b6b;font-family:monospace;font-size:12vw;font-weight:900;letter-spacing:.08em;text-shadow:0 0 18px currentColor,0 0 42px currentColor}</style></head><body><div id="t">00:00:00</div><script>
function p(n){return String(n).padStart(2,'0')}function u(){const d=new Date();t.textContent=p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())}setInterval(u,1000);u();
</script></body></html>`,
  },
  {
    slug: 'demo_贪吃蛇',
    title: '贪吃蛇',
    description: '经典贪吃蛇，键盘方向键控制，支持计分与重新开始。',
    cover_url: svgCover('#95e1d3', 'SNAKE', 'keyboard game'),
    author: 'alice',
    author_id: 3,
    tags: [
      { key: 'model', value: 'dsv4-flash' },
      { key: 'plugin', value: 'routing-suite' },
      { key: 'type', value: 'game' },
      { key: 'author', value: 'alice' },
    ],
    view_count: 210,
    download_count: 25,
    comment_count: 5,
    created_at: '2025-03-03T15:30:00Z',
    status: 'approved',
    session_log_count: 1,
    commit_count: 4,
    is_author: false,
    previewHtml: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#ffe66d;font-family:monospace}canvas{border:6px solid #000;background:#fff}</style></head><body><canvas id="c" width="400" height="400"></canvas><script>
const cv=c.getElementById('c'),x=cv.getContext('2d'),S=20,N=20;let snake=[{x:10,y:10}],dir={x:1,y:0},food={x:15,y:15},score=0,dead=false,t=0;
addEventListener('keydown',e=>{const k=e.key;if(k==='ArrowUp'&&dir.y!==1)dir={x:0,y:-1};if(k==='ArrowDown'&&dir.y!==-1)dir={x:0,y:1};if(k==='ArrowLeft'&&dir.x!==1)dir={x:-1,y:0};if(k==='ArrowRight'&&dir.x!==-1)dir={x:1,y:0};if(k==='r'){snake=[{x:10,y:10}];dir={x:1,y:0};food={x:15,y:15};score=0;dead=false}});
function loop(){if(dead)return;t++;if(t%7)return requestAnimationFrame(loop);const h={x:snake[0].x+dir.x,y:snake[0].y+dir.y};if(h.x<0||h.x>=N||h.y<0||h.y>=N||snake.some(s=>s.x===h.x&&s.y===h.y)){dead=true;x.fillStyle='#000';x.fillRect(0,0,400,400);x.fillStyle='#fff';x.font='bold 30px monospace';x.fillText('GAME OVER',80,190);return}snake.unshift(h);if(h.x===food.x&&h.y===food.y){score++;food={x:Math.random()*N|0,y:Math.random()*N|0}}else snake.pop();x.fillStyle='#fff';x.fillRect(0,0,400,400);x.fillStyle='#000';for(const s of snake)x.fillRect(s.x*S,s.y*S,S-2,S-2);x.fillStyle='#ff6b6b';x.fillRect(food.x*S,food.y*S,S,S);x.fillStyle='#000';x.font='bold 14px monospace';x.fillText('score '+score+' (R restart)',10,20);requestAnimationFrame(loop)}loop();
</script></body></html>`,
  },
  {
    slug: 'demo_打字机效果',
    title: '打字机排版',
    description: '打字机逐字输出排版，适合 Story 型页面。',
    cover_url: svgCover('#f38181', 'TYPE', 'typewriter'),
    author: 'tester',
    author_id: 2,
    tags: [
      { key: 'model', value: 'dsv4-pro' },
      { key: 'skills', value: 'J-space' },
      { key: 'type', value: 'widget' },
      { key: 'author', value: 'tester' },
    ],
    view_count: 75,
    download_count: 6,
    comment_count: 1,
    created_at: '2025-03-04T18:00:00Z',
    status: 'approved',
    session_log_count: 1,
    commit_count: 2,
    is_author: false,
    previewHtml: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;font-family:monospace;padding:40px}pre{font-size:22px;line-height:1.8;border:6px solid #000;padding:32px;background:#ffe66d;box-shadow:8px 8px 0 #000;white-space:pre-wrap;max-width:720px;min-height:180px}</style></head><body><pre id="out"></pre><script>
const txt='你好，这里是 AI 生成的网页 Demo。\n每一行都由模型逐步写出。\n—— DS 民间科研成果展示';let i=0;const out=document.getElementById('out');setInterval(()=>{if(i<=txt.length){out.textContent=txt.slice(0,i)+'▍';i++}else{i=0}},90);
</script></body></html>`,
  },
  {
    slug: 'demo_音频可视化',
    title: '音频可视化',
    description: 'Canvas 频谱条动画，模拟音频可视化的视觉效果。',
    cover_url: svgCover('#4ecdc4', 'WAVE', 'audio visualizer'),
    author: 'alice',
    author_id: 3,
    tags: [
      { key: 'model', value: 'dsv4-flash' },
      { key: 'preset', value: 'router-standard' },
      { key: 'type', value: 'effect' },
      { key: 'author', value: 'alice' },
    ],
    view_count: 143,
    download_count: 14,
    comment_count: 2,
    created_at: '2025-03-05T08:20:00Z',
    status: 'approved',
    session_log_count: 1,
    commit_count: 3,
    is_author: false,
    previewHtml: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#000;display:grid;place-items:center;height:100vh}canvas{border:6px solid #fff}</style></head><body><canvas id="c" width="600" height="240"></canvas><script>
const cv=document.getElementById('c'),x=cv.getContext('2d');let bars=Array.from({length:48},()=>Math.random()*120);
function tick(){x.fillStyle='#000';x.fillRect(0,0,600,240);for(let i=0;i<bars.length;i++){bars[i]+=(Math.random()*200-100)*0.2;bars[i]=Math.max(10,Math.min(220,bars[i]));const w=8,g=4,xx=i*(w+g);x.fillStyle=['#ff6b6b','#ffe66d','#4ecdc4','#95e1d3'][i%4];x.fillRect(xx,240-bars[i],w,bars[i]);x.strokeStyle='#fff';x.lineWidth=2;x.strokeRect(xx-1,240-bars[i]-1,w+2,bars[i]+2)}requestAnimationFrame(tick)}tick();
</script></body></html>`,
  },
  {
    slug: 'demo_记忆翻牌',
    title: '记忆翻牌游戏',
    description: '记忆翻牌配对小游戏，点击翻牌，配对消除。',
    cover_url: svgCover('#ffe66d', 'MEMO', 'match game'),
    author: 'admin',
    author_id: 1,
    tags: [
      { key: 'model', value: 'dsv4-pro' },
      { key: 'plugin', value: 'routing-suite' },
      { key: 'type', value: 'game' },
      { key: 'author', value: 'admin' },
    ],
    view_count: 187,
    download_count: 19,
    comment_count: 4,
    created_at: '2025-03-06T11:00:00Z',
    status: 'approved',
    session_log_count: 1,
    commit_count: 4,
    is_author: false,
    previewHtml: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#4ecdc4;font-family:monospace}.grid{display:grid;grid-template-columns:repeat(4,80px);gap:12px}.cell{width:80px;height:80px;border:5px solid #000;background:#fff;font-size:36px;display:grid;place-items:center;cursor:pointer;user-select:none}.cell.open{background:#ffe66d}.cell.done{background:#95e1d3;cursor:default}</style></head><body><div class="grid" id="g"></div><script>
const emojis=['A','B','C','D','E','F','G','H'];let cards=[...emojis,...emojis].sort(()=>Math.random()-.5),open=[],done=new Set();const g=document.getElementById('g');
cards.forEach((v,i)=>{const d=document.createElement('div');d.className='cell';d.dataset.i=i;d.textContent='?';d.onclick=()=>{if(open.includes(i)||done.has(i))return;d.textContent=v;d.classList.add('open');open.push(i);if(open.length===2){const [a,b]=open;if(cards[a]===cards[b]){done.add(a);done.add(b);g.children[a].classList.add('done');g.children[b].classList.add('done')}else{setTimeout(()=>{g.children[a].textContent='?';g.children[a].classList.remove('open');g.children[b].textContent='?';g.children[b].classList.remove('open')},500)}open=[]}};g.appendChild(d)});
</script></body></html>`,
  },
]

const comments: Record<string, Comment[]> = {
  demo_粒子星空: [
    { id: 1, demo_id: 1, user_id: 2, username: 'tester', parent_id: null, content: '背景特效很漂亮，适合做首页底纹。', created_at: '2025-03-01T10:00:00Z', children: [
      { id: 2, demo_id: 1, user_id: 3, username: 'alice', parent_id: 1, content: '是的，鼠标扰动效果很细腻。', created_at: '2025-03-01T11:00:00Z' },
    ] },
    { id: 3, demo_id: 1, user_id: 3, username: 'alice', parent_id: null, content: '想看生成会话日志，学习一下实现思路。', created_at: '2025-03-02T09:00:00Z' },
  ],
  demo_霓虹时钟: [
    { id: 4, demo_id: 2, user_id: 2, username: 'tester', parent_id: null, content: '霓虹感很强，字体如果再粗一点更带感。', created_at: '2025-03-02T13:00:00Z' },
  ],
  demo_贪吃蛇: [
    { id: 5, demo_id: 3, user_id: 2, username: 'tester', parent_id: null, content: '手感不错，就是速度有点快。', created_at: '2025-03-03T16:00:00Z', children: [
      { id: 6, demo_id: 3, user_id: 3, username: 'alice', parent_id: 5, content: '按 R 可以重开，速度是故意的 :)', created_at: '2025-03-03T17:00:00Z' },
    ] },
    { id: 7, demo_id: 3, user_id: 1, username: 'admin', parent_id: null, content: '已收录到首页推荐。', created_at: '2025-03-04T08:00:00Z' },
  ],
  demo_打字机效果: [
    { id: 8, demo_id: 4, user_id: 1, username: 'admin', parent_id: null, content: '排版很干净。', created_at: '2025-03-04T19:00:00Z' },
  ],
  demo_音频可视化: [
    { id: 9, demo_id: 5, user_id: 2, username: 'tester', parent_id: null, content: '颜色块很活泼。', created_at: '2025-03-05T09:00:00Z' },
  ],
  demo_记忆翻牌: [
    { id: 10, demo_id: 6, user_id: 3, username: 'alice', parent_id: null, content: '配对逻辑没问题，希望加计时。', created_at: '2025-03-06T12:00:00Z', children: [
      { id: 11, demo_id: 6, user_id: 1, username: 'admin', parent_id: 10, content: '已记入 TODO。', created_at: '2025-03-06T13:00:00Z' },
    ] },
  ],
}

const sessionLogs: Record<string, SessionLog[]> = {
  demo_粒子星空: [{ id: 1, filename: '生成会话.md', file_size: 1840, created_at: '2025-03-01T09:00:00Z' }],
  demo_霓虹时钟: [{ id: 2, filename: '生成会话.md', file_size: 1210, created_at: '2025-03-02T12:00:00Z' }],
  demo_贪吃蛇: [{ id: 3, filename: '生成会话.md', file_size: 2360, created_at: '2025-03-03T15:30:00Z' }],
  demo_打字机效果: [{ id: 4, filename: '生成会话.md', file_size: 980, created_at: '2025-03-04T18:00:00Z' }],
  demo_音频可视化: [{ id: 5, filename: '生成会话.md', file_size: 1530, created_at: '2025-03-05T08:20:00Z' }],
  demo_记忆翻牌: [{ id: 6, filename: '生成会话.md', file_size: 2070, created_at: '2025-03-06T11:00:00Z' }],
}

const sessionTexts: Record<string, string> = {
  'demo_粒子星星/生成会话.md': `# 生成会话：粒子星空

## 模型
- model:dsv4-flash
- plugin:routing-suite

## Prompt 摘要
“做一个 canvas 粒子星空背景，鼠标移动产生引力扰动。”

## 生成步骤
1. 初始化 canvas 与粒子数组
2. 实现粒子运动与边界反弹
3. 加入鼠标扰动
4. 添加背景淡出拖尾效果
5. 适配窗口 resize

## 迭代记录
- commit 1: 骨架与粒子运动
- commit 2: 鼠标扰动
- commit 3: 拖尾与视觉打磨`,
  'demo_霓虹时钟/生成会话.md': `# 生成会话：霓虹时钟

## 模型
- model:dsv4-pro
- preset:router-standard

## Prompt 摘要
“做一个霓虹数字时钟，七段数码管发光风格。”

## 生成步骤
1. 布局与字体
2. 时间逻辑
3. 霓虹光晕样式

## 迭代记录
- commit 1: 基础时钟
- commit 2: 霓虹样式
- commit 3: 响应式字号`,
  'demo_贪吃蛇/生成会话.md': `# 生成会话：贪吃蛇

## 模型
- model:dsv4-flash
- plugin:routing-suite

## Prompt 摘要
“经典贪吃蛇，方向键控制，计分与重开。”

## 生成步骤
1. 蛇与食物数据结构
2. 移动与碰撞
3. 计分与重开
4. 视觉与手感打磨

## 迭代记录
- commit 1: 蛇身移动
- commit 2: 食物与计分
- commit 3: 碰撞检测
- commit 4: 视觉打磨`,
  'demo_打字机效果/生成会话.md': `# 生成会话：打字机排版

## 模型
- model:dsv4-pro
- skills:J-space

## Prompt 摘要
“打字机逐字输出效果，适合 Story 页面。”

## 生成步骤
1. 文本与光标
2. 定时输出
3. 循环播放

## 迭代记录
- commit 1: 打字机逻辑
- commit 2: 视觉与循环`,
  'demo_音频可视化/生成会话.md': `# 生成会话：音频可视化

## 模型
- model:dsv4-flash
- preset:router-standard

## Prompt 摘要
“canvas 频谱条动画，模拟音频可视化。”

## 生成步骤
1. 频谱条布局
2. 动画随机波动
3. 配色与描边

## 迭代记录
- commit 1: 频谱条绘制
- commit 2: 波动动画
- commit 3: 配色打磨`,
  'demo_记忆翻牌/生成会话.md': `# 生成会话：记忆翻牌

## 模型
- model:dsv4-pro
- plugin:routing-suite

## Prompt 摘要
“记忆翻牌配对游戏，点击翻牌，配对消除。”

## 生成步骤
1. 卡片布局
2. 翻牌逻辑
3. 配对判定
4. 完成状态与视觉

## 迭代记录
- commit 1: 卡片生成
- commit 2: 翻牌与配对
- commit 3: 延迟回翻
- commit 4: 完成态视觉`,
}


const pendingDemos: DemoDetail[] = [
  {
    slug: 'demo_待审示例',
    title: '待审示例',
    description: '这是一个等待管理员审核的示例 Demo。',
    cover_url: svgCover('#ff6b6b', 'PEND', 'pending review'),
    author: 'tester',
    author_id: 2,
    tags: [
      { key: 'model', value: 'dsv4-flash' },
      { key: 'type', value: 'widget' },
      { key: 'author', value: 'tester' },
    ],
    view_count: 0,
    download_count: 0,
    comment_count: 0,
    created_at: '2025-03-07T08:00:00Z',
    status: 'pending',
    session_log_count: 0,
    commit_count: 1,
    is_author: false,
    previewHtml: '<!doctype html><html><body style="margin:0;font-family:monospace;display:grid;place-items:center;height:100vh;background:#ffe66d"><h1>待审核</h1></body></html>',
  },
]

let settings: Settings = { auto_approve: true }

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function findDemo(slug: string): DemoDetail | undefined {
  return [...demos, ...pendingDemos].find((d) => d.slug === slug)
}

function tagOf(t: { key: string; value: string }) {
  return `${t.key}:${t.value}`
}

export const mockApi = {
  // ---------- 认证 ----------
  async login(username: string, password: string): Promise<AuthResponse> {
    await delay(300)
    const user = users.find((u) => u.username === username)
    if (!user || passwordOf[username] !== password) {
      throw new Error('用户名或密码错误')
    }
    if (user.status !== 'active') {
      throw new Error('账号不可用')
    }
    currentUser = clone(user)
    return { access_token: 'mock-token', user: clone(user) }
  },

  async register(username: string, password: string): Promise<AuthResponse> {
    await delay(300)
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      throw new Error('用户名需为 3-32 位字母数字下划线')
    }
    if (password.length < 8) {
      throw new Error('密码至少 8 位')
    }
    if (users.some((u) => u.username === username)) {
      throw new Error('用户名已存在')
    }
    const user: User = { id: users.length + 1, username, role: 'user', status: 'active', bio: '', created_at: new Date().toISOString() }
    users.push(user)
    passwordOf[username] = password
    currentUser = clone(user)
    return { access_token: 'mock-token', user: clone(user) }
  },

  async logout(): Promise<void> {
    await delay(100)
    currentUser = null
  },

  async me(): Promise<User> {
    await delay(100)
    if (!currentUser) throw new Error('未登录')
    return clone(currentUser)
  },

  async getUser(username: string): Promise<User & { demo_count: number }> {
    await delay()
    const u = users.find((x) => x.username === username)
    if (!u) throw new Error('用户不存在')
    return { ...clone(u), demo_count: demos.filter((d) => d.author === username).length }
  },

  async changePassword(old_password: string, new_password: string): Promise<void> {
    await delay(200)
    if (!currentUser) throw new Error('未登录')
    if (passwordOf[currentUser.username] !== old_password) throw new Error('原密码错误')
    passwordOf[currentUser.username] = new_password
  },

  // ---------- 标签 ----------
  async listTags(): Promise<Tag[]> {
    await delay()
    return clone(tags)
  },

  async getTag(key: string, value: string): Promise<Tag> {
    await delay()
    const t = tags.find((x) => x.key === key && x.value === value)
    if (!t) throw new Error('标签不存在')
    const result = clone(t)
    result.children = tags.filter((x) => x.parent_id === t.id).map((x) => clone(x))
    result.parent = t.parent_id ? tags.find((x) => x.id === t.parent_id) ?? null : null
    return result
  },

  async createTag(key: string, value: string, description?: string, parent_id?: number | null): Promise<Tag> {
    await delay(200)
    if (key === 'author') throw new Error('author 为保留 key')
    if (tags.some((t) => t.key === key && t.value === value)) throw new Error('标签已存在')
    const tag: Tag = {
      id: Math.max(...tags.map((t) => t.id)) + 1,
      key,
      value,
      description: description || '',
      parent_id: parent_id ?? null,
      demo_count: 0,
      child_count: 0,
    }
    tags.push(tag)
    return clone(tag)
  },

  // ---------- Demo ----------
  async listDemos(params: DemoListParams = {}): Promise<Paginated<DemoSummary>> {
    await delay()
    const { tags: tagFilters = [], q = '', sort = 'newest', page = 1, page_size = 20, status = 'approved' } = params
    let items = [...demos, ...(status === 'pending' ? pendingDemos : [])].filter((d) => !status || d.status === status)
    if (tagFilters.length) {
      items = items.filter((d) => tagFilters.every((tf) => d.tags.some((t) => tagOf(t) === tf)))
    }
    if (q) {
      const lower = q.toLowerCase()
      items = items.filter(
        (d) =>
          d.title.toLowerCase().includes(lower) ||
          d.description.toLowerCase().includes(lower) ||
          d.tags.some((t) => tagOf(t).toLowerCase().includes(lower)),
      )
    }
    if (sort === 'popular') {
      items = [...items].sort((a, b) => b.view_count - a.view_count)
    } else {
      items = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    const total = items.length
    const start = (page - 1) * page_size
    const pageItems = items.slice(start, start + page_size)
    return { items: pageItems, total, page, page_size }
  },

  async getDemo(slug: string): Promise<DemoDetail> {
    await delay()
    const d = findDemo(slug)
    if (!d) throw new Error('Demo 不存在')
    d.view_count += 1
    return clone(d)
  },

  async createDemo(payload: CreateDemoPayload): Promise<{ slug: string; status: string }> {
    await delay(500)
    if (!currentUser) throw new Error('请先登录')
    if (!payload.file) throw new Error('请上传 zip 文件')
    const slug = 'demo_' + Math.random().toString(16).slice(2, 10)
    const demo: DemoDetail = {
      slug,
      title: payload.title,
      description: payload.description || '',
      cover_url: svgCover('#95e1d3', 'NEW', 'just uploaded'),
      author: currentUser.username,
      author_id: currentUser.id,
      tags: [...(payload.tags || []).map((t) => {
        const [key, ...rest] = t.split(':')
        return { key, value: rest.join(':') }
      }), { key: 'author', value: currentUser.username }],
      view_count: 0,
      download_count: 0,
      comment_count: 0,
      created_at: new Date().toISOString(),
      status: settings.auto_approve ? 'approved' : 'pending',
      session_log_count: 0,
      commit_count: 1,
      is_author: true,
      previewHtml: '<!doctype html><html><body style="margin:0;font-family:monospace;display:grid;place-items:center;height:100vh;background:#4ecdc4"><h1>已上传 Demo</h1></body></html>',
    }
    ;(settings.auto_approve ? demos : pendingDemos).push(demo)
    return { slug: demo.slug, status: demo.status as string }
  },

  async updateDemo(slug: string, payload: UpdateDemoPayload): Promise<void> {
    await delay(400)
    const d = findDemo(slug)
    if (!d) throw new Error('Demo 不存在')
    if (payload.title) d.title = payload.title
    if (payload.description !== undefined) d.description = payload.description
    if (payload.tags) d.tags = payload.tags.map((t) => {
      const [key, ...rest] = t.split(':')
      return { key, value: rest.join(':') }
    })
  },

  async deleteDemo(slug: string): Promise<void> {
    await delay(200)
    const idx = demos.findIndex((d) => d.slug === slug)
    if (idx >= 0) demos.splice(idx, 1)
  },

  async downloadDemo(slug: string): Promise<void> {
    await delay(200)
    const d = findDemo(slug)
    if (d) d.download_count += 1
  },

  // ---------- 评论 ----------
  async listComments(slug: string): Promise<Comment[]> {
    await delay()
    return clone(comments[slug] || [])
  },

  async postComment(slug: string, content: string, parent_id?: number | null): Promise<Comment> {
    await delay(200)
    if (!currentUser) throw new Error('请先登录')
    const list = comments[slug] || (comments[slug] = [])
    const comment: Comment = {
      id: Math.max(0, ...Object.values(comments).flat().map((c) => c.id)) + 1,
      demo_id: findDemo(slug) ? 0 : 0,
      user_id: currentUser.id,
      username: currentUser.username,
      parent_id: parent_id ?? null,
      content,
      created_at: new Date().toISOString(),
      children: [],
    }
    if (parent_id) {
      const parent = findComment(list, parent_id)
      if (!parent) throw new Error('父评论不存在')
      parent.children = parent.children || []
      parent.children.push(comment)
    } else {
      list.push(comment)
    }
    return clone(comment)
  },

  // ---------- Session Logs ----------
  async listSessionLogs(slug: string): Promise<SessionLog[]> {
    await delay()
    return clone(sessionLogs[slug] || [])
  },

  async getSessionLog(slug: string, filename: string): Promise<string> {
    await delay()
    const key = `${slug}/${filename}`
    return sessionTexts[key] || `# ${filename}\n\n（暂无内容）`
  },

  // ---------- Admin ----------
  async adminDemos(): Promise<AdminDemo[]> {
    await delay()
    return clone([...demos, ...pendingDemos].map((d) => ({ ...d, storage_size: 1024 * 20, inconsistency: false })))
  },

  async adminUsers(): Promise<AdminUser[]> {
    await delay()
    return clone(users.map((u) => ({ ...u, demo_count: demos.filter((d) => d.author_id === u.id).length })))
  },

  async adminReview(): Promise<DemoDetail[]> {
    await delay()
    return clone(pendingDemos)
  },

  async adminApprove(idOrSlug: string | number, action: 'approve' | 'reject'): Promise<void> {
    await delay(200)
    const d = pendingDemos.find((x) => x.slug === idOrSlug)
    if (!d) throw new Error('待审 Demo 不存在')
    if (action === 'approve') {
      d.status = 'approved'
      demos.push(d)
      pendingDemos.splice(pendingDemos.indexOf(d), 1)
    } else {
      d.status = 'rejected'
      pendingDemos.splice(pendingDemos.indexOf(d), 1)
    }
  },

  async getSettings(): Promise<Settings> {
    await delay()
    return clone(settings)
  },

  async updateSettings(next: Settings): Promise<Settings> {
    await delay()
    settings = { ...settings, ...next }
    return clone(settings)
  },

  async updateUser(id: number, patch: Partial<Pick<User, 'role' | 'status'>>): Promise<User> {
    await delay(200)
    const u = users.find((x) => x.id === id)
    if (!u) throw new Error('用户不存在')
    Object.assign(u, patch)
    return clone(u)
  },

  // ---------- 公告 ----------
  async listAnnouncements(): Promise<Announcement[]> {
    await delay()
    return clone(announcements)
  },
  async createAnnouncement(payload: { title: string; content?: string; demo_slug?: string | null }): Promise<Announcement> {
    await delay(200)
    const ann: Announcement = {
      id: Math.max(0, ...announcements.map((a) => a.id)) + 1,
      type: 'manual',
      title: payload.title,
      content: payload.content || '',
      demo_slug: payload.demo_slug ?? null,
      created_by: currentUser?.id ?? null,
      created_at: new Date().toISOString(),
    }
    announcements.unshift(ann)
    return clone(ann)
  },
  async updateAnnouncement(id: number, payload: { title: string; content?: string; demo_slug?: string | null }): Promise<Announcement> {
    await delay(200)
    const a = announcements.find((x) => x.id === id)
    if (!a) throw new Error('公告不存在')
    a.title = payload.title
    if (payload.content !== undefined) a.content = payload.content
    if (payload.demo_slug !== undefined) a.demo_slug = payload.demo_slug
    return clone(a)
  },
  async deleteAnnouncement(id: number): Promise<void> {
    await delay(200)
    const idx = announcements.findIndex((a) => a.id === id)
    if (idx >= 0) announcements.splice(idx, 1)
  },
}

function findComment(list: Comment[], id: number): Comment | null {
  for (const c of list) {
    if (c.id === id) return c
    if (c.children) {
      const found = findComment(c.children, id)
      if (found) return found
    }
  }
  return null
}
