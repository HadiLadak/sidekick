// Renders the demo screenshots in public/demos from small HTML mock-ups.
// Usage: node scripts/render-demos.mjs <path-to-playwright-core>
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright-core");
const out = path.resolve("public/demos");

const base = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;width:390px;height:844px;overflow:hidden;background:#fff;color:#111;position:relative}
.status{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;font-weight:600;font-size:15px}
.status .r{display:flex;gap:6px;align-items:center}
.bat{width:24px;height:12px;border:1.5px solid currentColor;border-radius:3px;position:relative}
.bat:after{content:"";position:absolute;top:1.5px;bottom:1.5px;left:1.5px;right:6px;background:currentColor;border-radius:1px}`;

const status = (time) => `<div class="status"><span>${time}</span><span class="r">●●●● <span class="bat"></span></span></div>`;

const screens = {
  "scam-text": {
    css: `.top{display:flex;flex-direction:column;align-items:center;padding:6px 16px 10px;border-bottom:1px solid #e5e5ea;background:#f7f7f8;position:relative}
.back{position:absolute;left:12px;top:14px;color:#0a7cff;font-size:30px;line-height:1}
.av{width:52px;height:52px;border-radius:50%;background:#a1a1aa}
.name{font-size:12px;margin-top:4px;color:#333}
.thread{padding:16px 14px}
.meta{text-align:center;color:#8e8e93;font-size:12px;margin:8px 0 14px}
.junk{text-align:center;font-size:13px;color:#8e8e93;margin:0 20px 16px;line-height:1.4}
.junk a{color:#0a7cff;display:inline-block;margin-top:4px;font-size:15px}
.b{background:#e9e9eb;border-radius:18px;padding:10px 14px;max-width:290px;font-size:16px;line-height:1.35}
.b a{color:#0a7cff;text-decoration:underline}
.bar{position:absolute;bottom:0;left:0;right:0;padding:10px 12px 30px;display:flex;gap:10px;align-items:center;border-top:1px solid #e5e5ea}
.in{flex:1;border:1px solid #c7c7cc;border-radius:18px;padding:8px 14px;color:#a1a1aa;font-size:16px}
.plus{width:32px;height:32px;border-radius:50%;background:#e9e9eb;display:grid;place-items:center;color:#8e8e93;font-size:22px}`,
    body: `${status("9:41")}
<div class="top"><span class="back">‹</span><div class="av"></div><div class="name">+1 (604) 555-0187 ›</div></div>
<div class="thread"><div class="meta">Text Message<br>Today 8:12 AM</div>
<div class="junk">The sender is not in your contact list.<br><a>Report Junk</a></div>
<div class="b">Canada Post: Your parcel is on hold due to an incomplete address. To avoid return, pay the $1.99 redelivery fee within 24 hours: <a>https://canadapost-redelivery.info/ca</a></div></div>
<div class="bar"><span class="plus">+</span><span class="in">Text Message</span></div>`,
  },
  "wifi-settings": {
    css: `body{background:#f4f6fb}
h1{font-size:34px;font-weight:400;padding:28px 24px 18px}
.search{margin:0 16px 18px;background:#e3e7f1;border-radius:28px;padding:14px 20px;color:#555;font-size:16px}
.row{display:flex;gap:18px;align-items:center;padding:14px 24px}
.ic{width:40px;height:40px;border-radius:50%;flex-shrink:0}
.t{font-size:18px}.s{font-size:14px;color:#5f6368;margin-top:2px}`,
    body: `${status("10:24")}<h1>Settings</h1><div class="search">Search settings</div>
${[
  ["#1a73e8", "Network &amp; internet", "Mobile data, Wi‑Fi, hotspot"],
  ["#12b5cb", "Connected devices", "Bluetooth, pairing"],
  ["#e37400", "Apps", "Recent apps, default apps"],
  ["#d93025", "Notifications", "Notification history, conversations"],
  ["#188038", "Battery", "62% · Should last until about 9 PM"],
  ["#9334e6", "Storage", "71% used · 37 GB free"],
  ["#1967d2", "Sound &amp; vibration", "Volume, haptics, Do Not Disturb"],
  ["#f29900", "Display", "Dark theme, font size, brightness"],
]
  .map(([c, t, s]) => `<div class="row"><span class="ic" style="background:${c}"></span><div><div class="t">${t}</div><div class="s">${s}</div></div></div>`)
  .join("")}`,
  },
  "storage-full": {
    css: `body{background:#000;color:#fff}
.view{position:absolute;top:44px;left:0;right:0;height:600px;background:linear-gradient(160deg,#4b6b55,#2a3d33 40%,#6b7a4f 70%,#3a2f22)}
.dim{position:absolute;inset:0;background:rgba(0,0,0,.45)}
.dlg{position:absolute;left:44px;right:44px;top:290px;background:#2c2c2e;border-radius:16px;overflow:hidden;text-align:center}
.dlg h2{font-size:18px;padding:22px 18px 6px}
.dlg p{font-size:14px;color:#d1d1d6;padding:0 20px 18px;line-height:1.4}
.btn{border-top:1px solid #48484a;padding:13px;font-size:17px;color:#0a84ff}
.btn.b{font-weight:600}
.shutter{position:absolute;bottom:60px;left:50%;margin-left:-38px;width:76px;height:76px;border-radius:50%;border:5px solid #fff;background:#fff3}
.modes{position:absolute;bottom:160px;left:0;right:0;text-align:center;font-size:13px;letter-spacing:.06em;color:#ffd60a}`,
    body: `${status("2:07")}<div class="view"></div><div class="modes">PHOTO</div><div class="shutter"></div><div class="dim"></div>
<div class="dlg"><h2>Storage Almost Full</h2><p>You can’t take photos or videos. You can manage your storage in Settings.</p>
<div class="btn b">Settings</div><div class="btn">Done</div></div>`,
  },
  "video-call": {
    css: `body{background:#efe7dc}
.status{background:#1f6f5c;color:#fff}
.top{background:#1f6f5c;color:#fff;display:flex;align-items:center;gap:10px;padding:10px 6px 12px 12px;height:64px}
.av{width:40px;height:40px;border-radius:50%;background:#f0b37e;display:grid;place-items:center;font-weight:700;color:#5a3412}
.nm{flex:1}.nm b{display:block;font-size:17px}.nm span{font-size:12px;opacity:.85}
.ic{padding:0 9px}.ic svg{width:24px;height:24px;fill:none;stroke:#fff;stroke-width:2;display:block}
.msgs{padding:14px 12px;display:flex;flex-direction:column;gap:8px}
.m{max-width:270px;padding:8px 11px;border-radius:10px;font-size:15.5px;line-height:1.35;background:#fff}
.m.me{align-self:flex-end;background:#d4f3c9}
.m small{display:block;text-align:right;color:#8a8a8a;font-size:11px;margin-top:2px}
.day{align-self:center;background:#fff9;border-radius:8px;padding:4px 10px;font-size:12px;color:#555}
.bar{position:absolute;bottom:0;left:0;right:0;padding:8px 8px 30px;display:flex;gap:8px;align-items:center}
.in{flex:1;background:#fff;border-radius:24px;padding:11px 16px;color:#999;font-size:16px}
.mic{width:46px;height:46px;border-radius:50%;background:#1f6f5c}`,
    body: `${status("6:30")}<div class="top"><span style="font-size:24px">←</span><div class="av">A</div><div class="nm"><b>Ali</b><span>online</span></div>
<span class="ic"><svg viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg></span>
<span class="ic"><svg viewBox="0 0 24 24"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg></span>
<span class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4" fill="#fff"/><circle cx="12" cy="12" r="1.4" fill="#fff"/><circle cx="12" cy="19" r="1.4" fill="#fff"/></svg></span></div>
<div class="msgs"><span class="day">Today</span>
<div class="m">Salaam Nani! I'm free after 7 tonight<small>6:02 PM</small></div>
<div class="m">Can you call me on video? I want to show you my new apartment<small>6:03 PM</small></div>
<div class="m me">Yes beta. But I don't know how to do the video<small>6:28 PM ✓✓</small></div></div>
<div class="bar"><span class="in">Message</span><span class="mic"></span></div>`,
  },
  "virus-popup": {
    size: { width: 1280, height: 800 },
    css: `body{width:1280px;height:800px;font-family:"Segoe UI",Arial,sans-serif;background:#1c58b8}
.tabs{height:40px;background:#dfe3e8;display:flex;align-items:flex-end;padding:0 8px}
.tab{background:#fff;border-radius:8px 8px 0 0;height:34px;width:260px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-size:13px}
.tab b{font-weight:400;color:#c00}.x{font-size:14px;color:#333;padding:2px 6px}
.wc{margin-left:auto;display:flex;gap:28px;padding:0 16px 10px;font-size:16px}
.url{height:44px;background:#fff;display:flex;align-items:center;padding:0 14px;gap:14px;border-bottom:1px solid #ccc;font-size:14px;color:#555}
.box{flex:1;background:#f1f3f4;border-radius:18px;padding:8px 16px;color:#202124}
.page{padding:40px;color:#fff}.page h1{font-size:30px}
.pop{position:absolute;left:340px;top:200px;width:600px;background:#fff;border:3px solid #d00;box-shadow:0 10px 40px #0008}
.ph{background:#d00;color:#fff;padding:10px 14px;font-weight:700;display:flex;justify-content:space-between}
.pb{padding:22px;color:#111;font-size:16px;line-height:1.5}
.pb .h{font-size:26px;font-weight:800;color:#d00;margin-bottom:8px}
.pb .num{font-size:30px;font-weight:800;margin:12px 0}
.btns{display:flex;justify-content:flex-end;gap:10px;padding:0 22px 20px}
.btns span{padding:9px 22px;border:1px solid #888;font-size:15px}
.btns .p{background:#0067c0;color:#fff;border-color:#0067c0}`,
    body: `<div class="tabs"><div class="tab"><b>Security Alert!!</b><span class="x">✕</span></div><div class="wc"><span>—</span><span>☐</span><span>✕</span></div></div>
<div class="url"><span>←</span><span>→</span><span>⟳</span><div class="box">Not secure &nbsp;|&nbsp; microsoft-support-alert-0x80.com/warning/?id=88421</div></div>
<div class="page"><h1>Windows Defender Security Center</h1><p style="margin-top:12px;opacity:.85">Access to this PC has been blocked for security reasons.</p></div>
<div class="pop"><div class="ph"><span>Microsoft Windows Security Alert</span><span>✕</span></div>
<div class="pb"><div class="h">WARNING! Your computer is infected</div>
5 viruses were found (Trojan Spyware). Your passwords, banking and email logins are being stolen.<br>
<b>Do not restart or close this window.</b> Call Microsoft Support immediately:
<div class="num">☎ 1-888-555-0143 (Toll Free)</div></div>
<div class="btns"><span>Cancel</span><span class="p">Call Now</span></div></div>`,
  },
};

const browser = await chromium.launch({ channel: "chrome" });
for (const [name, s] of Object.entries(screens)) {
  const size = s.size ?? { width: 390, height: 844 };
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${base}${s.css}</style></head><body>${s.body}</body></html>`);
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: "jpeg", quality: 82 });
  await page.close();
  console.log("rendered", name);
}
await browser.close();
