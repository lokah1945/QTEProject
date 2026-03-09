const { firefox } = require('playwright'); 
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// --- KONFIGURASI PATH UTAMA ---
const USER_FIREFOX_PATH = String.raw`D:\QuantumTrafficEngine\Browser\Firefox\Firefox_win64-stable_146.0.1\core\firefox.exe`;

// --- FUNGSI WORKER COPY (Isolasi Proses) ---
function createWorker(originalPath, workerId) {
    if (!fs.existsSync(originalPath)) throw new Error(`Firefox tidak ditemukan: ${originalPath}`);
    const dir = path.dirname(originalPath);
    const workerName = `worker_firefox_welcome_fix_${workerId}.exe`;
    const workerPath = path.join(dir, workerName);

    // Bersihkan sisa crash sebelumnya
    if (fs.existsSync(workerPath)) {
        try { fs.unlinkSync(workerPath); } catch (e) {
            try { execSync(`taskkill /F /IM ${workerName}`, { stdio: 'ignore' }); } catch(err) {}
        }
    }
    
    // Copy baru
    try { fs.copyFileSync(originalPath, workerPath); } catch (e) { return originalPath; }
    return workerPath;
}

(async () => {
    console.log("🚀 [FIREFOX WELCOME FIX] Memulai...");

    // 1. Persiapan Binary
    const workerExe = createWorker(USER_FIREFOX_PATH, '001');
    const dir = path.dirname(USER_FIREFOX_PATH);
    const appIniPath = path.join(dir, 'application.ini'); 

    // 2. Setup Profil dengan Preferensi "User Lama"
    const userDataDir = path.join(__dirname, 'profile_firefox_welcome_fix');
    if (fs.existsSync(userDataDir)) try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
    fs.mkdirSync(userDataDir, { recursive: true });

    // Config User.js: Kita tipu Firefox agar mengira ini bukan instalasi baru
    const userJs = `
        // Stealth Dasar
        user_pref("dom.webdriver.enabled", false);
        user_pref("useSystemAppearance", true);
        user_pref("general.useragent.override", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0");
        user_pref("intl.accept_languages", "en-US, en");
        
        // --- ANTI-WELCOME SCREEN (LEVEL TINGGI) ---
        user_pref("browser.startup.homepage_override.mstone", "ignore"); // Jangan tampilkan update info
        user_pref("startup.homepage_welcome_url", "");
        user_pref("startup.homepage_welcome_url.additional", "");
        
        // Matikan Onboarding & Messaging System
        user_pref("browser.onboarding.enabled", false);
        user_pref("browser.messaging-system.whatsNewPanel.enabled", false);
        user_pref("browser.aboutwelcome.enabled", false); 
        
        // Pura-pura kita sudah melihat Welcome Screen
        user_pref("trailhead.firstrun.didSeeAboutWelcome", true);
        user_pref("trailhead.firstrun.branches", "nofirstrun-empty");
        
        // Matikan Default Browser Check
        user_pref("browser.shell.checkDefaultBrowser", false);
        
        // Matikan PDF Viewer Lying
        user_pref("pdfjs.disabled", false);
    `;
    fs.writeFileSync(path.join(userDataDir, 'user.js'), userJs);

    console.log("🔄 Meluncurkan Browser...");
    const browser = await firefox.launchPersistentContext(userDataDir, {
        executablePath: workerExe,
        headless: false,
        viewport: null,
        ignoreDefaultArgs: ['--enable-automation'],
        args: ['-app', appIniPath, '--start-maximized']
    });

    // 3. 🔥 INTERCEPTOR: WELCOME SCREEN CLICKER 🔥
    // Script ini akan mengecek apakah ada tab 'about:welcome' yang bandel muncul
    let page = browser.pages()[0] || await browser.newPage();
    
    // Tunggu sebentar untuk melihat apakah Firefox me-redirect ke Welcome
    await page.waitForTimeout(1500);

    if (page.url().includes('welcome') || page.url().includes('mozilla')) {
        console.log("⚠️ Welcome Screen Terdeteksi! Mencoba klik tombol...");
        
        // Daftar selector tombol yang mungkin muncul (Start, Skip, Not now)
        const buttons = [
            '[data-test-id="onboarding-continue-button"]', // Tombol utama "Start browsing"
            'button.primary',
            'button:has-text("Start browsing")',
            'button:has-text("Skip")',
            'button:has-text("Not now")'
        ];

        for (const selector of buttons) {
            try {
                if (await page.isVisible(selector)) {
                    console.log(`👇 Mengklik: ${selector}`);
                    await page.click(selector);
                    await page.waitForTimeout(1000); // Tunggu animasi
                    break; 
                }
            } catch (e) {}
        }
    }

    // 4. 🔥 SUNTIKAN STEALTH WEBDRIVER (RUNTIME) 🔥
    await browser.addInitScript(() => {
        // Hapus Webdriver agar tidak terdeteksi bot
        try {
            const proto = Navigator.prototype;
            if (proto.hasOwnProperty('webdriver')) delete proto.webdriver;
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); // Undefined = Manusia
        } catch (e) {}

        // Fix Konsistensi Lainnya
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        
        // Plugin Mocking
        const pdfPlugin = { name: "PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 };
        const mimePDF = { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format", enabledPlugin: pdfPlugin, length: 1 };
        const makeFakeArray = (items) => {
            items.item = function(i) { return this[i]; };
            items.namedItem = function(name) { return this.find(p => p.name === name); };
            items.refresh = function() {};
            return items;
        };
        Object.defineProperty(navigator, 'plugins', { get: () => makeFakeArray([pdfPlugin]) });
        Object.defineProperty(navigator, 'mimeTypes', { get: () => makeFakeArray([mimePDF]) });
        Object.defineProperty(navigator, 'pdfViewerEnabled', { get: () => true });
    });

    // 5. NAVIGASI KE GOOGLE
    console.log("🔗 Membuka Google...");
    // Pastikan kita tidak di halaman welcome lagi
    if (page.url().includes('welcome')) {
        await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
    } else {
        await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
    }

    // Anti-Overlay (Accept/Reject Popups Google)
    try {
        const popups = ['button:has-text("Lain kali")', 'button:has-text("No thanks")', 'div[role="dialog"] button:last-child'];
        for (const sel of popups) {
            if (await page.$(sel)) await page.click(sel);
        }
    } catch (e) {}

    // 6. MENGETIK (TANPA ENTER)
    console.log("⌨️  Mengetik Query...");
    try {
        const inputSelector = 'textarea[name="q"], input[name="q"]';
        await page.waitForSelector(inputSelector, { timeout: 10000 });
        
        await page.click(inputSelector, { force: true });
        await page.type(inputSelector, 'Firefox Fixed Welcome Screen Check', { delay: 100 });
        
        console.log("✅ SUKSES: Teks diketik. Menunggu interaksi user...");
        
    } catch (e) {
        console.error("❌ Gagal mengetik:", e.message);
    }

    // Keep Alive
    await new Promise(() => {});
})();