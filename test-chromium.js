const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');
const fs = require('fs');

chromium.use(stealth);

// --- HARDLINK LOGIC ---
function createHardlinkIsolation(originalPath, workerId) {
  if (!fs.existsSync(originalPath)) throw new Error(`Binary tidak ditemukan: ${originalPath}`);
  const hardlinkPath = path.join(path.dirname(originalPath), `worker_chromium_${workerId}.exe`);
  
  // Cek eksistensi
  if (!fs.existsSync(hardlinkPath)) {
    console.log(`🔗 Membuat Hardlink: ${path.basename(hardlinkPath)}`);
    try {
        fs.linkSync(originalPath, hardlinkPath);
    } catch (e) {
        console.error("⚠️ Gagal buat hardlink (butuh Admin). Mencoba copy fallback...");
        fs.copyFileSync(originalPath, hardlinkPath); // Fallback jika link gagal
    }
  } else {
    console.log(`♻️ Menggunakan Hardlink: ${path.basename(hardlinkPath)}`);
  }
  return hardlinkPath;
}

(async () => {
  console.log("🚀 [CHROMIUM HARDLINK + ANTI-OVERLAY] Memulai...");

  const originalExe = 'D:\\QuantumTrafficEngine\\Browser\\chrome\\chromium\\chrome.exe';
  const workerExe = createHardlinkIsolation(originalExe, '001');
  
  // Profil Isolated
  const userDataDir = path.join(__dirname, 'profile_chromium_worker001');
  if (fs.existsSync(userDataDir)) try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}

  const browser = await chromium.launchPersistentContext(userDataDir, {
    executablePath: workerExe,
    headless: false,
    viewport: null,
    // Hapus indikator bot visual
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-search-engine-choice-screen', // Sangat penting untuk Chromium baru
      '--disable-infobars',
      '--disable-popup-blocking',
      '--start-maximized'
    ]
  });

  // Tab 1: Cek Hardlink Execution
  const page1 = (await browser.pages())[0];
  await page1.goto('chrome://version');

  // Tab 2: Google
  const page2 = await browser.newPage();
  console.log("🔗 Navigasi ke Google...");
  await page2.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });

  // --- AGGRESSIVE OVERLAY KILLER (CHROMIUM SPECIFIC) ---
  console.log("🛡️ Memindai & Membunuh Overlay...");
  try {
      // Daftar musuh (popup) yang sering muncul di Chromium polos
      const overlaySelectors = [
          'button:has-text("No thanks")',       // Sign in to Chrome
          'button:has-text("Lain kali")',       // Bahasa indo
          'button:has-text("Tidak, terima kasih")',
          'button:has-text("Stay signed out")', // Google login
          'button:has-text("Reject all")',      // Cookies
          'div[role="dialog"] button[aria-label="Close"]', // Tombol X
          '#interrupt-container button'         // Container gangguan umum
      ];

      // Loop cepat untuk klik apapun yang menghalangi
      for (const selector of overlaySelectors) {
          if (await page2.$(selector)) {
              console.log(`🔨 KILL: Menutup popup "${selector}"`);
              await page2.click(selector);
              await page2.waitForTimeout(500); // Tunggu animasi tutup
          }
      }
  } catch(e) {
      console.log("ℹ️ Aman, tidak ada overlay terdeteksi.");
  }

  // --- ROBUST TYPING ---
  console.log("⌨️  Mengetik...");
  try {
      const inputSelector = 'textarea[name="q"], input[name="q"]';
      
      // Tunggu input box (pastikan overlay sudah hilang)
      await page2.waitForSelector(inputSelector, { timeout: 5000 });
      
      // 1. Force Click (Tembus jika ada overlay transparan sisa)
      await page2.click(inputSelector, { force: true });

      // 2. Fill (Cepat & Akurat)
      await page2.fill(inputSelector, 'Chromium Hardlink Anti-Overlay');

      // 3. Enter
      await page2.keyboard.press('Enter');
      
      console.log("✅ SUKSES: Chromium Hardlink Input OK.");
  } catch(e) { 
      console.error("❌ Gagal Input:", e.message); 
  }

  await new Promise(() => {});
})();