const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');
const fs = require('fs');

// Aktifkan Stealth
chromium.use(stealth);

// --- KONFIGURASI ROOT ---
const EDGE_WORKERS_ROOT = 'D:\\QuantumTrafficEngine\\Browser\\edge';

// --- FUNGSI: MEMILIH 2 WORKER ACAK ---
function getRandomWorkers(count = 2) {
    if (!fs.existsSync(EDGE_WORKERS_ROOT)) {
        throw new Error(`Directory tidak ditemukan: ${EDGE_WORKERS_ROOT}`);
    }

    // 1. Baca semua folder di dalam root
    const allItems = fs.readdirSync(EDGE_WORKERS_ROOT);
    
    // 2. Filter hanya folder yang bernama 'worker...' dan punya msedge.exe
    const validWorkers = allItems.filter(name => {
        const fullPath = path.join(EDGE_WORKERS_ROOT, name);
        const exePath = path.join(fullPath, 'msedge.exe'); // Pastikan ada exe-nya
        return fs.statSync(fullPath).isDirectory() && 
               name.toLowerCase().startsWith('worker') &&
               fs.existsSync(exePath);
    });

    if (validWorkers.length < count) {
        throw new Error(`Hanya ditemukan ${validWorkers.length} worker valid. Butuh minimal ${count}.`);
    }

    // 3. Acak dan ambil 2
    const selected = [];
    while (selected.length < count) {
        const randomIndex = Math.floor(Math.random() * validWorkers.length);
        const pick = validWorkers[randomIndex];
        if (!selected.includes(pick)) {
            selected.push(pick);
        }
    }
    
    return selected;
}

// --- FUNGSI UTAMA: MENJALANKAN SATU WORKER ---
async function runEdgeWorker(workerFolderName) {
    const workerId = workerFolderName.replace('worker', ''); // Ambil angkanya saja
    console.log(`🚀 [START] Meluncurkan Worker ID: ${workerId} dari folder ${workerFolderName}`);

    // Path Executable Unik (D:\...\worker10XX\msedge.exe)
    const executablePath = path.join(EDGE_WORKERS_ROOT, workerFolderName, 'msedge.exe');
    
    // Profile Unik (Agar cache/cookie tidak bentrok antar worker)
    const userDataDir = path.join(__dirname, `profile_edge_${workerFolderName}`);
    
    // Bersihkan profil lama (Opsional)
    if (fs.existsSync(userDataDir)) {
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
    }

    try {
        const browser = await chromium.launchPersistentContext(userDataDir, {
            executablePath: executablePath, // <--- INI KUNCINYA (Exe terpisah)
            headless: false,
            viewport: null,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-blink-features=AutomationControlled',
                '--disable-search-engine-choice-screen',
                '--disable-infobars',
                '--disable-popup-blocking',
                '--start-maximized'
            ]
        });

        // --- LOGIC TAB (Stability Fix) ---
        let page = null;
        const pages = browser.pages();
        if (pages.length > 0) page = pages[0];
        else page = await browser.newPage();

        // Cek Pipe
        await page.goto('chrome://version');
        await page.evaluate(() => {
            const el = document.querySelector('#command_line');
            if (el && el.innerText.includes('--remote-debugging-pipe')) {
                el.style.border = "5px solid #00ff00";
                el.style.backgroundColor = "#e6fffa";
            }
        });
        console.log(`✅ [Worker ${workerId}] Pipe Verified.`);

        // --- GOOGLE AUTOMATION ---
        const page2 = await browser.newPage();
        console.log(`🔗 [Worker ${workerId}] Navigasi ke Google...`);
        await page2.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });

        // Anti-Overlay
        try {
            const popups = [
                'button:has-text("Lain kali")', 'button:has-text("No thanks")', 
                'button:has-text("Not now")', 'button:has-text("Reject all")',
                'div[role="dialog"] button[aria-label="Close"]'
            ];
            for (const selector of popups) {
                if (await page2.$(selector)) {
                    await page2.click(selector);
                    await page2.waitForTimeout(300);
                }
            }
        } catch (e) {}

        // Typing
        try {
            const inputSelector = 'textarea[name="q"], input[name="q"]';
            await page2.waitForSelector(inputSelector, { timeout: 10000 });
            await page2.click(inputSelector, { force: true });
            
            // Ketik teks berbeda agar terlihat unik
            await page2.fill(inputSelector, `Worker ${workerId} Reporting Duty`);
            await page2.keyboard.press('Enter');
            
            console.log(`✅ [Worker ${workerId}] SUKSES: Input & Enter Berhasil.`);
        } catch (e) {
            console.error(`❌ [Worker ${workerId}] Gagal Mengetik:`, e.message);
        }

        // Jangan close browser agar Anda bisa lihat hasilnya
        return browser;

    } catch (e) {
        console.error(`❌ [Worker ${workerId}] CRASH/ERROR:`, e.message);
    }
}

// --- EKSEKUSI PARALEL ---
(async () => {
    try {
        console.log("🎲 Memilih 2 Worker Acak...");
        const selectedWorkers = getRandomWorkers(2); // Pilih 2
        console.log(`🎯 Terpilih: ${selectedWorkers.join(', ')}`);

        // Jalankan keduanya sekaligus (Parallel Promise)
        await Promise.all([
            runEdgeWorker(selectedWorkers[0]),
            runEdgeWorker(selectedWorkers[1])
        ]);

        console.log("\n🏁 Semua Worker telah diluncurkan. Tekan Ctrl+C untuk stop.");
        
        // Keep Alive
        await new Promise(() => {});

    } catch (error) {
        console.error("FATAL ERROR:", error.message);
    }
})();