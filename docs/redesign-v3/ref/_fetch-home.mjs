import pkg from 'file:///D:/developing/ds民间科研成果展示/web/frontend/node_modules/https-proxy-agent/dist/index.js'
const {HttpsProxyAgent} = pkg
import https from 'node:https'
import fs from 'node:fs'

const agent = new HttpsProxyAgent(process.env.DSH_PROXY_HTTPS || 'http://127.0.0.1:10808')
const outDir = 'D:/developing/ds民间科研成果展示/web/docs/redesign-v3/ref'

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {agent, headers: {'user-agent': 'Mozilla/5.0', accept: 'text/html,*/*'}}, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(get(new URL(res.headers.location, url).href))
      }
      let body = ''; res.setEncoding('utf8')
      res.on('data', c => (body += c)); res.on('end', () => resolve({status: res.statusCode, body}))
    })
    req.on('error', reject); req.setTimeout(20000, () => req.destroy(new Error('timeout')))
  })
}

const targets = [
  ['stylekit-home-zh.html', 'https://www.stylekit.top/zh'],
  ['stylekit-home-en.html', 'https://www.stylekit.top'],
]
for (const [name, url] of targets) {
  try {
    const r = await get(url)
    fs.writeFileSync(`${outDir}/${name}`, r.body)
    console.log(`${name}: ${r.status} ${r.body.length}B`)
  } catch (e) { console.log(`${name}: FAIL ${e.message}`) }
}