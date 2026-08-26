// Mock API —— 前端独立运行时使用的占位数据与逻辑。
// 切换到真实后端：设置环境变量 VITE_USE_MOCK=false，api/index.ts 会改走 axios。

import type {
  AdminDemo,
  AdminStats,
  AdminUser,
  Announcement,
  AnnouncementInput,
  AuthResponse,
  Comment,
  CreateDemoFromUrlPayload,
  CreateDemoPayload,
  DemoDetail,
  DemoListParams,
  ForumTopic,
  ForumReply,
  ForumTopicInput,
  ForumTopicAdminUpdate,
  ForumReport,
  ForumReportInput,
  DemoSummary,
  Paginated,
  SessionLog,
  Settings,
  SiteStats,
  SponsorBoard,
  Tag,
  TagKeyInfo,
  TagSuggestion,
  ThanksBoard,
  UpdateDemoPayload,
  User,
  RecognitionInput,
  RecognitionItem,
  RatingStats,
  LiveStats,
  OssSyncJob,
} from './types'

const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms))

const forumTopics: ForumTopic[] = [
  { id: 1, title: '欢迎来到讨论区', content: '这里是 **AI 全民制作人** 的讨论区，欢迎交流作品与提示词。\n\n试试贴一个作品：[/demo/demo_粒子星空](/demo/demo_粒子星空)', author: 'tester', author_id: 2, demo_slug: null, category: '交流', tags: ['type:game'], pinned: true, sticky: true, status: 'normal', reply_count: 2, view_count: 88, created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z' },
  { id: 2, title: '分享：用灰测模型做的贪吃蛇', content: '最近用 **ds-unknown** 生成了一个贪吃蛇，体验还不错。', author: 'alice', author_id: 3, demo_slug: 'demo_贪吃蛇', category: '分享', tags: ['model:ds-unknown'], pinned: false, sticky: true, status: 'normal', reply_count: 1, view_count: 42, created_at: '2026-08-02T09:00:00Z', updated_at: '2026-08-02T09:00:00Z' },
  { id: 3, title: '求助：iframe 全屏问题', content: '为什么 F 键有时候没反应？', author: 'tester', author_id: 2, demo_slug: null, category: '求助', tags: [], pinned: false, sticky: false, status: 'normal', reply_count: 0, view_count: 12, created_at: '2026-08-03T12:00:00Z', updated_at: '2026-08-03T12:00:00Z' },
]
const forumReplies: ForumReply[] = [
  { id: 1, topic_id: 1, author: 'admin', author_id: 1, content: '欢迎！有问题随时发帖。', created_at: '2026-08-01T10:30:00Z' },
  { id: 2, topic_id: 1, author: 'alice', author_id: 3, content: '希望论坛越来越好。', created_at: '2026-08-01T11:00:00Z' },
  { id: 3, topic_id: 2, author: 'tester', author_id: 2, content: '灰测模型效果确实不错。', created_at: '2026-08-02T10:00:00Z' },
]

const forumReports: ForumReport[] = [
  { id: 1, target_type: 'topic', target_id: 2, reason: '疑似违规内容', status: 'pending', reporter_id: 3, created_at: '2026-08-04T10:00:00Z' },
]

const recognition: RecognitionItem[] = [
  { id: 1, kind: 'sponsor', name: 'Alice', amount: 500, message: '支持 AI 全民制作人！', show_amount: true, sort: 0, active: true },
  { id: 2, kind: 'sponsor', name: 'Bob', amount: 300, message: '作品很棒', show_amount: true, sort: 0, active: true },
  { id: 3, kind: 'thanks', name: '小明', message: '感谢提供了这么好的 demo', show_amount: true, sort: 0, active: true },
]

const announcements: Announcement[] = [
  { id: 1, type: 'manual', title: '站点公告', content: '欢迎来到 AI 全民制作人站，欢迎大家投稿 AI 生成的网页 Demo！', demo_slug: null, created_by: 1, created_at: '2025-01-02T00:00:00Z' },
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
  { id: 3, key: 'model', value: 'dsv4-pro', description: 'DeepSeek V4 Pro —— 强推理', parent_id: 1, demo_count: 0, child_count: 0 },
  { id: 10, key: 'model', value: 'dsv4flash', description: '历史自由值：dsv4-flash 的旧写法', parent_id: null, demo_count: 3, child_count: 0 },
  { id: 18, key: 'model', value: 'ds-unknown', description: '网传灰测版', parent_id: null, demo_count: 3, child_count: 0 },
  { id: 4, key: 'plugin', value: 'routing-suite', description: '路由套件插件', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 11, key: 'plugin', value: 'suite', description: '历史自由值：路由套件的旧写法', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 5, key: 'skills', value: 'J-space', description: 'J-space 技能工作区', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 16, key: 'skills', value: 'j-space', description: '历史自由值：J-space 的旧写法', parent_id: null, demo_count: 1, child_count: 0 },
  { id: 6, key: 'preset', value: 'router-standard', description: '标准路由预设', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 12, key: 'preset', value: 'spec', description: '历史自由值：规格预设', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 7, key: 'type', value: 'effect', description: '视觉特效类', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 8, key: 'type', value: 'widget', description: '小组件类', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 9, key: 'type', value: 'game', description: '小游戏类', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 22, key: 'type', value: 'demo', description: '综合演示类', parent_id: null, demo_count: 8, child_count: 0 },
  { id: 23, key: 'category', value: '图形学', description: '图形学类', parent_id: null, demo_count: 4, child_count: 0 },
  { id: 25, key: 'category', value: '3D建模', description: '3D 建模类', parent_id: null, demo_count: 1, child_count: 0 },
  { id: 26, key: 'category', value: '仿真', description: '仿真类', parent_id: null, demo_count: 3, child_count: 0 },
  { id: 27, key: 'category', value: '动画', description: '动画类', parent_id: null, demo_count: 1, child_count: 0 },
  { id: 13, key: 'author', value: 'tester', description: '系统作者标签', parent_id: null, demo_count: 3, child_count: 0 },
  { id: 14, key: 'author', value: 'alice', description: '系统作者标签', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 12, key: 'author', value: 'admin', description: '系统作者标签', parent_id: null, demo_count: 3, child_count: 0 },
  { id: 19, key: 'author', value: 'DOUBAO', description: '系统作者标签', parent_id: null, demo_count: 3, child_count: 0 },
  { id: 21, key: 'author', value: 'gemini-3.7-flash', description: '系统作者标签', parent_id: null, demo_count: 8, child_count: 0 },
  { id: 15, key: 'author', value: 'sixtyseven', description: '系统作者标签', parent_id: null, demo_count: 6, child_count: 0 },
  { id: 24, key: 'author', value: 'yiheifeikong', description: '系统作者标签', parent_id: null, demo_count: 8, child_count: 0 },
]

const tagKeys: TagKeyInfo[] = [
  { key: 'model', mode: 'fixed', label: '模型', description: 'AI 模型版本（固定值）', sort: 1, values: [
    { value: 'dsv4', description: '模型版本总类', demo_count: 6 },
    { value: 'dsv4-flash', description: 'DeepSeek V4 Flash —— 快速推理', demo_count: 3 },
    { value: 'dsv4-pro', description: 'DeepSeek V4 Pro —— 强推理', demo_count: 0 },
    { value: 'dsv4flash', description: '历史自由值', demo_count: 3 },
    { value: 'ds-unknown', description: '网传灰测版', demo_count: 3 },
  ], demo_count: 6 },
  { key: 'plugin', mode: 'fixed', label: '插件', description: '使用的插件（固定值）', sort: 2, values: [
    { value: 'routing-suite', description: '路由套件插件', demo_count: 2 },
    { value: 'suite', description: '历史自由值', demo_count: 2 },
  ], demo_count: 2 },
  { key: 'type', mode: 'fixed', label: '类型', description: 'Demo 类型（固定值）', sort: 3, values: [
    { value: 'effect', description: '视觉特效类', demo_count: 2 },
    { value: 'widget', description: '小组件类', demo_count: 2 },
    { value: 'game', description: '小游戏类', demo_count: 2 },
    { value: 'demo', description: '综合演示类', demo_count: 8 },
  ], demo_count: 2 },
  { key: 'skills', mode: 'fixed', label: '技能', description: '技能工作区（固定值）', sort: 4, values: [
    { value: 'J-space', description: 'J-space 技能工作区', demo_count: 2 },
    { value: 'j-space', description: '历史自由值', demo_count: 1 },
  ], demo_count: 2 },
  { key: 'preset', mode: 'fixed', label: '预设', description: '预设配置（固定值）', sort: 5, values: [
    { value: 'router-standard', description: '标准路由预设', demo_count: 2 },
    { value: 'spec', description: '历史自由值', demo_count: 2 },
  ], demo_count: 2 },
  { key: 'category', mode: 'fixed', label: '分类', description: '作品分类（固定值）', sort: 6, values: [
    { value: '图形学', description: '图形学类', demo_count: 4 },
    { value: '3D建模', description: '3D 建模类', demo_count: 1 },
    { value: '仿真', description: '仿真类', demo_count: 3 },
    { value: '动画', description: '动画类', demo_count: 1 },
  ], demo_count: 4 },
  { key: 'game', mode: 'open', label: '游戏', description: '游戏名称（自定义值，如 mc / pvz）', sort: 7, values: [
    { value: 'pvz', description: '植物大战僵尸', demo_count: 2 },
    { value: 'mc', description: '我的世界', demo_count: 1 },
  ], demo_count: 2 },
  { key: 'rounds', mode: 'int', label: '轮数', description: '生成轮数（必须为整数）', sort: 8, values: [
    { value: '3', description: '', demo_count: 1 },
  ], demo_count: 1 },
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
    is_author: false,
    previewHtml: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;font-family:monospace;padding:40px}pre{font-size:22px;line-height:1.8;border:6px solid #000;padding:32px;background:#ffe66d;box-shadow:8px 8px 0 #000;white-space:pre-wrap;max-width:720px;min-height:180px}</style></head><body><pre id="out"></pre><script>
const txt='你好，这里是 AI 生成的网页 Demo。\n每一行都由模型逐步写出。\n—— AI 全民制作人';let i=0;const out=document.getElementById('out');setInterval(()=>{if(i<=txt.length){out.textContent=txt.slice(0,i)+'▍';i++}else{i=0}},90);
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
    is_author: false,
    previewHtml: '<!doctype html><html><body style="margin:0;font-family:monospace;display:grid;place-items:center;height:100vh;background:#ffe66d"><h1>待审核</h1></body></html>',
  },
]

