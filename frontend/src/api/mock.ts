// Mock API 鈥斺€?鍓嶇鐙珛杩愯鏃朵娇鐢ㄧ殑鍗犱綅鏁版嵁涓庨€昏緫銆?
// 鍒囨崲鍒扮湡瀹炲悗绔細璁剧疆鐜鍙橀噺 VITE_USE_MOCK=false锛宎pi/index.ts 浼氭敼璧?axios銆?

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
} from './types'

const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms))

const recognition: RecognitionItem[] = [
  { id: 1, kind: 'sponsor', name: 'Alice', amount: 500, message: '鏀寔 AI 鍏ㄦ皯鍒朵綔浜猴紒', show_amount: true, sort: 0, active: true },
  { id: 2, kind: 'sponsor', name: 'Bob', amount: 300, message: '浣滃搧寰堟', show_amount: true, sort: 0, active: true },
  { id: 3, kind: 'thanks', name: '灏忔槑', message: '鎰熻阿鎻愪緵浜嗚繖涔堝ソ鐨?demo', show_amount: true, sort: 0, active: true },
]

const announcements: Announcement[] = [
  { id: 1, type: 'manual', title: '绔欑偣鍏憡', content: '娆㈣繋鏉ュ埌 AI 鍏ㄦ皯鍒朵綔浜虹珯锛屾杩庡ぇ瀹舵姇绋?AI 鐢熸垚鐨勭綉椤?Demo锛?, demo_slug: null, created_by: 1, created_at: '2025-01-02T00:00:00Z' },
  { id: 2, type: 'auto', title: '鏂?Demo 鍙戝竷', content: '妞嶇墿澶ф垬鍍靛案锛堟瀬绠€鐗堬級', demo_slug: 'pvz-demo', created_by: 2, created_at: '2025-03-01T10:00:00Z' },
  { id: 3, type: 'demo_update', title: 'Demo 鏇存柊锛氭鐗╁ぇ鎴樺兊灏?, content: '淇绗簩鍏抽煶鏁堜笉鍚屾鐨勯棶棰?, demo_slug: 'pvz-demo', created_by: 2, created_at: '2025-03-02T15:30:00Z' },
  { id: 4, type: 'update', title: '绔欑偣鏇存柊', content: 'feat: 鏁寸珯鍏憡绯荤粺涓婄嚎', demo_slug: null, created_by: null, created_at: '2025-03-03T09:00:00Z' },
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
  { id: 1, username: 'admin', role: 'admin', status: 'active', bio: '绔欑偣绠＄悊鍛?, created_at: '2025-01-01T00:00:00Z' },
  { id: 2, username: 'tester', role: 'user', status: 'active', bio: 'AI Demo 鐖卞ソ鑰?, created_at: '2025-02-11T08:00:00Z' },
  { id: 3, username: 'alice', role: 'user', status: 'active', bio: '鏀堕泦鍚勭缃戦〉灏忕帺鍏?, created_at: '2025-03-02T10:30:00Z' },
]

const passwordOf: Record<string, string> = {
  admin: 'admin123',
  tester: 'password',
  alice: 'password',
}

let currentUser: User | null = null

const tags: Tag[] = [
  { id: 1, key: 'model', value: 'dsv4', description: '妯″瀷鐗堟湰鎬荤被', parent_id: null, demo_count: 6, child_count: 2 },
  { id: 2, key: 'model', value: 'dsv4-flash', description: 'DeepSeek V4 Flash 鈥斺€?蹇€熸帹鐞?, parent_id: 1, demo_count: 3, child_count: 0 },
  { id: 3, key: 'model', value: 'dsv4-pro', description: 'DeepSeek V4 Pro 鈥斺€?寮烘帹鐞?, parent_id: 1, demo_count: 0, child_count: 0 },
  { id: 10, key: 'model', value: 'dsv4flash', description: '鍘嗗彶鑷敱鍊硷細dsv4-flash 鐨勬棫鍐欐硶', parent_id: null, demo_count: 3, child_count: 0 },
  { id: 18, key: 'model', value: 'ds-unknown', description: '缃戜紶鐏版祴鐗?, parent_id: null, demo_count: 3, child_count: 0 },
  { id: 4, key: 'plugin', value: 'routing-suite', description: '璺敱濂椾欢鎻掍欢', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 11, key: 'plugin', value: 'suite', description: '鍘嗗彶鑷敱鍊硷細璺敱濂椾欢鐨勬棫鍐欐硶', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 5, key: 'skills', value: 'J-space', description: 'J-space 鎶€鑳藉伐浣滃尯', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 16, key: 'skills', value: 'j-space', description: '鍘嗗彶鑷敱鍊硷細J-space 鐨勬棫鍐欐硶', parent_id: null, demo_count: 1, child_count: 0 },
  { id: 6, key: 'preset', value: 'router-standard', description: '鏍囧噯璺敱棰勮', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 12, key: 'preset', value: 'spec', description: '鍘嗗彶鑷敱鍊硷細瑙勬牸棰勮', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 7, key: 'type', value: 'effect', description: '瑙嗚鐗规晥绫?, parent_id: null, demo_count: 2, child_count: 0 },
  { id: 8, key: 'type', value: 'widget', description: '灏忕粍浠剁被', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 9, key: 'type', value: 'game', description: '灏忔父鎴忕被', parent_id: null, demo_count: 2, child_count: 0 },
  { id: 22, key: 'type', value: 'demo', description: '缁煎悎婕旂ず绫?, parent_id: null, demo_count: 8, child_count: 0 },
  { id: 23, key: 'category', value: '鍥惧舰瀛?, description: '鍥惧舰瀛︾被', parent_id: null, demo_count: 4, child_count: 0 },
  { id: 25, key: 'category', value: '3D寤烘ā', description: '3D 寤烘ā绫?, parent_id: null, demo_count: 1, child_count: 0 },
  { id: 26, key: 'category', value: '浠跨湡', description: '浠跨湡绫?, parent_id: null, demo_count: 3, child_count: 0 },
  { id: 27, key: 'category', value: '鍔ㄧ敾', description: '鍔ㄧ敾绫?, parent_id: null, demo_count: 1, child_count: 0 },
  { id: 13, key: 'author', value: 'tester', description: '绯荤粺浣滆€呮爣绛?, parent_id: null, demo_count: 3, child_count: 0 },
  { id: 14, key: 'author', value: 'alice', description: '绯荤粺浣滆€呮爣绛?, parent_id: null, demo_count: 2, child_count: 0 },
  { id: 12, key: 'author', value: 'admin', description: '绯荤粺浣滆€呮爣绛?, parent_id: null, demo_count: 3, child_count: 0 },
  { id: 19, key: 'author', value: 'DOUBAO', description: '绯荤粺浣滆€呮爣绛?, parent_id: null, demo_count: 3, child_count: 0 },
  { id: 21, key: 'author', value: 'gemini-3.7-flash', description: '绯荤粺浣滆€呮爣绛?, parent_id: null, demo_count: 8, child_count: 0 },
  { id: 15, key: 'author', value: 'sixtyseven', description: '绯荤粺浣滆€呮爣绛?, parent_id: null, demo_count: 6, child_count: 0 },
  { id: 24, key: 'author', value: 'yiheifeikong', description: '绯荤粺浣滆€呮爣绛?, parent_id: null, demo_count: 8, child_count: 0 },
]

const tagKeys: TagKeyInfo[] = [
  { key: 'model', mode: 'fixed', label: '妯″瀷', description: 'AI 妯″瀷鐗堟湰锛堝浐瀹氬€硷級', sort: 1, values: [
    { value: 'dsv4', description: '妯″瀷鐗堟湰鎬荤被', demo_count: 6 },
    { value: 'dsv4-flash', description: 'DeepSeek V4 Flash 鈥斺€?蹇€熸帹鐞?, demo_count: 3 },
    { value: 'dsv4-pro', description: 'DeepSeek V4 Pro 鈥斺€?寮烘帹鐞?, demo_count: 0 },
    { value: 'dsv4flash', description: '鍘嗗彶鑷敱鍊?, demo_count: 3 },
    { value: 'ds-unknown', description: '缃戜紶鐏版祴鐗?, demo_count: 3 },
  ], demo_count: 6 },
  { key: 'plugin', mode: 'fixed', label: '鎻掍欢', description: '浣跨敤鐨勬彃浠讹紙鍥哄畾鍊硷級', sort: 2, values: [
    { value: 'routing-suite', description: '璺敱濂椾欢鎻掍欢', demo_count: 2 },
    { value: 'suite', description: '鍘嗗彶鑷敱鍊?, demo_count: 2 },
  ], demo_count: 2 },
  { key: 'type', mode: 'fixed', label: '绫诲瀷', description: 'Demo 绫诲瀷锛堝浐瀹氬€硷級', sort: 3, values: [
    { value: 'effect', description: '瑙嗚鐗规晥绫?, demo_count: 2 },
    { value: 'widget', description: '灏忕粍浠剁被', demo_count: 2 },
    { value: 'game', description: '灏忔父鎴忕被', demo_count: 2 },
    { value: 'demo', description: '缁煎悎婕旂ず绫?, demo_count: 8 },
  ], demo_count: 2 },
  { key: 'skills', mode: 'fixed', label: '鎶€鑳?, description: '鎶€鑳藉伐浣滃尯锛堝浐瀹氬€硷級', sort: 4, values: [
    { value: 'J-space', description: 'J-space 鎶€鑳藉伐浣滃尯', demo_count: 2 },
    { value: 'j-space', description: '鍘嗗彶鑷敱鍊?, demo_count: 1 },
  ], demo_count: 2 },
  { key: 'preset', mode: 'fixed', label: '棰勮', description: '棰勮閰嶇疆锛堝浐瀹氬€硷級', sort: 5, values: [
    { value: 'router-standard', description: '鏍囧噯璺敱棰勮', demo_count: 2 },
    { value: 'spec', description: '鍘嗗彶鑷敱鍊?, demo_count: 2 },
  ], demo_count: 2 },
  { key: 'category', mode: 'fixed', label: '鍒嗙被', description: '浣滃搧鍒嗙被锛堝浐瀹氬€硷級', sort: 6, values: [
    { value: '鍥惧舰瀛?, description: '鍥惧舰瀛︾被', demo_count: 4 },
    { value: '3D寤烘ā', description: '3D 寤烘ā绫?, demo_count: 1 },
    { value: '浠跨湡', description: '浠跨湡绫?, demo_count: 3 },
    { value: '鍔ㄧ敾', description: '鍔ㄧ敾绫?, demo_count: 1 },
  ], demo_count: 4 },
  { key: 'game', mode: 'open', label: '娓告垙', description: '娓告垙鍚嶇О锛堣嚜瀹氫箟鍊硷紝濡?mc / pvz锛?, sort: 7, values: [
    { value: 'pvz', description: '妞嶇墿澶ф垬鍍靛案', demo_count: 2 },
    { value: 'mc', description: '鎴戠殑涓栫晫', demo_count: 1 },
  ], demo_count: 2 },
  { key: 'rounds', mode: 'int', label: '杞暟', description: '鐢熸垚杞暟锛堝繀椤讳负鏁存暟锛?, sort: 8, values: [
    { value: '3', description: '', demo_count: 1 },
  ], demo_count: 1 },
]

const demos: DemoDetail[] = [
  {
    slug: 'demo_绮掑瓙鏄熺┖',
    title: '绮掑瓙鏄熺┖',
    description: 'Canvas 绮掑瓙鏄熺┖锛岄紶鏍囩Щ鍔ㄤ骇鐢熷紩鍔涙壈鍔紝閫傚悎浣滀负鑳屾櫙鐗规晥銆?,
    cover_url: svgCover('#4ecdc4', '鉁?, 'particle starfield'),
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
    slug: 'demo_闇撹櫣鏃堕挓',
    title: '闇撹櫣鏃堕挓',
    description: '闇撹櫣鏁板瓧鏃堕挓锛屼竷娈垫暟鐮佺椋庢牸锛屾繁鑹插簳涓婂彂鍏夈€?,
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
    slug: 'demo_璐悆铔?,
    title: '璐悆铔?,
    description: '缁忓吀璐悆铔囷紝閿洏鏂瑰悜閿帶鍒讹紝鏀寔璁″垎涓庨噸鏂板紑濮嬨€?,
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
    slug: 'demo_鎵撳瓧鏈烘晥鏋?,
    title: '鎵撳瓧鏈烘帓鐗?,
    description: '鎵撳瓧鏈洪€愬瓧杈撳嚭鎺掔増锛岄€傚悎 Story 鍨嬮〉闈€?,
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
const txt='浣犲ソ锛岃繖閲屾槸 AI 鐢熸垚鐨勭綉椤?Demo銆俓n姣忎竴琛岄兘鐢辨ā鍨嬮€愭鍐欏嚭銆俓n鈥斺€?AI 鍏ㄦ皯鍒朵綔浜?;let i=0;const out=document.getElementById('out');setInterval(()=>{if(i<=txt.length){out.textContent=txt.slice(0,i)+'鈻?;i++}else{i=0}},90);
</script></body></html>`,
  },
  {
    slug: 'demo_闊抽鍙鍖?,
    title: '闊抽鍙鍖?,
    description: 'Canvas 棰戣氨鏉″姩鐢伙紝妯℃嫙闊抽鍙鍖栫殑瑙嗚鏁堟灉銆?,
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
    slug: 'demo_璁板繂缈荤墝',
    title: '璁板繂缈荤墝娓告垙',
    description: '璁板繂缈荤墝閰嶅灏忔父鎴忥紝鐐瑰嚮缈荤墝锛岄厤瀵规秷闄ゃ€?,
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
  demo_绮掑瓙鏄熺┖: [
    { id: 1, demo_id: 1, user_id: 2, username: 'tester', parent_id: null, content: '鑳屾櫙鐗规晥寰堟紓浜紝閫傚悎鍋氶椤靛簳绾广€?, created_at: '2025-03-01T10:00:00Z', children: [
      { id: 2, demo_id: 1, user_id: 3, username: 'alice', parent_id: 1, content: '鏄殑锛岄紶鏍囨壈鍔ㄦ晥鏋滃緢缁嗚吇銆?, created_at: '2025-03-01T11:00:00Z' },
    ] },
    { id: 3, demo_id: 1, user_id: 3, username: 'alice', parent_id: null, content: '鎯崇湅鐢熸垚浼氳瘽鏃ュ織锛屽涔犱竴涓嬪疄鐜版€濊矾銆?, created_at: '2025-03-02T09:00:00Z' },
  ],
  demo_闇撹櫣鏃堕挓: [
    { id: 4, demo_id: 2, user_id: 2, username: 'tester', parent_id: null, content: '闇撹櫣鎰熷緢寮猴紝瀛椾綋濡傛灉鍐嶇矖涓€鐐规洿甯︽劅銆?, created_at: '2025-03-02T13:00:00Z' },
  ],
  demo_璐悆铔? [
    { id: 5, demo_id: 3, user_id: 2, username: 'tester', parent_id: null, content: '鎵嬫劅涓嶉敊锛屽氨鏄€熷害鏈夌偣蹇€?, created_at: '2025-03-03T16:00:00Z', children: [
      { id: 6, demo_id: 3, user_id: 3, username: 'alice', parent_id: 5, content: '鎸?R 鍙互閲嶅紑锛岄€熷害鏄晠鎰忕殑 :)', created_at: '2025-03-03T17:00:00Z' },
    ] },
    { id: 7, demo_id: 3, user_id: 1, username: 'admin', parent_id: null, content: '宸叉敹褰曞埌棣栭〉鎺ㄨ崘銆?, created_at: '2025-03-04T08:00:00Z' },
  ],
  demo_鎵撳瓧鏈烘晥鏋? [
    { id: 8, demo_id: 4, user_id: 1, username: 'admin', parent_id: null, content: '鎺掔増寰堝共鍑€銆?, created_at: '2025-03-04T19:00:00Z' },
  ],
  demo_闊抽鍙鍖? [
    { id: 9, demo_id: 5, user_id: 2, username: 'tester', parent_id: null, content: '棰滆壊鍧楀緢娲绘臣銆?, created_at: '2025-03-05T09:00:00Z' },
  ],
  demo_璁板繂缈荤墝: [
    { id: 10, demo_id: 6, user_id: 3, username: 'alice', parent_id: null, content: '閰嶅閫昏緫娌￠棶棰橈紝甯屾湜鍔犺鏃躲€?, created_at: '2025-03-06T12:00:00Z', children: [
      { id: 11, demo_id: 6, user_id: 1, username: 'admin', parent_id: 10, content: '宸茶鍏?TODO銆?, created_at: '2025-03-06T13:00:00Z' },
    ] },
  ],
}

const sessionLogs: Record<string, SessionLog[]> = {
  demo_绮掑瓙鏄熺┖: [{ id: 1, filename: '鐢熸垚浼氳瘽.md', file_size: 1840, created_at: '2025-03-01T09:00:00Z' }],
  demo_闇撹櫣鏃堕挓: [{ id: 2, filename: '鐢熸垚浼氳瘽.md', file_size: 1210, created_at: '2025-03-02T12:00:00Z' }],
  demo_璐悆铔? [{ id: 3, filename: '鐢熸垚浼氳瘽.md', file_size: 2360, created_at: '2025-03-03T15:30:00Z' }],
  demo_鎵撳瓧鏈烘晥鏋? [{ id: 4, filename: '鐢熸垚浼氳瘽.md', file_size: 980, created_at: '2025-03-04T18:00:00Z' }],
  demo_闊抽鍙鍖? [{ id: 5, filename: '鐢熸垚浼氳瘽.md', file_size: 1530, created_at: '2025-03-05T08:20:00Z' }],
  demo_璁板繂缈荤墝: [{ id: 6, filename: '鐢熸垚浼氳瘽.md', file_size: 2070, created_at: '2025-03-06T11:00:00Z' }],
}

const sessionTexts: Record<string, string> = {
  'demo_绮掑瓙鏄熸槦/鐢熸垚浼氳瘽.md': `# 鐢熸垚浼氳瘽锛氱矑瀛愭槦绌?

## 妯″瀷
- model:dsv4-flash
- plugin:routing-suite

## Prompt 鎽樿
鈥滃仛涓€涓?canvas 绮掑瓙鏄熺┖鑳屾櫙锛岄紶鏍囩Щ鍔ㄤ骇鐢熷紩鍔涙壈鍔ㄣ€傗€?

## 鐢熸垚姝ラ
1. 鍒濆鍖?canvas 涓庣矑瀛愭暟缁?
2. 瀹炵幇绮掑瓙杩愬姩涓庤竟鐣屽弽寮?
3. 鍔犲叆榧犳爣鎵板姩
4. 娣诲姞鑳屾櫙娣″嚭鎷栧熬鏁堟灉
5. 閫傞厤绐楀彛 resize

## 杩唬璁板綍
- commit 1: 楠ㄦ灦涓庣矑瀛愯繍鍔?
- commit 2: 榧犳爣鎵板姩
- commit 3: 鎷栧熬涓庤瑙夋墦纾╜,
  'demo_闇撹櫣鏃堕挓/鐢熸垚浼氳瘽.md': `# 鐢熸垚浼氳瘽锛氶湏铏规椂閽?

## 妯″瀷
- model:dsv4-pro
- preset:router-standard

## Prompt 鎽樿
鈥滃仛涓€涓湏铏规暟瀛楁椂閽燂紝涓冩鏁扮爜绠″彂鍏夐鏍笺€傗€?

## 鐢熸垚姝ラ
1. 甯冨眬涓庡瓧浣?
2. 鏃堕棿閫昏緫
3. 闇撹櫣鍏夋檿鏍峰紡

## 杩唬璁板綍
- commit 1: 鍩虹鏃堕挓
- commit 2: 闇撹櫣鏍峰紡
- commit 3: 鍝嶅簲寮忓瓧鍙穈,
  'demo_璐悆铔?鐢熸垚浼氳瘽.md': `# 鐢熸垚浼氳瘽锛氳椽鍚冭泧

## 妯″瀷
- model:dsv4-flash
- plugin:routing-suite

## Prompt 鎽樿
鈥滅粡鍏歌椽鍚冭泧锛屾柟鍚戦敭鎺у埗锛岃鍒嗕笌閲嶅紑銆傗€?

## 鐢熸垚姝ラ
1. 铔囦笌椋熺墿鏁版嵁缁撴瀯
2. 绉诲姩涓庣鎾?
3. 璁″垎涓庨噸寮€
4. 瑙嗚涓庢墜鎰熸墦纾?

## 杩唬璁板綍
- commit 1: 铔囪韩绉诲姩
- commit 2: 椋熺墿涓庤鍒?
- commit 3: 纰版挒妫€娴?
- commit 4: 瑙嗚鎵撶（`,
  'demo_鎵撳瓧鏈烘晥鏋?鐢熸垚浼氳瘽.md': `# 鐢熸垚浼氳瘽锛氭墦瀛楁満鎺掔増

## 妯″瀷
- model:dsv4-pro
- skills:J-space

## Prompt 鎽樿
鈥滄墦瀛楁満閫愬瓧杈撳嚭鏁堟灉锛岄€傚悎 Story 椤甸潰銆傗€?

## 鐢熸垚姝ラ
1. 鏂囨湰涓庡厜鏍?
2. 瀹氭椂杈撳嚭
3. 寰幆鎾斁

## 杩唬璁板綍
- commit 1: 鎵撳瓧鏈洪€昏緫
- commit 2: 瑙嗚涓庡惊鐜痐,
  'demo_闊抽鍙鍖?鐢熸垚浼氳瘽.md': `# 鐢熸垚浼氳瘽锛氶煶棰戝彲瑙嗗寲

## 妯″瀷
- model:dsv4-flash
- preset:router-standard

## Prompt 鎽樿
鈥渃anvas 棰戣氨鏉″姩鐢伙紝妯℃嫙闊抽鍙鍖栥€傗€?

## 鐢熸垚姝ラ
1. 棰戣氨鏉″竷灞€
2. 鍔ㄧ敾闅忔満娉㈠姩
3. 閰嶈壊涓庢弿杈?

## 杩唬璁板綍
- commit 1: 棰戣氨鏉＄粯鍒?
- commit 2: 娉㈠姩鍔ㄧ敾
- commit 3: 閰嶈壊鎵撶（`,
  'demo_璁板繂缈荤墝/鐢熸垚浼氳瘽.md': `# 鐢熸垚浼氳瘽锛氳蹇嗙炕鐗?

## 妯″瀷
- model:dsv4-pro
- plugin:routing-suite

## Prompt 鎽樿
鈥滆蹇嗙炕鐗岄厤瀵规父鎴忥紝鐐瑰嚮缈荤墝锛岄厤瀵规秷闄ゃ€傗€?

## 鐢熸垚姝ラ
1. 鍗＄墖甯冨眬
2. 缈荤墝閫昏緫
3. 閰嶅鍒ゅ畾
4. 瀹屾垚鐘舵€佷笌瑙嗚

## 杩唬璁板綍
- commit 1: 鍗＄墖鐢熸垚
- commit 2: 缈荤墝涓庨厤瀵?
- commit 3: 寤惰繜鍥炵炕
- commit 4: 瀹屾垚鎬佽瑙塦,
}


const pendingDemos: DemoDetail[] = [
  {
    slug: 'demo_寰呭绀轰緥',
    title: '寰呭绀轰緥',
    description: '杩欐槸涓€涓瓑寰呯鐞嗗憳瀹℃牳鐨勭ず渚?Demo銆?,
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
    previewHtml: '<!doctype html><html><body style="margin:0;font-family:monospace;display:grid;place-items:center;height:100vh;background:#ffe66d"><h1>寰呭鏍?/h1></body></html>',
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
  // ---------- 璁よ瘉 ----------
  async login(username: string, password: string): Promise<AuthResponse> {
    await delay(300)
    const user = users.find((u) => u.username === username)
    if (!user || passwordOf[username] !== password) {
      throw new Error('鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒')
    }
    if (user.status !== 'active') {
      throw new Error('璐﹀彿涓嶅彲鐢?)
    }
    currentUser = clone(user)
    return { access_token: 'mock-token', user: clone(user) }
  },

  async register(username: string, password: string): Promise<AuthResponse> {
    await delay(300)
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      throw new Error('鐢ㄦ埛鍚嶉渶涓?3-32 浣嶅瓧姣嶆暟瀛椾笅鍒掔嚎')
    }
    if (password.length < 8) {
      throw new Error('瀵嗙爜鑷冲皯 8 浣?)
    }
    if (users.some((u) => u.username === username)) {
      throw new Error('鐢ㄦ埛鍚嶅凡瀛樺湪')
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
    if (!currentUser) throw new Error('鏈櫥褰?)
    return clone(currentUser)
  },

  async getUser(username: string): Promise<User & { demo_count: number }> {
    await delay()
    const u = users.find((x) => x.username === username)
    if (!u) throw new Error('鐢ㄦ埛涓嶅瓨鍦?)
    return { ...clone(u), demo_count: demos.filter((d) => d.author === username).length }
  },

  async changePassword(old_password: string, new_password: string): Promise<void> {
    await delay(200)
    if (!currentUser) throw new Error('鏈櫥褰?)
    if (passwordOf[currentUser.username] !== old_password) throw new Error('鍘熷瘑鐮侀敊璇?)
    passwordOf[currentUser.username] = new_password
  },

  // ---------- 鏍囩 ----------
  async getTag(key: string, value: string): Promise<Tag> {
    await delay()
    const t = tags.find((x) => x.key === key && x.value === value)
    if (!t) throw new Error('鏍囩涓嶅瓨鍦?)
    const result = clone(t)
    result.children = tags.filter((x) => x.parent_id === t.id).map((x) => clone(x))
    result.parent = t.parent_id ? tags.find((x) => x.id === t.parent_id) ?? null : null
    return result
  },

  async createTag(key: string, value: string, description?: string, parent_id?: number | null): Promise<Tag> {
    await delay(200)
    if (key === 'author') throw new Error('author 涓轰繚鐣?key')
    if (tags.some((t) => t.key === key && t.value === value)) throw new Error('鏍囩宸插瓨鍦?)
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
    if (tagKeys.some((k) => k.key === payload.key)) throw new Error('鏍囩閿凡瀛樺湪')
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
    if (!k) throw new Error('鏍囩閿笉瀛樺湪')
    k.mode = payload.mode
    k.label = payload.label
    if (payload.description !== undefined) k.description = payload.description
    if (payload.sort !== undefined) k.sort = payload.sort
    return clone(k)
  },
  async deleteTagKey(key: string): Promise<void> {
    await delay(200)
    const idx = tagKeys.findIndex((x) => x.key === key)
    if (idx < 0) throw new Error('鏍囩閿笉瀛樺湪')
    if (key === 'author' || key === 'version-of') throw new Error('淇濈暀 key 绂佹鍒犻櫎')
    if (tagKeys[idx].demo_count > 0) throw new Error('璇ラ敭涓嬫湁鏍囩姝ｈ demo 寮曠敤锛岀姝㈠垹闄?)
    tagKeys.splice(idx, 1)
    const toRemove = tags.filter((t) => t.key === key)
    for (const t of toRemove) {
      const ti = tags.indexOf(t)
      if (ti >= 0) tags.splice(ti, 1)
    }
  },
  async deleteTagValue(key: string, value: string): Promise<void> {
    await delay(200)
    if (key === 'author' || key === 'version-of') throw new Error('淇濈暀 key 绂佹鍒犻櫎')
    const t = tags.find((x) => x.key === key && x.value === value)
    if (!t) throw new Error('鏍囩鍊间笉瀛樺湪')
    if (t.demo_count > 0) throw new Error('璇ユ爣绛炬琚?demo 寮曠敤锛岀姝㈠垹闄?)
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
    // 绋冲畾鎺掑簭锛氫富閿?+ 娆＄骇閿紙鍚屾椂闂?鍚岀儹搴︽椂鎸?slug 鍏滃簳锛夛紝淇濊瘉鍒锋柊鍚庨『搴忓彲澶嶇幇
    const bySlug = (a: DemoDetail, b: DemoDetail) => a.slug.localeCompare(b.slug)
    if (sort === 'random') {
      // 闅忔満鎺ㄨ崘锛堥椤电簿閫夈€屾崲涓€鎵广€嶏紝Fisher-Yates 娲楃墝锛?
      items = [...items]
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
      }
    } else if (sort === 'prompt') {
      // 鎻愮ず璇嶆ā寮忥細濉簡鎻愮ず璇嶇殑 demo 浼樺厛锛屽悓缁勬寜鏈€鏂?
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
    if (!d) throw new Error('Demo 涓嶅瓨鍦?)
    d.view_count += 1
    const out = clone(d)
    out.timeline = [
      {
        id: 1,
        version_label: 'v2',
        message: '浼樺寲鎬ц兘涓庤瑙夌粏鑺?,
        old_slug: `${slug}-v1`,
        created_at: '2025-03-02T15:30:00Z',
      },
      {
        id: 2,
        version_label: 'v1',
        message: '鍒涘缓',
        old_slug: null,
        created_at: '2025-03-01T09:00:00Z',
      },
    ]
    return out
  },

  async getRelated(slug: string): Promise<DemoSummary[]> {
    await delay(200)
    const cur = findDemo(slug)
    if (!cur) throw new Error('Demo 涓嶅瓨鍦?)
    // 鎸夋爣绛鹃噸鍚堢矖鐣ユ帹鑽愶紙mock 绠€鍗曞疄鐜帮級
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
    if (!d) throw new Error('Demo 涓嶅瓨鍦?)
    const st = ratingStore(d)
    const my = deviceId ? readMyScore(slug, deviceId) : null
    return { my_score: my, avg: st.avg, count: st.count, god: st.god, ghost: st.ghost, distribution: ratingDistribution(d) }
  },
  async rateDemo(slug: string, score: number, deviceId?: string): Promise<RatingStats> {
    await delay(150)
    const d = findDemo(slug)
    if (!d) throw new Error('Demo 涓嶅瓨鍦?)
    if (deviceId) {
      const prev = readMyScore(slug, deviceId)
      localStorage.setItem(mockRatingKey(slug, deviceId), String(score))
      if (prev) {
        // 鏀瑰垎锛氫汉鏁颁笉鍙橈紝绁?楝肩エ鍥為€€鏃у€煎啀绱鏂板€?
        if (prev === 5) d.rating_god = Math.max(0, (d.rating_god || 0) - 1)
        if (prev === 1) d.rating_ghost = Math.max(0, (d.rating_ghost || 0) - 1)
      } else {
        d.rating_count = (d.rating_count ?? 12) + 1
      }
      d.rating_avg = score // mock 绠€鍖栵細涓嶇簿纭淮鎶ゅ巻鍙插潎鍊?
      if (score === 5) d.rating_god = (d.rating_god || 0) + 1
      if (score === 1) d.rating_ghost = (d.rating_ghost || 0) + 1
    }
    return this.getRating(slug, deviceId)
  },
  async unrateDemo(slug: string, deviceId?: string): Promise<RatingStats> {
    await delay(100)
    const d = findDemo(slug)
    if (!d) throw new Error('Demo 涓嶅瓨鍦?)
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
      total_amount: '楼 1280',
      updated_at: '2026-08-19',
      sponsors: [
        { name: 'Alice', amount: '楼 500', message: '鏀寔 AI 鍏ㄦ皯鍒朵綔浜猴紒' },
        { name: 'Bob', amount: '楼 300', message: '浣滃搧寰堟锛岀户缁姞娌? },
        { name: 'Charlie', amount: '楼 200' },
        { name: 'Dave', amount: '楼 100' },
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
    if (!r) throw new Error('璁板綍涓嶅瓨鍦?)
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

  async createDemo(payload: CreateDemoPayload, onProgress?: (percent: number) => void): Promise<{ slug: string; status: string; created: boolean }> {
    await delay(500)
    onProgress?.(50)
    await delay(500)
    onProgress?.(100)
    if (!currentUser) throw new Error('璇峰厛鐧诲綍')
    if (payload.demo_type !== 'link' && !payload.file) throw new Error('璇蜂笂浼?zip 鏂囦欢')
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
      previewHtml: payload.demo_type === 'web' ? '<!doctype html><html><body style="margin:0;font-family:monospace;display:grid;place-items:center;height:100vh;background:#4ecdc4"><h1>宸蹭笂浼?Demo</h1></body></html>' : undefined,
    }
    ;(settings.auto_approve ? demos : pendingDemos).push(demo)
    return { slug: demo.slug, status: demo.status as string }
  },

  async createDemoFromUrl(payload: CreateDemoFromUrlPayload): Promise<{ slug: string; status: string; created: boolean }> {
    await delay(400)
    const slug = 'url-' + Math.random().toString(16).slice(2, 10)
    return { slug, status: 'pending', created: true }
  },
  async updateDemo(slug: string, payload: UpdateDemoPayload, onProgress?: (percent: number) => void): Promise<void> {
    await delay(400)
    onProgress?.(100)
    const d = findDemo(slug)
    if (!d) throw new Error('Demo 涓嶅瓨鍦?)
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

  // ---------- 璇勮 ----------
  async listComments(slug: string): Promise<Comment[]> {
    await delay()
    return clone(comments[slug] || [])
  },

  async postComment(slug: string, content: string, parent_id?: number | null): Promise<Comment> {
    await delay(200)
    if (!currentUser) throw new Error('璇峰厛鐧诲綍')
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
      if (!parent) throw new Error('鐖惰瘎璁轰笉瀛樺湪')
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
    return sessionTexts[key] || `# ${filename}\n\n锛堟殏鏃犲唴瀹癸級`
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
    if (!d) throw new Error('寰呭 Demo 涓嶅瓨鍦?)
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

  async ossSync(_force = false): Promise<{ demos_ok: number; demos_fail: number; covers_ok: number; covers_fail: number }> {
    await delay(500)
    return { demos_ok: demos.length, demos_fail: 0, covers_ok: 0, covers_fail: 0 }
  },

  async storageStatus(): Promise<{ oss_enabled: boolean; mode: string; local_demos: number; local_files: number; local_size_bytes: number }> {
    await delay(200)
    return { oss_enabled: false, mode: 'local', local_demos: demos.length, local_files: 0, local_size_bytes: 0 }
  },

  async updateUser(id: number, patch: Partial<Pick<User, 'role' | 'status'>>): Promise<User> {
    await delay(200)
    const u = users.find((x) => x.id === id)
    if (!u) throw new Error('鐢ㄦ埛涓嶅瓨鍦?)
    Object.assign(u, patch)
    return clone(u)
  },

  // ---------- 鍏憡 ----------
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
    if (!a) throw new Error('鍏憡涓嶅瓨鍦?)
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
