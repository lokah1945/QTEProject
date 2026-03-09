const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');
const fs = require('fs');
const os = require('os');

chromium.use(stealth);

// 1. Auto-Detect + Hardlink Logic
function getOperaWorkerExe(workerId) {
  const base = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Opera');
  if(!fs.existsSync(base)) return null;
  
  const version = fs.readdirSync(base).filter(n => /^\d+\./.test(n)).sort().reverse()[0];
  if (!version) return null;

  const originalPath = path.join(base, version, 'opera.exe');
  const hardlinkPath = path.join(base, version, `worker_opera_${workerId}.exe`);

  if (!fs.existsSync(hardlinkPath)) {
    console.log(`🔗 Membuat Hardlink Opera: ${path.basename(hardlinkPath)}`);
    fs.linkSync(originalPath, hardlinkPath);
  } else {
    console.log(`♻️ Menggunakan Hardlink Opera: ${path.basename(hardlinkPath)}`);
  }
  
  return hardlinkPath;
}

(async () => {
  console.log("🚀 [OPERA HARDLINK] Memulai Operasi Isolasi...");
  
  const workerExe = getOperaWorkerExe('001');
  if(!workerExe) return console.error("Opera tidak ditemukan/gagal hardlink.");
  
  const userDataDir = path.join(__dirname, 'profile_opera_worker001');

  const browser = await chromium.launchPersistentContext(userDataDir, {
    executablePath: workerExe,
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check']
  });

  const page1 = (await browser.pages())[0];
  await page1.goto('chrome://version');
  
  const page2 = await browser.newPage();
  await page2.goto('https://www.google.com');

  try {
      await page2.click('textarea[name="q"]', { force: true });
      await page2.type('textarea[name="q"]', 'Hardlink Isolation Test Opera', { delay: 100 });
      await page2.keyboard.press('Enter');
      console.log("✅ SUKSES: Worker Opera OK.");
  } catch(e) { console.log(e.message); }

  await new Promise(() => {});
})();