let settings: Settings = { auto_approve: true, auto_approve_public: false }

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function findDemo(slug: string): DemoDetail | undefined {
  return [...demos, ...pendingDemos].find((d) => d.slug === slug)
}

function tagOf(t: { key: string; value: string }) {
  return `${t.key}:${t.value}`
}

function toTagRef(t: string | { key: string; value: string; description?: string }) {
  if (typeof t === 'string') {
    const [key, ...rest] = t.split(':')
    return { key, value: rest.join(':') }
  }
  return { key: t.key, value: t.value }
}

function mockRatingKey(slug: string, deviceId: string) {
  return `ds_mock_rating_${slug}_${deviceId}`
}
function readMyScore(slug: string, deviceId: string): number | null {
  try {
    const v = localStorage.getItem(mockRatingKey(slug, deviceId))
    return v ? Number(v) : null
  } catch {
    return null
  }
}
function ratingStore(d: DemoDetail) {
  return {
    avg: d.rating_avg || 4.0,
    count: d.rating_count ?? 12,
    god: d.rating_god || 6,
    ghost: d.rating_ghost || 1,
  }
}
function ratingDistribution(d: DemoDetail) {
  return [
    { score: 1, count: d.rating_ghost || 1 },
    { score: 2, count: 2 },
    { score: 3, count: 3 },
    { score: 4, count: 2 },
    { score: 5, count: d.rating_god || 6 },
  ]
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
  async suggestTagValue(payload: { key: string; value: string; description?: string; group?: string; demo_id?: number | null }): Promise<TagSuggestion> {
    await delay(200)
    const s: TagSuggestion = {
      id: Date.now(),
      key: payload.key,
      value: payload.value,
      description: payload.description || '',
      group: payload.group || null,
      status: 'pending',
      demo_id: payload.demo_id ?? null,
      created_at: new Date().toISOString(),
    }
    return clone(s)
  },
  async listTagSuggestions(_status?: 'pending' | 'approved' | 'rejected'): Promise<TagSuggestion[]> {
    await delay()
    return []
  },
  async reviewTagSuggestion(id: number, action: 'approve' | 'reject', group?: string): Promise<TagSuggestion> {
    await delay(200)
    return { id, key: 'model', value: 'x', description: '', group: group || null, status: action === 'approve' ? 'approved' : 'rejected', demo_id: null, created_at: new Date().toISOString() }
  },
  async fetchModels(): Promise<{ created: number; note: string }> {
    await delay(300)
    return { created: 0, note: 'mock' }
  },
  async aiSuggest(_payload: { demo_id?: number; text?: string }): Promise<{ suggestions: { key: string; value: string; reason: string }[]; note: string }> {
    await delay(300)
    return { suggestions: [], note: 'mock' }
  },

  async listTagKeys(): Promise<TagKeyInfo[]> {
    await delay()
    return clone(tagKeys)
  },
  async createTagKey(payload: { key: string; mode: 'fixed' | 'open' | 'int'; label: string; description?: string; sort?: number }): Promise<TagKeyInfo> {
    await delay(200)
    if (tagKeys.some((k) => k.key === payload.key)) throw new Error('标签键已存在')
    const info: TagKeyInfo = {
      key: payload.key,
      mode: payload.mode,
      label: payload.label,
      description: payload.description || '',
      sort: payload.sort ?? 0,
      values: [],
      demo_count: 0,
    }
    tagKeys.push(info)
    return clone(info)
  },
  async updateTagKey(key: string, payload: { mode: 'fixed' | 'open' | 'int'; label: string; description?: string; sort?: number }): Promise<TagKeyInfo> {
    await delay(200)
    const k = tagKeys.find((x) => x.key === key)
    if (!k) throw new Error('标签键不存在')
    k.mode = payload.mode
    k.label = payload.label
    if (payload.description !== undefined) k.description = payload.description
    if (payload.sort !== undefined) k.sort = payload.sort
    return clone(k)
  },
  async deleteTagKey(key: string): Promise<void> {
    await delay(200)
    const idx = tagKeys.findIndex((x) => x.key === key)
    if (idx < 0) throw new Error('标签键不存在')
    if (key === 'author' || key === 'version-of') throw new Error('保留 key 禁止删除')
    if (tagKeys[idx].demo_count > 0) throw new Error('该键下有标签正被 demo 引用，禁止删除')
    tagKeys.splice(idx, 1)
    const toRemove = tags.filter((t) => t.key === key)
    for (const t of toRemove) {
      const ti = tags.indexOf(t)
      if (ti >= 0) tags.splice(ti, 1)
    }
  },
  async deleteTagValue(key: string, value: string): Promise<void> {
    await delay(200)
    if (key === 'author' || key === 'version-of') throw new Error('保留 key 禁止删除')
    const t = tags.find((x) => x.key === key && x.value === value)
    if (!t) throw new Error('标签值不存在')
    if (t.demo_count > 0) throw new Error('该标签正被 demo 引用，禁止删除')
    const idx = tags.indexOf(t)
    tags.splice(idx, 1)
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
    // 稳定排序：主键 + 次级键（同时间/同热度时按 slug 兜底），保证刷新后顺序可复现
    const bySlug = (a: DemoDetail, b: DemoDetail) => a.slug.localeCompare(b.slug)
    if (sort === 'random') {
      // 随机推荐（首页精选「换一批」，Fisher-Yates 洗牌）
      items = [...items]
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
      }
    } else if (sort === 'prompt') {
      // 提示词模式：填了提示词的 demo 优先，同组按最新
      items = [...items].sort(
        (a, b) =>
          Number(Boolean(b.prompt)) - Number(Boolean(a.prompt)) ||
          b.created_at.localeCompare(a.created_at) ||
          bySlug(a, b),
      )
    } else if (sort === 'popular') {
      items = [...items].sort(
        (a, b) => b.view_count - a.view_count || b.created_at.localeCompare(a.created_at) || bySlug(a, b),
      )
    } else {
      items = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at) || bySlug(a, b))
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
    const out = clone(d)
    out.timeline = [
      {
        id: 1,
        version_label: 'v2',
        message: '优化性能与视觉细节',
        old_slug: `${slug}-v1`,
        created_at: '2025-03-02T15:30:00Z',
      },
      {
        id: 2,
        version_label: 'v1',
        message: '创建',
        old_slug: null,
        created_at: '2025-03-01T09:00:00Z',
      },
    ]
    return out
  },

  async getRelated(slug: string): Promise<DemoSummary[]> {
    await delay(200)
    const cur = findDemo(slug)
    if (!cur) throw new Error('Demo 不存在')
    // 按标签重合粗略推荐（mock 简单实现）
    const curKeys = new Set(cur.tags.filter((t) => t.key !== 'author').map((t) => t.key + ':' + t.value))
    const others = [...demos.filter((d) => d.slug !== slug)]
      .map((d) => {
        let score = d.tags.filter((t) => curKeys.has(t.key + ':' + t.value)).length
        score += d.view_count * 0.001
        score += Math.random() * 0.5
        return { score, d }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => x.d)
    return clone(others)
  },
  async getRating(slug: string, deviceId?: string): Promise<RatingStats> {
    await delay(100)
    const d = findDemo(slug)
    if (!d) throw new Error('Demo 不存在')
    const st = ratingStore(d)
    const my = deviceId ? readMyScore(slug, deviceId) : null
    return { my_score: my, avg: st.avg, count: st.count, god: st.god, ghost: st.ghost, distribution: ratingDistribution(d) }
  },
  async rateDemo(slug: string, score: number, deviceId?: string): Promise<RatingStats> {
    await delay(150)
    const d = findDemo(slug)
    if (!d) throw new Error('Demo 不存在')
    if (deviceId) {
      const prev = readMyScore(slug, deviceId)
      localStorage.setItem(mockRatingKey(slug, deviceId), String(score))
      if (prev) {
        // 改分：人数不变，神/鬼票回退旧值再累计新值
        if (prev === 5) d.rating_god = Math.max(0, (d.rating_god || 0) - 1)
        if (prev === 1) d.rating_ghost = Math.max(0, (d.rating_ghost || 0) - 1)
      } else {
        d.rating_count = (d.rating_count ?? 12) + 1
      }
      d.rating_avg = score // mock 简化：不精确维护历史均值
      if (score === 5) d.rating_god = (d.rating_god || 0) + 1
      if (score === 1) d.rating_ghost = (d.rating_ghost || 0) + 1
    }
    return this.getRating(slug, deviceId)
  },
  async unrateDemo(slug: string, deviceId?: string): Promise<RatingStats> {
    await delay(100)
    const d = findDemo(slug)
    if (!d) throw new Error('Demo 不存在')
    if (deviceId) {
      const prev = readMyScore(slug, deviceId)
      localStorage.removeItem(mockRatingKey(slug, deviceId))
      if (prev) {
        d.rating_count = Math.max(0, (d.rating_count ?? 12) - 1)
        if (prev === 5) d.rating_god = Math.max(0, (d.rating_god || 0) - 1)
        if (prev === 1) d.rating_ghost = Math.max(0, (d.rating_ghost || 0) - 1)
      }
    }
    return this.getRating(slug, deviceId)
  },
  async getLeaderboard(
    sort: 'avg' | 'god' | 'ghost' | 'net' | 'count' | 'heat',
    page = 1,
    pageSize = 20,
    range: 'all' | 'week' | 'month' = 'all',
  ): Promise<Paginated<DemoSummary>> {
    await delay(200)
    const now = Date.now()
    const week = 7 * 86400000
    const month = 30 * 86400000
    let items = [...demos].filter((d) => {
      if (d.status !== 'approved') return false
      if (range === 'all') return true
      return now - new Date(d.created_at).getTime() <= (range === 'week' ? week : month)
    })
    if (sort === 'god') items.sort((a, b) => (b.rating_god || 0) - (a.rating_god || 0))
    else if (sort === 'ghost') items.sort((a, b) => (b.rating_ghost || 0) - (a.rating_ghost || 0))
    else if (sort === 'count') items.sort((a, b) => (b.rating_count || 0) - (a.rating_count || 0))
    else if (sort === 'heat') items.sort((a, b) => (b.view_count + b.download_count) - (a.view_count + a.download_count))
    else if (sort === 'net') items.sort((a, b) => ((b.rating_god || 0) - (b.rating_ghost || 0)) - ((a.rating_god || 0) - (a.rating_ghost || 0)))
    else items.sort((a, b) => (b.rating_avg || 0) - (a.rating_avg || 0))
    const start = (page - 1) * pageSize
    return { items: clone(items.slice(start, start + pageSize)), total: items.length, page, page_size: pageSize }
  },


  async getSiteStats(): Promise<SiteStats> {
    await delay()
    const now = new Date()
    const d = (n: number) => { const x = new Date(now); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10) }
    const last7 = [6, 5, 4, 3, 2, 1, 0].map((n, i) => ({ date: d(n), count: 40 + ((i * 37) % 60) }))
    return {
      today: 168,
      yesterday: 132,
      total: 45678,
      last7,
    }
  },
  async reportVisit(): Promise<void> {
    return
  },
  async reportHeartbeat(): Promise<void> {
    return
  },
  async getLiveStats(): Promise<LiveStats> {
    await delay(100)
    return { online: 12, last1min: 8, last5min: 35, today: 168 }
  },
  async getSponsors(): Promise<SponsorBoard> {
    await delay()
    return {
      total_amount: '¥ 1280',
      updated_at: '2026-08-19',
      sponsors: [
        { name: 'Alice', amount: '¥ 500', message: '支持 AI 全民制作人！' },
        { name: 'Bob', amount: '¥ 300', message: '作品很棒，继续加油' },
        { name: 'Charlie', amount: '¥ 200' },
        { name: 'Dave', amount: '¥ 100' },
      ],
    }
  },
  async getThanks(): Promise<ThanksBoard> {
    await delay()
    const items = recognition.filter((r) => r.kind === 'thanks' && r.active)
    return {
      updated_at: new Date().toISOString().slice(0, 10),
      thanks: items.map((r) => ({ name: r.name, ...(r.message ? { message: r.message } : {}) })),
    }
  },
  async listRecognition(): Promise<{ items: RecognitionItem[] }> {
    await delay()
    return { items: clone(recognition) }
  },
  async createRecognition(payload: RecognitionInput): Promise<{ id: number }> {
    await delay()
    const item: RecognitionItem = {
      id: Date.now(),
      kind: payload.kind,
      name: payload.name,
      amount: payload.kind === 'sponsor' ? payload.amount ?? 0 : null,
      message: payload.message || '',
      show_amount: payload.kind === 'sponsor' ? !!payload.show_amount : true,
      sort: payload.sort || 0,
      active: payload.active ?? true,
    }
    recognition.push(item)
    return { id: item.id }
  },
  async updateRecognition(id: number, payload: RecognitionInput): Promise<{ id: number }> {
    await delay()
    const r = recognition.find((x) => x.id === id)
    if (!r) throw new Error('记录不存在')
    r.kind = payload.kind
    r.name = payload.name
    r.amount = payload.kind === 'sponsor' ? payload.amount ?? 0 : null
    r.message = payload.message || ''
    r.show_amount = payload.kind === 'sponsor' ? !!payload.show_amount : true
    r.sort = payload.sort || 0
    r.active = payload.active ?? true
    return { id }
  },
  async deleteRecognition(id: number): Promise<void> {
    await delay()
    const i = recognition.findIndex((x) => x.id === id)
    if (i >= 0) recognition.splice(i, 1)
  },

  async createDemo(payload: CreateDemoPayload, onProgress?: (percent: number) => void): Promise<{ slug: string; status: string }> {
    await delay(500)
    onProgress?.(50)
    await delay(500)
    onProgress?.(100)
    if (!currentUser) throw new Error('请先登录')
    if (payload.demo_type !== 'link' && !payload.file) throw new Error('请上传 zip 文件')
    const slug = 'demo_' + Math.random().toString(16).slice(2, 10)
    const demo: DemoDetail = {
      slug,
      title: payload.title,
      description: payload.description || '',
      cover_url: svgCover('#95e1d3', 'NEW', 'just uploaded'),
      author: currentUser.username,
      author_id: currentUser.id,
      tags: [...(payload.tags || []).map((t) => toTagRef(t)), { key: 'author', value: currentUser.username }],
      demo_type: payload.demo_type || 'web',
      external_url: payload.external_url || null,
      prompt: payload.prompt || '',
      video_url: payload.video_url || null,
      view_count: 0,
      download_count: 0,
      comment_count: 0,
      created_at: new Date().toISOString(),
      status: settings.auto_approve ? 'approved' : 'pending',
      session_log_count: 0,
        is_author: true,
      previewHtml: payload.demo_type === 'web' ? '<!doctype html><html><body style="margin:0;font-family:monospace;display:grid;place-items:center;height:100vh;background:#4ecdc4"><h1>已上传 Demo</h1></body></html>' : undefined,
    }
    ;(settings.auto_approve ? demos : pendingDemos).push(demo)
    return { slug: demo.slug, status: demo.status as string }
  },

  async getForumTopic(id: number): Promise<ForumTopic | null> {
    await delay(150)
    return forumTopics.find((t) => t.id === id) || null
  },
  async listForumTopics(params: { q?: string; category?: string; tag?: string; demo?: string; sort?: 'newest' | 'popular'; page?: number; page_size?: number } = {}): Promise<Paginated<ForumTopic>> {
    await delay()
    const { q = '', category, tag, demo, sort = 'newest', page = 1, page_size = 20 } = params
    let items = [...forumTopics].filter((t) => t.status === 'normal')
    if (q) items = items.filter((t) => t.title.includes(q) || t.content.includes(q))
    if (category) items = items.filter((t) => t.category === category)
    if (tag) items = items.filter((t) => t.tags.includes(tag))
    if (demo) items = items.filter((t) => t.demo_slug === demo)
    if (sort === 'popular') items.sort((a, b) => b.view_count - a.view_count)
    else items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.sticky) - Number(a.sticky) || b.created_at.localeCompare(a.created_at))
    const start = (page - 1) * page_size
    return { items: clone(items.slice(start, start + page_size)), total: items.length, page, page_size }
  },
  async listForumReplies(topicId: number): Promise<ForumReply[]> {
    await delay()
    return clone(forumReplies.filter((r) => r.topic_id === topicId).sort((a, b) => a.created_at.localeCompare(b.created_at)))
  },
  async createForumTopic(payload: ForumTopicInput): Promise<ForumTopic> {
    await delay(300)
    const t: ForumTopic = {
      id: Math.max(0, ...forumTopics.map((x) => x.id)) + 1,
      title: payload.title,
      content: payload.content || '',
      author: 'tester',
      author_id: 2,
      demo_slug: payload.demo_slug ?? null,
      category: payload.category || 'general',
      tags: payload.tags || [],
      pinned: false,
      sticky: false,
      status: 'normal',
      reply_count: 0,
      view_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    forumTopics.unshift(t)
    return clone(t)
  },
  async createForumReply(topicId: number, content: string): Promise<ForumReply> {
    await delay(200)
    const r: ForumReply = { id: Math.max(0, ...forumReplies.map((x) => x.id)) + 1, topic_id: topicId, author: 'tester', author_id: 2, content, created_at: new Date().toISOString() }
    forumReplies.push(r)
    const t = forumTopics.find((x) => x.id === topicId)
    if (t) t.reply_count += 1
    return clone(r)
  },
  async adminListForumTopics(params: { status?: string; category?: string; pinned?: boolean; page?: number; page_size?: number } = {}): Promise<Paginated<ForumTopic>> {
    await delay()
    let items = [...forumTopics]
    if (params.status) items = items.filter((t) => t.status === params.status)
    if (params.category) items = items.filter((t) => t.category === params.category)
    if (params.pinned !== undefined) items = items.filter((t) => t.pinned === params.pinned)
    return { items: clone(items), total: items.length, page: 1, page_size: items.length || 1 }
  },
  async adminUpdateForumTopic(id: number, patch: ForumTopicAdminUpdate): Promise<ForumTopic> {
    await delay()
    const t = forumTopics.find((x) => x.id === id)
    if (!t) throw new Error('主题不存在')
    Object.assign(t, patch)
    return clone(t)
  },
  async adminDeleteForumTopic(id: number): Promise<void> {
    await delay()
    const i = forumTopics.findIndex((x) => x.id === id)
    if (i >= 0) forumTopics.splice(i, 1)
  },
  async adminDeleteForumReply(id: number): Promise<void> {
    await delay()
    const i = forumReplies.findIndex((x) => x.id === id)
    if (i >= 0) forumReplies.splice(i, 1)
  },
  async adminReviewForumTopic(id: number, action: 'approve' | 'reject'): Promise<ForumTopic> {
    await delay()
    const t = forumTopics.find((x) => x.id === id)
    if (!t) throw new Error('主题不存在')
    t.status = action === 'approve' ? 'normal' : 'hidden'
    return clone(t)
  },
  async adminReviewForumReply(id: number, _action: 'approve' | 'reject'): Promise<ForumReply> {
    await delay()
    const r = forumReplies.find((x) => x.id === id)
    if (!r) throw new Error('回复不存在')
    return clone(r)
  },
  async listForumReports(): Promise<ForumReport[]> {
    await delay()
    return clone(forumReports)
  },
  async handleForumReport(id: number, action: 'handle' | 'ignore'): Promise<ForumReport> {
    await delay()
    const r = forumReports.find((x) => x.id === id)
    if (!r) throw new Error('举报不存在')
    r.status = action === 'handle' ? 'handled' : 'ignored'
    return clone(r)
  },
  async createForumReport(payload: ForumReportInput): Promise<ForumReport> {
    await delay()
    const r: ForumReport = { id: Math.max(0, ...forumReports.map((x) => x.id)) + 1, target_type: payload.target_type, target_id: payload.target_id, reason: payload.reason, status: 'pending', reporter_id: 2, created_at: new Date().toISOString() }
    forumReports.push(r)
    return clone(r)
  },
  async adminBanUser(_id: number): Promise<void> {
    await delay()
  },


  async createDemoFromUrl(_payload: CreateDemoFromUrlPayload): Promise<{ slug: string; status: string; created: boolean }> {
    await delay(400)
    const slug = 'url-' + Math.random().toString(16).slice(2, 10)
    return { slug, status: 'pending', created: true }
  },
  async updateDemo(slug: string, payload: UpdateDemoPayload, onProgress?: (percent: number) => void): Promise<void> {
    await delay(400)
    onProgress?.(100)
    const d = findDemo(slug)
    if (!d) throw new Error('Demo 不存在')
    if (payload.title) d.title = payload.title
    if (payload.description !== undefined) d.description = payload.description
    if (payload.demo_type) d.demo_type = payload.demo_type
    if (payload.external_url !== undefined) d.external_url = payload.external_url || null
    if (payload.prompt !== undefined) d.prompt = payload.prompt
    if (payload.video_url !== undefined) d.video_url = payload.video_url || null
    if (payload.tags) d.tags = payload.tags.map((t) => toTagRef(t))
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

  async ossSync(_force = false): Promise<{ started: boolean; job: OssSyncJob }> {
    await delay(300)
    return {
      started: true,
      job: {
        running: false,
        force: _force,
        total: demos.length,
        done: demos.length,
        ok: demos.length,
        fail: 0,
        covers_ok: 0,
        covers_fail: 0,
        current: '',
        last_error: '',
        started_at: Date.now(),
        finished_at: Date.now(),
      },
    }
  },

  async getOssSyncStatus(): Promise<OssSyncJob> {
    await delay(100)
    return {
      running: false,
      force: false,
      total: demos.length,
      done: demos.length,
      ok: demos.length,
      fail: 0,
      covers_ok: 0,
      covers_fail: 0,
      current: '',
      last_error: '',
      started_at: Date.now(),
      finished_at: Date.now(),
    }
  },

  async getAdminStats(): Promise<AdminStats> {
    await delay()
    const demos = forumTopics.length // 随便用现成数据表示
    return {
      demos: { total: demos, approved: 10, pending: 2, rejected: 1 },
      users: users.length,
      storage: { oss_enabled: false, mode: 'local', local_demos: demos, local_files: 0, local_size_bytes: 0 },
    }
  },
  async storageStatus(): Promise<{ oss_enabled: boolean; mode: string; local_demos: number; local_files: number; local_size_bytes: number }> {
    await delay(200)
    return { oss_enabled: false, mode: 'local', local_demos: demos.length, local_files: 0, local_size_bytes: 0 }
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
  async adminListAnnouncements(params: { status?: string; category?: string; pinned?: boolean } = {}): Promise<Announcement[]> {
    await delay()
    let items = [...announcements]
    if (params.status) items = items.filter((a) => (a.status || 'published') === params.status)
    if (params.category) items = items.filter((a) => (a.category || 'general') === params.category)
    if (params.pinned !== undefined) items = items.filter((a) => !!a.pinned === params.pinned)
    return clone(items)
  },
  async createAnnouncement(payload: AnnouncementInput): Promise<Announcement> {
    await delay(200)
    const ann: Announcement = {
      id: Math.max(0, ...announcements.map((a) => a.id)) + 1,
      type: 'manual',
      title: payload.title,
      content: payload.content || '',
      demo_slug: payload.demo_slug ?? null,
      pinned: payload.pinned ?? false,
      status: payload.status ?? 'published',
      category: payload.category ?? 'general',
      published_at: payload.published_at ?? null,
      expires_at: payload.expires_at ?? null,
      created_by: currentUser?.id ?? null,
      created_at: new Date().toISOString(),
    }
    announcements.unshift(ann)
    return clone(ann)
  },
  async updateAnnouncement(id: number, payload: AnnouncementInput): Promise<Announcement> {
    await delay(200)
    const a = announcements.find((x) => x.id === id)
    if (!a) throw new Error('公告不存在')
    a.title = payload.title
    if (payload.content !== undefined) a.content = payload.content
    if (payload.demo_slug !== undefined) a.demo_slug = payload.demo_slug
    if (payload.pinned !== undefined) a.pinned = payload.pinned
    if (payload.status !== undefined) a.status = payload.status
    if (payload.category !== undefined) a.category = payload.category
    if (payload.published_at !== undefined) a.published_at = payload.published_at
    if (payload.expires_at !== undefined) a.expires_at = payload.expires_at
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
