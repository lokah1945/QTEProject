/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 
 *   HARDWARE DATABASE IMPORT SCRIPT - CROSS-PLATFORM V6
 *   
 *   CHANGES FROM PREVIOUS VERSION:
 *   ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 *   1. Multi-platform support (Windows/Linux/macOS)
 *   2. Runtime augmentation (NO cooldown by default)
 *   3. Platform detection & validation
 *   4. Tier-based health tracking
 *   
 *   CRITICAL: Database baru HANYA punya runtime.status: "idle"
 *            Script ini HARUS menambahkan semua tracking fields!
 * 
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const { MongoClient } = require('mongodb');
const fs = require('fs').promises;
const path = require('path');

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const CONFIG = {
    MONGO_URI: 'mongodb://127.0.0.1:27017',
    DB_NAME: 'quantumtraffic',
    COLLECTION_NAME: 'fingerprints_v6',

    // File naming patterns (auto-detect platform)
    FILE_PATTERNS: {
        windows: /^database_hardware_windows_.*\.json$/i,
        linux: /^database_hardware_linux_.*\.json$/i,
        macos: /^database_hardware_macos_.*\.json$/i,
        unified: /^database_hardware_cross_platform_.*\.json$/i  // All platforms in one file
    },

    // Runtime defaults (NO COOLDOWN by default)
    RUNTIME_DEFAULTS: {
        usage_count: 0,
        last_used: null,
        worker_id: null,
        session_id: null,
        proxy_id: null,
        acquired_at: null,

        // ✅ COOLDOWN DISABLED by default (set to 0)
        cooldown_until: null,
        min_cooldown_minutes: 0,  // 0 = NO cooldown

        success_count: 0,
        fail_count: 0,
        health_score: 100
    },

    // Batch size for bulk operations
    BATCH_SIZE: 1000,

    // Validation requirements
    VALIDATION: {
        required_api_fields: [
            'fingerprint.display.width',
            'fingerprint.display.height',
            'fingerprint.webgl.vendor',
            'fingerprint.webgl.renderer',
            'fingerprint.browser.hardware_concurrency',
            'fingerprint.browser.device_memory',
            'fingerprint.viewport.width',
            'fingerprint.viewport.height',
            'fingerprint.device.scale_factor',
            'fingerprint.device.has_touch'
        ],
        required_population_fields: [
            'population.tier',
            'population.rarity_score',
            'population.os_target'
        ]
    }
};


// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// UTILITY: Get nested property value
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}


// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PLATFORM DETECTION
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function detectPlatformFromFilename(filename) {
    for (const [platform, pattern] of Object.entries(CONFIG.FILE_PATTERNS)) {
        if (pattern.test(filename)) {
            return platform === 'unified' ? null : platform;  // null = mixed platforms
        }
    }
    return null;  // Unknown format
}

function detectPlatformFromContent(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return null;
    }

    // Check first record's os_target
    const firstRecord = data[0];
    const osTarget = firstRecord?.population?.os_target;

    if (!osTarget) {
        throw new Error('Missing population.os_target in database records');
    }

    // Check consistency across first 10 records
    const sampleSize = Math.min(10, data.length);
    const platforms = new Set();

    for (let i = 0; i < sampleSize; i++) {
        const platform = data[i]?.population?.os_target;
        if (platform) {
            platforms.add(platform);
        }
    }

    if (platforms.size === 1) {
        return Array.from(platforms)[0];  // Single platform
    } else if (platforms.size > 1) {
        return 'mixed';  // Multi-platform (unified file)
    }

    return null;
}


// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function validateRecord(record, index) {
    const errors = [];

    // Check _id
    if (!record._id) {
        errors.push(`Record ${index}: Missing _id`);
    }

    // Check API-facing fields
    for (const fieldPath of CONFIG.VALIDATION.required_api_fields) {
        const value = getNestedValue(record, fieldPath);
        if (value === undefined || value === null) {
            errors.push(`Record ${index} (${record._id}): Missing required field: ${fieldPath}`);
        }
    }

    // Check population metadata
    for (const fieldPath of CONFIG.VALIDATION.required_population_fields) {
        const value = getNestedValue(record, fieldPath);
        if (value === undefined || value === null) {
            errors.push(`Record ${index} (${record._id}): Missing required field: ${fieldPath}`);
        }
    }

    // Validate tier range
    const tier = record.population?.tier;
    if (tier !== undefined && (tier < 0 || tier > 5)) {
        errors.push(`Record ${index} (${record._id}): Invalid tier ${tier} (must be 0-5)`);
    }

    // Validate platform-specific fields
    const osTarget = record.population?.os_target;

    if (osTarget === 'windows') {
        if (!record.fingerprint?.system?.version) {
            errors.push(`Record ${index} (${record._id}): Windows record missing system.version`);
        }
    } else if (osTarget === 'linux') {
        if (!record.fingerprint?.system?.distribution) {
            errors.push(`Record ${index} (${record._id}): Linux record missing system.distribution`);
        }
    } else if (osTarget === 'macos') {
        if (!record.population?.architecture) {
            errors.push(`Record ${index} (${record._id}): macOS record missing population.architecture`);
        }
    }

    return errors;
}


// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// RUNTIME AUGMENTATION (CRITICAL: Database baru hanya punya status: "idle")
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function augmentRuntimeFields(record) {
    const now = new Date();

    // FORCE RESET runtime fields (clean slate)
    return {
        ...record,
        runtime: {
            // Preserve existing status if present, otherwise default to 'idle'
            status: record.runtime?.status || 'idle',

            // FORCE ADD all tracking fields (even if they exist, overwrite with defaults)
            usage_count: 0,
            last_used: null,
            first_seen: now.toISOString(),

            worker_id: null,
            session_id: null,
            proxy_id: null,
            acquired_at: null,

            // ✅ COOLDOWN DISABLED (min_cooldown_minutes = 0)
            cooldown_until: null,
            min_cooldown_minutes: 0,  // 0 = NO cooldown, >0 = enable cooldown

            success_count: 0,
            fail_count: 0,
            health_score: 100
        }
    };
}


// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MAIN IMPORT LOGIC
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

async function importHardwareDatabase(mode = 'REPLACE') {
    let client;

    try {
        console.log('\n' + '═'.repeat(120));
        console.log('  HARDWARE DATABASE IMPORT - CROSS-PLATFORM V6');
        console.log('═'.repeat(120) + '\n');

        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
        // STEP 1: Scan for database files
        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────

        console.log('[1/7] Scanning for database files...');

        const currentDir = process.cwd();
        const files = await fs.readdir(currentDir);

        const databaseFiles = files.filter(file => {
            return Object.values(CONFIG.FILE_PATTERNS).some(pattern => pattern.test(file));
        });

        if (databaseFiles.length === 0) {
            throw new Error('No database files found! Expected pattern: database_hardware_<platform>_*.json');
        }

        console.log(`   ✓ Found ${databaseFiles.length} database file(s):`);
        databaseFiles.forEach(file => {
            const platform = detectPlatformFromFilename(file);
            console.log(`     - ${file} ${platform ? `(${platform})` : '(mixed platforms)'}`);
        });


        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
        // STEP 2: Load and validate all files
        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────

        console.log('\n[2/7] Loading database files...');

        const allRecords = [];
        const platformStats = { windows: 0, linux: 0, macos: 0, unknown: 0 };

        for (const filename of databaseFiles) {
            const filepath = path.join(currentDir, filename);
            const rawData = await fs.readFile(filepath, 'utf-8');
            const data = JSON.parse(rawData);

            if (!Array.isArray(data)) {
                throw new Error(`File ${filename} is not a valid JSON array`);
            }

            const platform = detectPlatformFromContent(data);
            console.log(`   ✓ Loaded ${filename}: ${data.length} records (platform: ${platform || 'mixed'})`);

            // Count by platform
            data.forEach(record => {
                const osTarget = record.population?.os_target;
                if (osTarget && platformStats.hasOwnProperty(osTarget)) {
                    platformStats[osTarget]++;
                } else {
                    platformStats.unknown++;
                }
            });

            allRecords.push(...data);
        }

        console.log(`\n   Total records loaded: ${allRecords.length}`);
        console.log(`   Platform breakdown:`);
        console.log(`     - Windows: ${platformStats.windows}`);
        console.log(`     - Linux:   ${platformStats.linux}`);
        console.log(`     - macOS:   ${platformStats.macos}`);
        if (platformStats.unknown > 0) {
            console.log(`     - Unknown: ${platformStats.unknown} (WARNING: missing os_target)`);
        }


        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
        // STEP 3: Validate records
        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────

        console.log('\n[3/7] Validating records...');

        const validationErrors = [];
        const sampleSize = Math.min(100, allRecords.length);

        for (let i = 0; i < sampleSize; i++) {
            const errors = validateRecord(allRecords[i], i);
            validationErrors.push(...errors);
        }

        if (validationErrors.length > 0) {
            console.error(`\n   ❌ Validation failed (${validationErrors.length} errors in sample):`);
            validationErrors.slice(0, 10).forEach(err => console.error(`     - ${err}`));
            if (validationErrors.length > 10) {
                console.error(`     ... and ${validationErrors.length - 10} more errors`);
            }
            throw new Error('Database validation failed');
        }

        console.log(`   ✓ Validation passed (sampled ${sampleSize} records)`);


        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
        // STEP 4: Augment runtime fields
        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────

        console.log('\n[4/7] Augmenting runtime fields...');

        const augmentedRecords = allRecords.map(augmentRuntimeFields);

        console.log(`   ✓ Added runtime tracking fields to ${augmentedRecords.length} records`);
        console.log(`     - usage_count, last_used, first_seen`);
        console.log(`     - worker_id, session_id, proxy_id, acquired_at`);
        console.log(`     - success_count, fail_count, health_score`);
        console.log(`     - cooldown_until, min_cooldown_minutes (DISABLED by default)`);


        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
        // STEP 5: Connect to MongoDB
        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────

        console.log('\n[5/7] Connecting to MongoDB...');

        client = new MongoClient(CONFIG.MONGO_URI);
        await client.connect();

        const db = client.db(CONFIG.DB_NAME);
        const collection = db.collection(CONFIG.COLLECTION_NAME);

        console.log(`   ✓ Connected to ${CONFIG.MONGO_URI}`);
        console.log(`     Database: ${CONFIG.DB_NAME}`);
        console.log(`     Collection: ${CONFIG.COLLECTION_NAME}`);


        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
        // STEP 6: Import mode execution
        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────

        console.log(`\n[6/7] Executing import (mode: ${mode})...`);

        if (mode === 'REPLACE') {
            // Delete existing data
            const deleteResult = await collection.deleteMany({});
            console.log(`   ✓ Deleted ${deleteResult.deletedCount} existing records`);

            // Insert all records (batched)
            let inserted = 0;
            for (let i = 0; i < augmentedRecords.length; i += CONFIG.BATCH_SIZE) {
                const batch = augmentedRecords.slice(i, i + CONFIG.BATCH_SIZE);
                await collection.insertMany(batch, { ordered: false });
                inserted += batch.length;
                process.stdout.write(`\r   Inserting... ${inserted}/${augmentedRecords.length}`);
            }
            console.log(`\n   ✓ Inserted ${inserted} records`);

        } else if (mode === 'ADD') {
            // Insert new, skip duplicates
            let inserted = 0;
            let skipped = 0;

            for (let i = 0; i < augmentedRecords.length; i += CONFIG.BATCH_SIZE) {
                const batch = augmentedRecords.slice(i, i + CONFIG.BATCH_SIZE);

                try {
                    const result = await collection.insertMany(batch, { ordered: false });
                    inserted += result.insertedCount;
                } catch (error) {
                    if (error.code === 11000) {
                        // Duplicate key error
                        const duplicates = error.writeErrors?.length || 0;
                        skipped += duplicates;
                        inserted += (batch.length - duplicates);
                    } else {
                        throw error;
                    }
                }

                process.stdout.write(`\r   Processing... ${i + batch.length}/${augmentedRecords.length} (inserted: ${inserted}, skipped: ${skipped})`);
            }

            console.log(`\n   ✓ Inserted ${inserted} new records`);
            console.log(`   ✓ Skipped ${skipped} duplicate records`);
        } else {
            throw new Error(`Invalid mode: ${mode}. Use REPLACE or ADD.`);
        }


        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
        // STEP 7: Create indexes
        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────

        console.log('\n[7/7] Creating indexes...');

        await collection.createIndex({ '_id': 1 }, { unique: true });
        await collection.createIndex({ 'population.os_target': 1 });
        await collection.createIndex({ 'population.tier': 1 });
        await collection.createIndex({ 'runtime.status': 1 });
        await collection.createIndex({ 'runtime.health_score': 1 });
        await collection.createIndex({ 'fingerprint.system.version': 1 });
        await collection.createIndex({ 'population.architecture': 1 });  // For macOS

        console.log('   ✓ Created 7 indexes');


        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────
        // FINAL STATS
        // ─────────────────────────────────────────────────────────────────────────────────────────────────────────

        const finalCount = await collection.countDocuments();

        console.log('\n' + '═'.repeat(120));
        console.log('  IMPORT COMPLETED SUCCESSFULLY');
        console.log('═'.repeat(120));
        console.log(`\n  Total records in database: ${finalCount}`);
        console.log(`\n  Platform breakdown:`);
        console.log(`    - Windows: ${await collection.countDocuments({ 'population.os_target': 'windows' })}`);
        console.log(`    - Linux:   ${await collection.countDocuments({ 'population.os_target': 'linux' })}`);
        console.log(`    - macOS:   ${await collection.countDocuments({ 'population.os_target': 'macos' })}`);
        console.log(`\n  Ready for QTE integration!`);
        console.log(`\n  COOLDOWN STATUS: DISABLED (min_cooldown_minutes = 0)`);
        console.log(`  To enable cooldown: Update min_cooldown_minutes field in documents\n`);
        console.log('═'.repeat(120) + '\n');

    } catch (error) {
        console.error('\n' + '═'.repeat(120));
        console.error('  IMPORT FAILED');
        console.error('═'.repeat(120));
        console.error(`\n  Error: ${error.message}`);
        console.error(`\n  Stack trace:`);
        console.error(error.stack);
        console.error('\n' + '═'.repeat(120) + '\n');
        process.exit(1);

    } finally {
        if (client) {
            await client.close();
        }
    }
}


// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CLI EXECUTION
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const mode = args[0]?.toUpperCase() || 'REPLACE';

if (!['REPLACE', 'ADD'].includes(mode)) {
    console.error('\nUsage: node x_import_hardware_db.js [REPLACE|ADD]\n');
    console.error('  REPLACE: Delete existing data and import fresh (default)');
    console.error('  ADD:     Add new records, skip duplicates\n');
    process.exit(1);
}

importHardwareDatabase(mode);