// ═══════════════════════════════════════════════════════════════════════════════
// url_manager.js (v7.0 — Freshness-Weighted Selection + Power Law Decay)
// ═══════════════════════════════════════════════════════════════════════════════
//
// CHANGELOG v7.0 (2026-03-07):
//   ✅ NEW: Freshness-weighted URL selection berdasarkan Inverse Power Law
//          (Simkin & Roychowdhury, UCLA — n(t) ~ 1/t^β, β ≈ 1.5)
//   ✅ NEW: Field imported_at dan last_used untuk tracking
//   ✅ NEW: URL baru otomatis dapat "spike" traffic awal, lalu meluruh natural
//   ✅ NEW: Backward compatible — URL lama tanpa imported_at dianggap 90 hari
//   ✅ NEW: markUsed() — update last_used + increment hit_count (atomic)
//   ✅ KEPT: Seluruh logic shortlink (Bitly atomic locking) tidak berubah
//   ✅ KEPT: getNewTarget() logic tidak berubah
//
// MODEL SELEKSI:
//   Setiap URL punya freshness_weight yang dihitung di MongoDB aggregation:
//
//     umur_hari = (now - imported_at) / 86400000
//
//     freshness_weight = 
//       jika umur < 1 hari  → 10.0     (spike awal — Chartbeat: 80% views di 24 jam)
//       jika umur < 7 hari  → 1/t^0.8  (rapid decay — Simkin: median β ≈ 1.5)
//       jika umur < 30 hari → 1/t^1.2  (transisi ke steady state)
//       jika umur ≥ 30 hari → 1/t^1.5  (steady trickle — long-tail SEO)
//
//     completion_factor = 1 - (hit_count / hit_target)
//
//     final_weight = freshness_weight × completion_factor
//
//   URL dipilih via weighted random dari semua eligible candidates.
//
// REFERENSI PENELITIAN:
//   - Simkin & Roychowdhury (2011) — "Why does attention to web articles fall with time?"
//   - Chartbeat (2023) — "When Does News Become Old News?"
//   - HubSpot — "Compounding Posts Generate 38% of Blog Traffic"
//   - Ahrefs (2025) — "How Long to Rank in Google? Age of Top Pages"
//
// ═══════════════════════════════════════════════════════════════════════════════

const { db } = require('./database.js');
const config = require('./config.js');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const COLLECTION = 'urls';

// Default imported_at untuk URL lama tanpa field (90 hari lalu)
// URL lama dianggap sudah melewati fase spike/trough/growth → steady state
const DEFAULT_AGE_DAYS = 90;

