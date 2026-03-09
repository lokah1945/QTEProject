// ═══════════════════════════════════════════════════════════════════════════════
// import_urls.js — URL Import & Management Tool v1.0.0
// ═══════════════════════════════════════════════════════════════════════════════
//
// FITUR:
//   1. Import URL    — Baca ./import/urls.json, auto-generate field, insert ke MongoDB
//   2. Reset Statistik — Reset hit_count semua URL atau filter by domain/URL
//   3. Cleanup Legacy — Hapus field lama (hitcount, hittarget) dari semua dokumen
//
// PENGGUNAAN:
//   node import_urls.js                  → Interactive menu
//   node import_urls.js --import         → Langsung import
//   node import_urls.js --reset          → Langsung reset menu
//   node import_urls.js --cleanup        → Langsung cleanup legacy fields
//
// DEPENDENCIES:
//   - database.js (MongoDB connector)
//   - config.js   (untuk targetTrafficMin/Max)
//
// ═══════════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { connect, db, close } = require('./database.js');
const config = require('./config.js');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const IMPORT_DIR = path.join(__dirname, 'import');
const IMPORT_FILE = path.join(IMPORT_DIR, 'urls.json');
const COLLECTION = 'urls';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Generate random hit_target
// ─────────────────────────────────────────────────────────────────────────────
function getNewTarget() {
    const min = config.targetTrafficMin || 1000000;
    const max = config.targetTrafficMax || 5000000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Readline prompt
// ─────────────────────────────────────────────────────────────────────────────
function createRL() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function ask(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

// ═══════════════════════════════════════════════════════════════════════════════
// FITUR 1: IMPORT URL
// ═══════════════════════════════════════════════════════════════════════════════
async function importUrls() {
    console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}  📥 IMPORT URL dari ./import/urls.json${RESET}`);
    console.log(`${CYAN}═══════════════════════════════════════════════════${RESET}\n`);

    // 1. Cek file exists
    if (!fs.existsSync(IMPORT_FILE)) {
        console.log(`${RED}❌ File tidak ditemukan: ${IMPORT_FILE}${RESET}`);
        console.log(`${DIM}   Buat file ./import/urls.json terlebih dahulu.${RESET}`);
        console.log(`${DIM}   Lihat ./import/urls_example.json untuk contoh format.${RESET}`);
        return { imported: 0, skipped: 0, errors: 0 };
    }

    // 2. Parse JSON
    let urlList;
    try {
        const raw = fs.readFileSync(IMPORT_FILE, 'utf8');
        urlList = JSON.parse(raw);
    } catch (err) {
        console.log(`${RED}❌ Gagal parse JSON: ${err.message}${RESET}`);
        return { imported: 0, skipped: 0, errors: 0 };
    }

    if (!Array.isArray(urlList) || urlList.length === 0) {
        console.log(`${YELLOW}⚠️  File kosong atau bukan array.${RESET}`);
        return { imported: 0, skipped: 0, errors: 0 };
    }

    console.log(`${GREEN}✓${RESET} Ditemukan ${BOLD}${urlList.length}${RESET} URL dalam file\n`);

    // 3. Fetch existing URLs untuk skip duplikat
    const collection = db().collection(COLLECTION);
    const existingDocs = await collection.find({}, { projection: { url: 1 } }).toArray();
    const existingUrls = new Set(existingDocs.map(d => d.url));

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const now = new Date();
    const bulkOps = [];

    for (let i = 0; i < urlList.length; i++) {
        const item = urlList[i];

        // Validasi minimal
        if (!item.url || typeof item.url !== 'string') {
            console.log(`${RED}  ✗ Index ${i}: URL tidak valid atau kosong${RESET}`);
            errors++;
            continue;
        }

        const url = item.url.trim();

        // Skip duplikat
        if (existingUrls.has(url)) {
            console.log(`${YELLOW}  ⊘ Skip (duplikat): ${DIM}${url.substring(0, 70)}...${RESET}`);
            skipped++;
            continue;
        }

        // Validasi referrers — format: [{ url: "https://...", weight: 60 }, ...]
        // weight opsional (jika kosong → pure random di runtime)
        let referrers = [];
        if (Array.isArray(item.referrers)) {
            for (const ref of item.referrers) {
                if (!ref || typeof ref !== 'object' || !ref.url || typeof ref.url !== 'string') {
                    continue; // skip entry tidak valid
                }
                if (!ref.url.startsWith('http')) {
                    continue; // skip URL tidak valid
                }
                const entry = { url: ref.url.trim() };
                if (ref.weight !== undefined && ref.weight !== null && Number(ref.weight) > 0) {
                    entry.weight = Number(ref.weight);
                }
                referrers.push(entry);
            }
        }

        // Build document
        const doc = {
            url: url,
            referrers: referrers,
            short_link: null,
            hit_count: 0,
            hit_target: getNewTarget(),
            imported_at: now,
            last_used: null
        };

        bulkOps.push({ insertOne: { document: doc } });
        existingUrls.add(url); // Prevent intra-batch duplicates
        imported++;

        console.log(`${GREEN}  ✓ Import: ${RESET}${DIM}${url.substring(0, 70)}...${RESET} ${DIM}(target: ${doc.hit_target.toLocaleString()})${RESET}`);
    }

    // 4. Bulk write
    if (bulkOps.length > 0) {
        try {
            const result = await collection.bulkWrite(bulkOps, { ordered: false });
            console.log(`\n${GREEN}${BOLD}✅ Bulk insert berhasil: ${result.insertedCount} dokumen${RESET}`);
        } catch (bulkErr) {
            // Partial success on unordered bulk
            if (bulkErr.result) {
                console.log(`\n${YELLOW}⚠️  Partial insert: ${bulkErr.result.nInserted} berhasil, ${bulkErr.writeErrors?.length || 0} gagal${RESET}`);
            } else {
                console.log(`\n${RED}❌ Bulk insert error: ${bulkErr.message}${RESET}`);
                errors += bulkOps.length;
                imported = 0;
            }
        }
    }

    // 5. Summary
    console.log(`\n${CYAN}─── RINGKASAN ──────────────────────────────────────${RESET}`);
    console.log(`  ${GREEN}✓ Imported : ${imported}${RESET}`);
    console.log(`  ${YELLOW}⊘ Skipped  : ${skipped} (duplikat)${RESET}`);
    console.log(`  ${RED}✗ Errors   : ${errors}${RESET}`);
    console.log(`  ${DIM}  Total DB  : ${existingUrls.size} URLs${RESET}`);
    console.log(`${CYAN}────────────────────────────────────────────────────${RESET}\n`);

    return { imported, skipped, errors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FITUR 2: RESET STATISTIK URL
// ═══════════════════════════════════════════════════════════════════════════════
async function resetStats() {
    console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}  🔄 RESET STATISTIK URL${RESET}`);
    console.log(`${CYAN}═══════════════════════════════════════════════════${RESET}\n`);

    const rl = createRL();

    console.log(`  ${BOLD}1${RESET} — Reset SEMUA URL`);
    console.log(`  ${BOLD}2${RESET} — Reset by domain (contoh: healthandbeauty.my.id)`);
    console.log(`  ${BOLD}3${RESET} — Reset URL spesifik`);
    console.log(`  ${BOLD}0${RESET} — Batal\n`);

    const choice = await ask(rl, `  Pilihan [0-3]: `);

    const collection = db().collection(COLLECTION);
    let filter = {};
    let label = '';

    switch (choice.trim()) {
        case '1':
            filter = {};
            label = 'SEMUA URL';
            break;

        case '2': {
            const domain = await ask(rl, `  Masukkan domain: `);
            if (!domain.trim()) { rl.close(); return; }
            // Match URL that contains the domain
            filter = { url: { $regex: domain.trim(), $options: 'i' } };
            label = `domain "${domain.trim()}"`;
            break;
        }

        case '3': {
            const url = await ask(rl, `  Masukkan URL lengkap: `);
            if (!url.trim()) { rl.close(); return; }
            filter = { url: url.trim() };
            label = `URL spesifik`;
            break;
        }

        default:
            console.log(`${DIM}  Dibatalkan.${RESET}`);
            rl.close();
            return;
    }

    // Count affected
    const count = await collection.countDocuments(filter);
    if (count === 0) {
        console.log(`\n${YELLOW}⚠️  Tidak ada URL yang cocok dengan filter.${RESET}`);
        rl.close();
        return;
    }

    const confirm = await ask(rl, `\n  ${YELLOW}Akan reset ${BOLD}${count}${RESET}${YELLOW} URL (${label}). Lanjutkan? [y/N]: ${RESET}`);
    rl.close();

    if (confirm.trim().toLowerCase() !== 'y') {
        console.log(`${DIM}  Dibatalkan.${RESET}`);
        return;
    }

    // Reset: hit_count=0, regenerate hit_target, clear short_link, clear last_used
    const result = await collection.updateMany(filter, [
        {
            $set: {
                hit_count: 0,
                hit_target: {
                    $floor: {
                        $add: [
                            config.targetTrafficMin || 1000000,
                            {
                                $multiply: [
                                    { $rand: {} },
                                    (config.targetTrafficMax || 5000000) - (config.targetTrafficMin || 1000000)
                                ]
                            }
                        ]
                    }
                },
                short_link: null,
                last_used: null
            }
        }
    ]);

    console.log(`\n${GREEN}${BOLD}✅ Reset berhasil: ${result.modifiedCount} URL direset${RESET}`);
    console.log(`${DIM}   hit_count → 0, hit_target → regenerated, short_link → null, last_used → null${RESET}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FITUR 3: CLEANUP LEGACY FIELDS
// ═══════════════════════════════════════════════════════════════════════════════
async function cleanupLegacy() {
    console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}  🧹 CLEANUP LEGACY FIELDS${RESET}`);
    console.log(`${CYAN}═══════════════════════════════════════════════════${RESET}\n`);

    const collection = db().collection(COLLECTION);

    // Cek berapa dokumen punya field legacy
    const withLegacy = await collection.countDocuments({
        $or: [
            { hitcount: { $exists: true } },
            { hittarget: { $exists: true } }
        ]
    });

    if (withLegacy === 0) {
        console.log(`${GREEN}✓ Tidak ada field legacy ditemukan. Database sudah bersih.${RESET}\n`);
        return;
    }

    console.log(`  Ditemukan ${BOLD}${withLegacy}${RESET} dokumen dengan field legacy (hitcount/hittarget)`);

    const rl = createRL();
    const confirm = await ask(rl, `  ${YELLOW}Hapus field legacy dari ${withLegacy} dokumen? [y/N]: ${RESET}`);
    rl.close();

    if (confirm.trim().toLowerCase() !== 'y') {
        console.log(`${DIM}  Dibatalkan.${RESET}`);
        return;
    }

    // $unset legacy fields
    const result = await collection.updateMany(
        { $or: [{ hitcount: { $exists: true } }, { hittarget: { $exists: true } }] },
        { $unset: { hitcount: '', hittarget: '' } }
    );

    console.log(`\n${GREEN}${BOLD}✅ Cleanup berhasil: ${result.modifiedCount} dokumen dibersihkan${RESET}`);
    console.log(`${DIM}   Field 'hitcount' dan 'hittarget' dihapus${RESET}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FITUR 4: MIGRASI — Tambah imported_at & last_used ke dokumen lama
// ═══════════════════════════════════════════════════════════════════════════════
async function migrateExisting() {
    console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}  🔧 MIGRASI: Tambah imported_at & last_used${RESET}`);
    console.log(`${CYAN}═══════════════════════════════════════════════════${RESET}\n`);

    const collection = db().collection(COLLECTION);

    // Cek dokumen tanpa imported_at
    const withoutImportedAt = await collection.countDocuments({ imported_at: { $exists: false } });

    if (withoutImportedAt === 0) {
        console.log(`${GREEN}✓ Semua dokumen sudah punya imported_at. Tidak perlu migrasi.${RESET}\n`);
        return;
    }

    console.log(`  Ditemukan ${BOLD}${withoutImportedAt}${RESET} dokumen tanpa field imported_at`);
    console.log(`${DIM}  → Akan di-set ke 90 hari lalu (dianggap URL lama / steady state)${RESET}`);

    const rl = createRL();
    const confirm = await ask(rl, `\n  ${YELLOW}Lanjutkan migrasi ${withoutImportedAt} dokumen? [y/N]: ${RESET}`);
    rl.close();

    if (confirm.trim().toLowerCase() !== 'y') {
        console.log(`${DIM}  Dibatalkan.${RESET}`);
        return;
    }

    // Set imported_at = 90 hari lalu, last_used = null
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const result = await collection.updateMany(
        { imported_at: { $exists: false } },
        {
            $set: {
                imported_at: ninetyDaysAgo,
                last_used: null
            }
        }
    );

    console.log(`\n${GREEN}${BOLD}✅ Migrasi berhasil: ${result.modifiedCount} dokumen diupdate${RESET}`);
    console.log(`${DIM}   imported_at → ${ninetyDaysAgo.toISOString()} (90 hari lalu)${RESET}`);
    console.log(`${DIM}   last_used → null${RESET}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN MENU (Interactive)
// ═══════════════════════════════════════════════════════════════════════════════
async function mainMenu() {
    console.log(`\n${BOLD}${CYAN}╔═══════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}${CYAN}║    📋 QTE URL Management Tool v1.0.0              ║${RESET}`);
    console.log(`${BOLD}${CYAN}╚═══════════════════════════════════════════════════╝${RESET}\n`);

    const rl = createRL();

    // Show DB stats
    const collection = db().collection(COLLECTION);
    const totalUrls = await collection.countDocuments();
    const activeUrls = await collection.countDocuments({
        $or: [
            { hit_count: null },
            { hit_target: null },
            { $expr: { $lt: ['$hit_count', '$hit_target'] } }
        ]
    });
    const completedUrls = totalUrls - activeUrls;

    console.log(`  ${DIM}Database: ${totalUrls} total URLs, ${activeUrls} aktif, ${completedUrls} selesai${RESET}\n`);

    console.log(`  ${BOLD}1${RESET} — 📥 Import URL dari ./import/urls.json`);
    console.log(`  ${BOLD}2${RESET} — 🔄 Reset Statistik URL`);
    console.log(`  ${BOLD}3${RESET} — 🧹 Cleanup Legacy Fields (hitcount/hittarget)`);
    console.log(`  ${BOLD}4${RESET} — 🔧 Migrasi: Tambah imported_at ke URL lama`);
    console.log(`  ${BOLD}0${RESET} — Keluar\n`);

    const choice = await ask(rl, `  Pilihan [0-4]: `);
    rl.close();

    switch (choice.trim()) {
        case '1': await importUrls(); break;
        case '2': await resetStats(); break;
        case '3': await cleanupLegacy(); break;
        case '4': await migrateExisting(); break;
        case '0': return;
        default:
            console.log(`${RED}  Pilihan tidak valid.${RESET}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
    try {
        // Connect to MongoDB
        console.log(`${DIM}Connecting to MongoDB...${RESET}`);
        await connect();
        console.log(`${GREEN}✓ Connected${RESET}`);

        // CLI flags
        const args = process.argv.slice(2);
        if (args.includes('--import')) {
            await importUrls();
        } else if (args.includes('--reset')) {
            await resetStats();
        } else if (args.includes('--cleanup')) {
            await cleanupLegacy();
        } else if (args.includes('--migrate')) {
            await migrateExisting();
        } else {
            await mainMenu();
        }

    } catch (err) {
        console.error(`\n${RED}❌ Fatal error: ${err.message}${RESET}`);
        if (err.stack) console.error(`${DIM}${err.stack}${RESET}`);
    } finally {
        await close();
        console.log(`${DIM}Disconnected from MongoDB.${RESET}`);
        process.exit(0);
    }
}

main();
