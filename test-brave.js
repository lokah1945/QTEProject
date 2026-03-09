const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');
const fs = require('fs');

chromium.use(stealth);

function createHardlinkIsolation(originalPath, workerId) {
  if (!fs.existsSync(originalPath)) throw new Error(`Browser asli tidak ditemukan: ${originalPath}`);
  const hardlinkPath = path.join(path.dirname(originalPath), `worker_brave_${workerId}.exe`);
  
  if (!fs.existsSync(hardlinkPath)) {
    console.log(`🔗 Membuat Hardlink Brave: ${path.basename(hardlinkPath)}`);
    fs.linkSync(originalPath, hardlinkPath);
  } else {
    console.log(`♻️ Menggunakan Hardlink Brave: ${path.basename(hardlinkPath)}`);
  }
  return hardlinkPath;
}

(async () => {
  console.log("🚀 [BRAVE HARDLINK] Memulai Operasi Isolasi...");

  const originalExe = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
  const workerExe = createHardlinkIsolation(originalExe, '001');
  const userDataDir = path.join(__dirname, 'profile_brave_worker001');

  const browser = await chromium.launchPersistentContext(userDataDir, {
    executablePath: workerExe,
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
      '--start-maximized'
    ]
  });

  const page1 = (await browser.pages())[0];
  await page1.goto('chrome://version');
  await page1.locator('#command_line').highlight();

  const page2 = await browser.newPage();
  await page2.goto('https://www.google.com');

  console.log("⌨️  Mengetik...");
  try {
      const searchBox = page2.locator('textarea[name="q"]');
      await searchBox.waitFor({ state: 'visible', timeout: 5000 });
      await searchBox.click({ force: true });
      await searchBox.fill('Hardlink Isolation Test Brave');
      await page2.keyboard.press('Enter');
      console.log("✅ SUKSES: Worker Brave OK.");
  } catch (e) { console.log("⚠️ Input gagal:", e.message); }

  await new Promise(() => {});
})();