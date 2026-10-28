const { language } = require('./locale.cjs');
const catalog = require('../shared/locales/en.json');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Immerse Jam 互传</title><style>body{background:#101013;color:#f4f4f6;font:16px system-ui;padding:28px;max-width:620px;margin:auto}h1{font-size:28px}p{color:#aaa}button,a{color:#fff;background:#d53458;border:0;border-radius:12px;padding:12px 18px;display:inline-block;margin:8px 0;text-decoration:none}section{padding:18px;background:#202025;border-radius:16px;margin:12px 0}input{max-width:100%}</style><h1>Immerse Jam</h1><p>与电脑直接互传，页面只显示已选中的歌曲。配对链接请勿转发给其他人。</p><div id="songs"></div><section><h3>发送到电脑</h3><p>选择音频或 .ijam / .aum 歌曲包。电脑确认后导入。</p><input id="file" type="file" multiple><button id="send">发送所选文件</button><p id="status"></p></section><script>const token=new URLSearchParams(location.search).get('token');const auth='?token='+encodeURIComponent(token);fetch('/api/list'+auth).then(r=>r.json()).then(songs=>{for(const s of songs){const box=document.createElement('section'),title=document.createElement('h3'),link=document.createElement('a');title.textContent=s.title;link.textContent='接收歌曲与分轨';link.href='/api/download/'+s.id+auth;box.append(title,link);document.querySelector('#songs').append(box)}});document.querySelector('#send').onclick=async()=>{const status=document.querySelector('#status');for(const f of document.querySelector('#file').files){status.textContent='正在发送 '+f.name;const r=await fetch('/api/upload'+auth+'&name='+encodeURIComponent(f.name),{method:'POST',body:f});if(!r.ok){status.textContent=await r.text();return;}}status.textContent='发送完成，请在电脑确认导入。'};</script>`;
function renderTransferPage(requested) {
  const locale = ['en', 'zh-CN'].includes(requested) ? requested : language();
  let page = html;
  if (locale === 'en')
    for (const key of Object.keys(catalog).sort((a, b) => b.length - a.length))
      if (page.includes(key) && !key.includes('{')) page = page.replaceAll(key, catalog[key]);
  const toggle = '<button id="language-toggle">English / 中文</button>';
  page = page.replace('<h1>', toggle + '<h1>');
  page = page.replace(
    '<script>',
    `<script>document.querySelector('#language-toggle').onclick=()=>{const u=new URL(location.href);u.searchParams.set('lang',${JSON.stringify(locale === 'en' ? 'zh-CN' : 'en')});location.href=u.href;};`,
  );
  return page;
}
module.exports = { renderTransferPage };
