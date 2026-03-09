const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

chromium.use(stealth);

// --- HARDLINK LOGIC START ---
function createHardlinkIsolation(originalPath, workerId) {
  if (!fs.existsSync(originalPath)) throw new Error(`Browser asli tidak ditemukan di: ${originalPath}`);
  
  const dir = path.dirname(originalPath);
  const ext = path.extname(originalPath);
  const hardlinkName = `worker_chrome_${workerId}${ext}`;
  const hardlinkPath = path.join(dir, hardlinkName);

  // Cek apakah hardlink sudah ada. Jika belum, buat baru.
  // Kita cek juga stats-nya untuk memastikan inode-nya valid.
  try {
    if (!fs.existsSync(hardlinkPath)) {
      console.log(`🔗 Membuat Hardlink: ${hardlinkName}`);
      fs.linkSync(originalPath, hardlinkPath);
    } else {
      console.log(`♻️ Menggunakan Hardlink: ${hardlinkName}`);
    }
  } catch (e) {
    console.error("❌ Gagal membuat hardlink. Pastikan jalankan sebagai ADMINISTRATOR.");
    throw e;
  }
  return hardlinkPath;
}
// --- HARDLINK LOGIC END ---

(async () => {
  console.log("🚀 [CHROME HARDLINK] Memulai Operasi Isolasi...");

  // 1. Tentukan Path Asli
  const originalExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  
  // 2. Buat/Dapatkan Path Hardlink (Worker 001)
  const workerExe = createHardlinkIsolation(originalExe, '001');

  const userDataDir = path.join(__dirname, 'profile_chrome_worker001');
  if (fs.existsSync(userDataDir)) try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}

  // 3. Launch Playwright via Hardlink
  const browser = await chromium.launchPersistentContext(userDataDir, {
    executablePath: workerExe, // Menggunakan worker_chrome_001.exe
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-search-engine-choice-screen',
      '--disable-sync',
      '--disable-popup-blocking',
      '--start-maximized'
    ]
  });

  // Tab 1: Cek Pipe & Process Name
  const page1 = (await browser.pages())[0];
  await page1.goto('chrome://version');
  
  // Visual Check
  await page1.evaluate(() => {
    const el = document.querySelector('#command_line');
    if (el) {
       el.style.border = "5px solid #00ff00";
       // Tambahkan info visual bahwa kita pakai worker exe
       const div = document.createElement('div');
       div.innerText = "RUNNING AS WORKER HARDLINK";
       div.style.cssText = "position:fixed; top:10px; right:10px; background:red; color:white; padding:10px; z-index:9999;";
       document.body.appendChild(div);
    }
  });

  // Tab 2: Google Operation (Sama seperti sebelumnya)
  const page2 = await browser.newPage();
  await page2.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });

  // Anti-Overlay
  try {
    const overlaySelectors = ['button:has-text("Lain kali")', 'button:has-text("No thanks")', 'button:has-text("Stay signed out")'];
    for (const selector of overlaySelectors) if (await page2.$(selector)) await page2.click(selector);
  } catch (e) {}

  // Typing
  try {
    await page2.click('textarea[name="q"], input[name="q"]', { force: true }); 
    await page2.fill('textarea[name="q"], input[name="q"]', 'Hardlink Isolation Test Chrome');
    await page2.keyboard.press('Enter');
    console.log("✅ SUKSES: Worker Chrome terkendali.");
  } catch (e) { console.error(e.message); }

  await new Promise(() => {});
})();