// Jumlah kandidat yang di-fetch untuk weighted random selection
// Semakin besar = distribusi lebih akurat, tapi query lebih berat
const CANDIDATE_POOL_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Generate random hit_target
// ─────────────────────────────────────────────────────────────────────────────
function getNewTarget() {
    const min = config.targetTrafficMin || 1000000;
    const max = config.targetTrafficMax || 5000000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Bitly shortlink generator (tidak berubah dari v6.0)
// ─────────────────────────────────────────────────────────────────────────────
async function generateBitlyLink(longUrl) {
    const token = process.env.BITLY_API;
    if (!token) { console.error('[UrlManager] ❌ ERROR: BITLY_API missing!'); return null; }
    
    try {
        if (config.DEBUG_MODE) console.log(`[UrlManager] ⏳ Menghubungi Bitly: ${longUrl.substring(0, 30)}...`);
        
        const response = await fetch('https://api-ssl.bitly.com/v4/shorten', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ long_url: longUrl, domain: "bit.ly" })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.link) {
                if (config.DEBUG_MODE) console.log(`[UrlManager] ✅ Bitly Created: ${data.link}`);
                return data.link;
            }
        }
    } catch (error) {
        console.error(`[UrlManager] ❌ Bitly Gagal: ${error.message}`);
        return null;
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE: Freshness-Weighted URL Selection
// ═══════════════════════════════════════════════════════════════════════════════
//
// Menggunakan MongoDB aggregation pipeline untuk:
//   1. Filter URL yang belum selesai (hit_count < hit_target)
//   2. Hitung umur dalam hari dari imported_at
//   3. Hitung freshness_weight berdasarkan power law decay
//   4. Hitung completion_factor (semakin dekat target, semakin rendah)
//   5. final_weight = freshness_weight × completion_factor
//   6. Ambil CANDIDATE_POOL_SIZE kandidat teratas
//   7. Weighted random pick di application layer
//
// ═══════════════════════════════════════════════════════════════════════════════

async function getNextTarget() {
    const now = new Date();
    const defaultImportedAt = new Date(now.getTime() - DEFAULT_AGE_DAYS * 24 * 60 * 60 * 1000);
    const MS_PER_DAY = 86400000;

    // ─── MongoDB Aggregation Pipeline ───
    const pipeline = [
        // Stage 1: Filter eligible URLs (belum selesai)
        {
            $match: {
                $or: [
                    { hit_count: null },
                    { hit_target: null },
                    {
                        $and: [
                            { hit_count: { $ne: null } },
                            { hit_target: { $ne: null } },
                            { $expr: { $lt: ['$hit_count', '$hit_target'] } }
                        ]
                    }
                ]
            }
        },

        // Stage 2: Compute fields
        {
            $addFields: {
                // Jika imported_at tidak ada → default 90 hari lalu
                _imported: { $ifNull: ['$imported_at', defaultImportedAt] },
                // Jika hit_count null → 0
                _hitCount: { $ifNull: ['$hit_count', 0] },
                // Jika hit_target null → placeholder (akan di-init nanti)
                _hitTarget: { $ifNull: ['$hit_target', 1] }
            }
        },

        // Stage 3: Hitung umur dalam hari (minimum 0.042 = ~1 jam, hindari division by zero)
        {
            $addFields: {
                _ageDays: {
                    $max: [
                        0.042,
                        { $divide: [{ $subtract: [now, '$_imported'] }, MS_PER_DAY] }
                    ]
                }
            }
        },

        // Stage 4: Hitung freshness_weight berdasarkan power law decay
        //
        //   umur < 1 hari  → 10.0 (spike)
        //   umur < 7 hari  → 1 / t^0.8
        //   umur < 30 hari → 1 / t^1.2
        //   umur ≥ 30 hari → 1 / t^1.5
        //
        {
            $addFields: {
                _freshnessWeight: {
                    $switch: {
                        branches: [
                            {
                                case: { $lt: ['$_ageDays', 1] },
                                then: 10.0
                            },
                            {
                                case: { $lt: ['$_ageDays', 7] },
                                then: { $divide: [1, { $pow: ['$_ageDays', 0.8] }] }
                            },
                            {
                                case: { $lt: ['$_ageDays', 30] },
                                then: { $divide: [1, { $pow: ['$_ageDays', 1.2] }] }
                            }
                        ],
                        default: { $divide: [1, { $pow: ['$_ageDays', 1.5] }] }
                    }
                }
            }
        },

        // Stage 5: Hitung completion_factor + final_weight
        //   completion_factor = 1 - (hit_count / hit_target)
        //   Minimum 0.05 agar URL mendekati target tetap punya peluang kecil
        {
            $addFields: {
                _completionFactor: {
                    $max: [
                        0.05,
                        { $subtract: [1, { $divide: ['$_hitCount', '$_hitTarget'] }] }
                    ]
                }
            }
        },
        {
            $addFields: {
                _finalWeight: { $multiply: ['$_freshnessWeight', '$_completionFactor'] }
            }
        },

        // Stage 6: Sort by weight descending, ambil top N kandidat
        { $sort: { _finalWeight: -1 } },
        { $limit: CANDIDATE_POOL_SIZE },

        // Stage 7: Bersihkan computed fields dari output
        {
            $project: {
                _imported: 0,
                _hitCount: 0,
                _hitTarget: 0,
                _ageDays: 0,
                _completionFactor: 0
                // _freshnessWeight dan _finalWeight TETAP untuk weighted pick
            }
        }
    ];

    // ─── Execute pipeline ───
    const candidates = await db().collection(COLLECTION).aggregate(pipeline).toArray();

    if (!candidates || candidates.length === 0) {
        if (config.DEBUG_MODE) console.log(`[UrlManager] ⚠️ Tidak ada URL tersedia.`);
        return null;
    }

    // ─── Weighted Random Selection dari candidates ───
    const totalWeight = candidates.reduce((sum, c) => sum + (c._finalWeight || 0.001), 0);
    let roll = Math.random() * totalWeight;
    let doc = candidates[0]; // fallback

    for (const candidate of candidates) {
        roll -= (candidate._finalWeight || 0.001);
        if (roll <= 0) {
            doc = candidate;
            break;
        }
    }

    if (config.DEBUG_MODE) {
        const ageDays = doc._ageDays || '?';
        console.log(`[UrlManager] 🎯 Selected: weight=${doc._finalWeight?.toFixed(4)}, ` +
                     `freshness=${doc._freshnessWeight?.toFixed(4)}, ` +
                     `age=${typeof ageDays === 'number' ? ageDays.toFixed(1) + 'd' : ageDays}`);
    }

    // ─── Cleanup computed fields from doc ───
    delete doc._freshnessWeight;
    delete doc._finalWeight;

    // ─── Init null fields (backward compat) ───
    let updates = {};
    let needDbUpdate = false;

    if (doc.hit_count === null || doc.hit_count === undefined) {
        updates.hit_count = 0; doc.hit_count = 0; needDbUpdate = true;
    }
    if (doc.hit_target === null || doc.hit_target === undefined) {
        updates.hit_target = getNewTarget(); doc.hit_target = updates.hit_target; needDbUpdate = true;
    }
    if (!doc.imported_at) {
        updates.imported_at = defaultImportedAt; doc.imported_at = defaultImportedAt; needDbUpdate = true;
    }

    // ─── Update last_used ───
    updates.last_used = now;
    needDbUpdate = true;

    // ─── LOGIKA SHORTLINK (ATOMIC LOCK) — tidak berubah dari v6.0 ───
    let finalUrl = doc.url;
    let isShortlink = false;
    
    const probability = config.shortlinkProbability !== undefined ? config.shortlinkProbability : 80;
    const useShortlink = (Math.random() * 100) < probability;

    if (useShortlink) {
        if (doc.short_link && doc.short_link.length > 5 && doc.short_link !== 'PENDING') {
            // Case A: Sudah ada -> Pakai
            finalUrl = doc.short_link;
            isShortlink = true;
        } else if (!doc.short_link) {
            // Case B: Belum ada -> COBA LOCKING
            const lockResult = await db().collection(COLLECTION).findOneAndUpdate(
                { _id: doc._id, short_link: null },
                { $set: { short_link: 'PENDING' } }
            );

            if (lockResult) {
                // KITA PEMENANG RACE!
                const newShort = await generateBitlyLink(doc.url);
                if (newShort) {
                    updates.short_link = newShort;
                    finalUrl = newShort;
                    isShortlink = true;
                } else {
                    // Gagal API -> Revert
                    await db().collection(COLLECTION).updateOne(
                        { _id: doc._id },
                        { $set: { short_link: null } }
                    );
                    finalUrl = doc.url;
                }
            } else {
                // KALAH RACE
                const freshDoc = await db().collection(COLLECTION).findOne({ _id: doc._id });
                if (freshDoc.short_link && freshDoc.short_link !== 'PENDING') {
                    finalUrl = freshDoc.short_link;
                    isShortlink = true;
                } else {
                    finalUrl = doc.url;
                }
            }
        } else {
            // Case C: Sedang PENDING -> Pakai Original
            finalUrl = doc.url;
        }
    }

    // ─── Write updates to DB ───
    if (needDbUpdate) {
        await db().collection(COLLECTION).updateOne(
            { _id: doc._id },
            { $set: updates }
        );
    }

    return {
        _id: doc._id,
        url: finalUrl,
        originalUrl: doc.url,
        referrers: doc.referrers,
        isShortlink: isShortlink
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// markUsed() — Update hit_count + last_used setelah surfing selesai
// ═══════════════════════════════════════════════════════════════════════════════
//
// Dipanggil oleh opsi3.js setelah session sukses.
// Atomic: $inc hit_count + $set last_used dalam satu operasi.
//
async function markUsed(urlId) {
    if (!urlId) return;
    try {
        await db().collection(COLLECTION).updateOne(
            { _id: urlId },
            {
                $inc: { hit_count: 1 },
                $set: { last_used: new Date() }
            }
        );
    } catch (err) {
        console.error(`[UrlManager] ⚠️ markUsed error: ${err.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = { getNextTarget, markUsed };
