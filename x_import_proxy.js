/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * x_import_proxy.js v1.4.0 - INTERACTIVE PROXY MANAGEMENT TOOL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CHANGELOG v1.4.0 (2026-03-04 22:08 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * 🆕 NEW FEATURE: REGION INPUT BEFORE IMPORT
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ User is prompted to enter a region code (e.g. "US") before import starts
 * ✅ Region is injected into every proxy document as the first field after _id
 * ✅ Default value: "US" (press Enter to use default)
 * ✅ Region displayed in IMPORT SUMMARY and IMPORT COMPLETE
 *
 * CHANGELOG v1.3.1 (2026-02-10 15:45 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * 🔧 CRITICAL BUGFIX: DUPLICATES WITH SESSION_ID NOT FILTERED ANYMORE
 * ──────────────────────────────────────────────────────────────────────────────
 * ❌ OLD: Even with session_id, still filtered by existingKeys (host:port:user)
 *         → All 40000 proxies get filtered out because 39999 are "duplicates"
 * 
 * ✅ NEW: When including duplicates with session_id:
 *         - Skip the existingKeys filter entirely
 *         - Import all 40000 as new (each has unique session_id)
 *         - Let MongoDB unique index handle uniqueness
 * 
 * LOGIC:
 * ──────────────────────────────────────────────────────────────────────────────
 * if (includesDuplicates) {
 *   // Don't filter by existingKeys - session_id makes each unique
 *   newProxies = proxiesToProcess;  // ALL proxies
 * } else {
 *   // Filter out proxies that already exist (same host:port:user)
 *   newProxies = filter by existingKeys;
 * }
 *
 * CHANGELOG v1.3.0 (2026-02-10 15:30 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * 🆕 NEW FEATURE: UNIQUE SESSION ID FOR DUPLICATE ROTATING PROXIES
 * ✅ When user chooses to import duplicates:
 *    - Each duplicate proxy gets unique `session_id` (UUID v4)
 *    - Each duplicate proxy gets unique `rotation_instance` (incrementing number)
 *    - This allows 40000 identical proxies to be stored as 40000 different docs
 * 
 * CHANGELOG v1.2.2 (2026-02-10 15:15 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * 🔧 BUGFIX: DUPLICATE VARIABLE DECLARATION REMOVED
 * 
 * CHANGELOG v1.2.1 (2026-02-10 15:00 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * 🔧 BUGFIX: DUPLICATE INCLUSION NOW WORKS CORRECTLY
 * 
 * CHANGELOG v1.2.0 (2026-02-10 14:30 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * 🆕 NEW FEATURE: DUPLICATE HANDLING IN IMPORT LIST
 * 
 * CHANGELOG v1.1.0 (2026-01-30 11:01 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * 🔥 CRITICAL FIX: DEDUPLICATION KEY CHANGED
 * ❌ OLD KEY: `${host}:${port}` (WRONG for rotating proxies)
 * ✅ NEW KEY: `${host}:${port}:${user}` (CORRECT for session-based proxies)
 * 
 * PREVIOUS CHANGELOG v1.0.0 (2026-01-30 10:53 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ Initial release with menu-driven proxy management
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
const database = require('./database');

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const PROXY_FILE_PATH = path.join(__dirname, 'import', 'proxylist.txt');
const BATCH_SIZE = 1000;
const DEFAULT_REGION = 'US';

// ═══════════════════════════════════════════════════════════════
// READLINE INTERFACE
// ═══════════════════════════════════════════════════════════════
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

// ═══════════════════════════════════════════════════════════════
// HELPER: SLEEP
// ═══════════════════════════════════════════════════════════════
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════
// 🆕 v1.4.0: HELPER: ASK REGION INPUT
// ═══════════════════════════════════════════════════════════════
async function askRegionInput() {
  console.log('');
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│  🌍 REGION CONFIGURATION                                      │');
  console.log('├────────────────────────────────────────────────────────────────┤');
  console.log('│  Enter the region code for all proxies in this import batch.  │');
  console.log('│  Examples: US, EU, ASIA, BR, CUSTOM-POOL-1                    │');
  console.log('│  Default : US (press Enter to use default)                    │');
  console.log('└────────────────────────────────────────────────────────────────┘');
  console.log('');

  const input = await askQuestion(`  Region [${DEFAULT_REGION}]: `);
  const region = input.trim().toUpperCase() || DEFAULT_REGION;

  console.log('');
  console.log(`  ✅ Region set to: ${region}`);
  console.log('');

  return region;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: PARSE PROXY LINE (🆕 v1.4.0: region parameter added)
// ═══════════════════════════════════════════════════════════════
function parseProxyLine(line, lineNumber, region) {
  try {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return null;
    }

    const parts = trimmed.split(':');

    if (parts.length < 2) {
      console.warn(`[Line ${lineNumber}] Invalid format (missing port): ${line}`);
      return null;
    }

    const host = parts[0].trim();
    const port = parseInt(parts[1].trim(), 10);
    const user = parts.length >= 3 ? parts[2].trim() : '';
    const pass = parts.length >= 4 ? parts.slice(3).join(':').trim() : '';

    if (!host || host.length === 0) {
      console.warn(`[Line ${lineNumber}] Invalid host: ${line}`);
      return null;
    }

    if (isNaN(port) || port < 1 || port > 65535) {
      console.warn(`[Line ${lineNumber}] Invalid port (${parts[1]}): ${line}`);
      return null;
    }

    return {
      region,
      host,
      port,
      user,
      pass,
      protocol: 'socks5',
      country: null,
      timezone: null,

      status: 'testing',
      health_quality: null,
      latency: null,

      success_count: 0,
      fail_count: 0,
      usage_count: 0,

      in_use: false,
      assigned_to_slot: null,
      assigned_to_worker: null,
      assigned_at: null,

      cooldown_until: null,
      rotation_count: 0,
      last_rotation: null,

      last_used: null,
      last_test: null,
      imported_at: new Date(),
      updated_at: new Date()
    };
  } catch (error) {
    console.warn(`[Line ${lineNumber}] Parse error: ${error.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 🆕 HELPER: ADD UNIQUE SESSION ID TO PROXIES
// ═══════════════════════════════════════════════════════════════
function addSessionIdToProxies(proxies) {
  return proxies.map((proxy, index) => ({
    ...proxy,
    session_id: uuidv4(),
    rotation_instance: index + 1
  }));
}

// ═══════════════════════════════════════════════════════════════
// 🆕 FUNCTION: HANDLE DUPLICATES IN IMPORT LIST
// ═══════════════════════════════════════════════════════════════
async function handleDuplicatesPrompt(duplicateCount, totalUnique, totalAll) {
  console.log('');
  console.log('⚠️ DUPLICATES FOUND IN IMPORT FILE');
  console.log('');
  console.log(`Found ${duplicateCount} duplicate proxy/proxies in your import file.`);
  console.log(`Total unique: ${totalUnique}`);
  console.log('');
  console.log('What would you like to do?');
  console.log('');
  console.log(`  1. Import WITHOUT duplicates (default - recommended)`);
  console.log(`     → Will import ${totalUnique} unique proxies only`);
  console.log('');
  console.log(`  2. Import WITH duplicates (each gets unique session_id)`);
  console.log(`     → Will import ALL ${totalAll} proxies with unique session IDs`);
  console.log(`     → Perfect for rotating proxies with parallel usage`);
  console.log('');

  const choice = await askQuestion('Select option (1-2): ');
  return choice.trim();
}

// ═══════════════════════════════════════════════════════════════
// FUNCTION: IMPORT PROXIES FROM FILE
// ═══════════════════════════════════════════════════════════════
async function importProxiesFromFile() {
  try {
    console.log('');
    console.log('='.repeat(70));
    console.log('IMPORT PROXIES FROM FILE');
    console.log('='.repeat(70));
    console.log('');

    if (!fs.existsSync(PROXY_FILE_PATH)) {
      console.error(`❌ File not found: ${PROXY_FILE_PATH}`);
      console.error('');
      console.error('ACTION:');
      console.error(`  1. Create directory: mkdir -p ${path.dirname(PROXY_FILE_PATH)}`);
      console.error(`  2. Create file: touch ${PROXY_FILE_PATH}`);
      console.error('  3. Add proxies (one per line): host:port:user:password');
      console.error('');
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🆕 v1.4.0: ASK REGION BEFORE IMPORT
    // ═══════════════════════════════════════════════════════════════════════
    const region = await askRegionInput();

    console.log(`📄 Reading: ${PROXY_FILE_PATH}`);

    const fileContent = fs.readFileSync(PROXY_FILE_PATH, 'utf8');
    const lines = fileContent.split('\n');

    console.log(`📊 Total lines: ${lines.length}`);
    console.log('');
    console.log('Parsing proxies...');

    const parsedProxies = [];
    let skippedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const proxy = parseProxyLine(lines[i], i + 1, region);
      if (proxy) {
        parsedProxies.push(proxy);
      } else if (lines[i].trim() && !lines[i].trim().startsWith('#')) {
        skippedCount++;
      }
    }

    console.log('');
    console.log(`✅ Parsed: ${parsedProxies.length} proxies (region: ${region})`);
    if (skippedCount > 0) {
      console.log(`⚠️ Skipped: ${skippedCount} invalid lines`);
    }

    if (parsedProxies.length === 0) {
      console.error('');
      console.error('❌ No valid proxies found in file!');
      console.error('');
      console.error('Expected format (one per line):');
      console.error('  host:port:user:password');
      console.error('  na.proxys5.net:6200:user123:pass456');
      console.error('');
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DEDUPLICATE BY host:port:user
    // ═══════════════════════════════════════════════════════════════════════
    console.log('');
    console.log('Analyzing duplicates in file...');
    console.log('💡 Key: host:port:user (supports rotating proxies)');

    const uniqueMap = new Map();
    for (const proxy of parsedProxies) {
      const key = `${proxy.host}:${proxy.port}:${proxy.user}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, proxy);
      }
    }

    const uniqueProxies = Array.from(uniqueMap.values());
    const duplicateCountInFile = parsedProxies.length - uniqueProxies.length;

    console.log(`✅ Unique proxies in file: ${uniqueProxies.length}`);
    if (duplicateCountInFile > 0) {
      console.log(`⚠️ Duplicates in file: ${duplicateCountInFile}`);
    }

    let proxiesToProcess = uniqueProxies;
    let includesDuplicates = false;

    if (duplicateCountInFile > 0) {
      const dupChoice = await handleDuplicatesPrompt(
        duplicateCountInFile, 
        uniqueProxies.length,
        parsedProxies.length
      );

      if (dupChoice === '2') {
        console.log('');
        console.log('⏳ Generating unique session IDs for each proxy...');
        proxiesToProcess = addSessionIdToProxies(parsedProxies);
        includesDuplicates = true;
        console.log(`✅ Session IDs assigned to ${proxiesToProcess.length} proxies`);
      } else {
        console.log('');
        console.log('✅ Duplicates will be skipped.');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CHECK EXISTING PROXIES IN DATABASE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('');
    console.log('Checking existing proxies in database...');

    const db = database.db();
    const proxiesCollection = db.collection('proxies');

    const existingCount = await proxiesCollection.countDocuments({});
    console.log(`📊 Current database: ${existingCount} proxies`);

    let newProxies;
    let existingKeys = new Set();

    if (includesDuplicates) {
      newProxies = proxiesToProcess;
      console.log(`✅ All ${newProxies.length} proxies ready to import (with unique session IDs)`);
    } else {
      const queryConditions = proxiesToProcess.map(p => ({ 
        host: p.host, 
        port: p.port,
        user: p.user 
      }));

      const existingProxies = await proxiesCollection.find({
        $or: queryConditions
      }).toArray();

      existingKeys = new Set(existingProxies.map(p => `${p.host}:${p.port}:${p.user}`));
      newProxies = proxiesToProcess.filter(p => !existingKeys.has(`${p.host}:${p.port}:${p.user}`));

      console.log(`✅ New proxies to import: ${newProxies.length}`);
      if (existingKeys.size > 0) {
        console.log(`⚠️ Already in database: ${existingKeys.size}`);
      }
    }

    if (newProxies.length === 0) {
      console.log('');
      console.log('ℹ️ All proxies already exist in database. Nothing to import.');
      console.log('');
      return;
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('IMPORT SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Region:                  ${region}`);
    console.log(`  Total parsed from file:  ${parsedProxies.length}`);
    if (duplicateCountInFile > 0) {
      if (includesDuplicates) {
        console.log(`  Duplicates in file:      ${duplicateCountInFile} (will be INCLUDED)`);
        console.log(`  Session IDs generated:   ${newProxies.length} unique IDs`);
      } else {
        console.log(`  Duplicates in file:      ${duplicateCountInFile} (will be SKIPPED)`);
        console.log(`  Already in DB:           ${existingKeys.size}`);
      }
    }
    console.log(`  Total to import:         ${newProxies.length}`);
    console.log('='.repeat(70));
    console.log('');

    const confirm = await askQuestion('Proceed with import? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Import cancelled');
      return;
    }

    console.log('');
    console.log('Importing proxies to MongoDB...');

    let importedCount = 0;
    let dbSkippedCount = 0;
    const totalBatches = Math.ceil(newProxies.length / BATCH_SIZE);

    for (let i = 0; i < newProxies.length; i += BATCH_SIZE) {
      const batch = newProxies.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      try {
        await proxiesCollection.insertMany(batch, { ordered: false });
        importedCount += batch.length;

        const progress = ((batchNumber / totalBatches) * 100).toFixed(1);
        console.log(`  Batch ${batchNumber}/${totalBatches} (${progress}%): ${batch.length} proxies inserted`);
      } catch (error) {
        if (error.code === 11000) {
          const successCount = batch.length - (error.writeErrors?.length || 0);
          const failedCount = error.writeErrors?.length || 0;
          importedCount += successCount;
          dbSkippedCount += failedCount;
          console.log(`  Batch ${batchNumber}/${totalBatches}: ${successCount} inserted, ${failedCount} duplicates skipped`);
        } else {
          console.error(`  Batch ${batchNumber}/${totalBatches} FAILED: ${error.message}`);
        }
      }
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('✅ IMPORT COMPLETE');
    console.log('='.repeat(70));
    console.log(`  Region:   ${region}`);
    console.log(`  Imported: ${importedCount} proxies`);
    if (dbSkippedCount > 0) {
      console.log(`  Skipped duplicates: ${dbSkippedCount}`);
    }
    console.log(`  Total in DB: ${existingCount + importedCount}`);
    console.log('='.repeat(70));
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Import failed:');
    console.error(error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
  }
}

// ═══════════════════════════════════════════════════════════════
// FUNCTION: RESET STATISTICS COUNTERS
// ═══════════════════════════════════════════════════════════════
async function resetStatistics() {
  try {
    console.log('');
    console.log('='.repeat(70));
    console.log('RESET STATISTICS COUNTERS');
    console.log('='.repeat(70));
    console.log('');
    console.log('This will reset the following fields to 0/null:');
    console.log('  - success_count = 0');
    console.log('  - fail_count = 0');
    console.log('  - usage_count = 0');
    console.log('  - rotation_count = 0');
    console.log('  - health_quality = null');
    console.log('  - latency = null');
    console.log('  - last_used = null');
    console.log('  - last_test = null');
    console.log('');
    console.log('⚠️ Proxy credentials will NOT be affected');
    console.log('');

    const confirm = await askQuestion('Proceed with reset? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Reset cancelled');
      return;
    }

    console.log('');
    console.log('Resetting statistics...');

    const db = database.db();
    const proxiesCollection = db.collection('proxies');

    const result = await proxiesCollection.updateMany(
      {},
      {
        $set: {
          success_count: 0,
          fail_count: 0,
          usage_count: 0,
          rotation_count: 0,
          health_quality: null,
          latency: null,
          last_used: null,
          last_test: null,
          status: 'testing',
          updated_at: new Date()
        }
      }
    );

    console.log('');
    console.log('='.repeat(70));
    console.log('✅ RESET COMPLETE');
    console.log('='.repeat(70));
    console.log(`  Proxies updated: ${result.modifiedCount}`);
    console.log('='.repeat(70));
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Reset failed:');
    console.error(error.message);
    console.error('');
  }
}

// ═══════════════════════════════════════════════════════════════
// FUNCTION: DELETE ALL PROXIES (DANGEROUS)
// ═══════════════════════════════════════════════════════════════
async function deleteAllProxies() {
  try {
    console.log('');
    console.log('='.repeat(70));
    console.log('⚠️ DELETE ALL PROXIES (DANGEROUS)');
    console.log('='.repeat(70));
    console.log('');
    console.log('🚨 WARNING: This action CANNOT be undone!');
    console.log('');
    console.log('This will:');
    console.log('  1. Drop the entire "proxies" collection');
    console.log('  2. Recreate collection with indexes');
    console.log('  3. Remove ALL proxy data permanently');
    console.log('');

    const db = database.db();
    const proxiesCollection = db.collection('proxies');
    const currentCount = await proxiesCollection.countDocuments({});

    console.log(`📊 Current proxies in database: ${currentCount}`);
    console.log('');

    const confirm1 = await askQuestion('Type "DELETE" to confirm (case-sensitive): ');
    if (confirm1 !== 'DELETE') {
      console.log('❌ Deletion cancelled (confirmation failed)');
      return;
    }

    console.log('');
    console.log('⏳ Waiting 3 seconds before deletion...');
    console.log('   Press Ctrl+C to cancel');
    await sleep(3000);

    console.log('');
    console.log('Deleting all proxies...');

    try {
      await proxiesCollection.drop();
      console.log('✅ Collection dropped');
    } catch (error) {
      if (error.code === 26) {
        console.log('ℹ️ Collection already empty');
      } else {
        throw error;
      }
    }

    console.log('Creating indexes...');

    await db.createCollection('proxies');

    // ═══════════════════════════════════════════════════════════════════════
    // 🔥 v1.3.0: UNIQUE INDEX WITH session_id FOR ROTATING PROXIES
    // ═══════════════════════════════════════════════════════════════════════
    await proxiesCollection.createIndex(
      { host: 1, port: 1, user: 1, session_id: 1 },
      { unique: true, name: 'idx_host_port_user_session' }
    );

    await proxiesCollection.createIndex(
      { status: 1, in_use: 1, cooldown_until: 1, health_quality: -1 },
      { name: 'idx_proxy_selection_v2', background: true }
    );

    await proxiesCollection.createIndex(
      { assigned_to_slot: 1, in_use: 1 },
      { name: 'idx_slot_lookup', sparse: true, background: true }
    );

    console.log('✅ Indexes created');

    console.log('');
    console.log('='.repeat(70));
    console.log('✅ DELETION COMPLETE');
    console.log('='.repeat(70));
    console.log(`  Deleted: ${currentCount} proxies`);
    console.log('  Database: Fresh and empty');
    console.log('='.repeat(70));
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Deletion failed:');
    console.error(error.message);
    console.error('');
  }
}

// ═══════════════════════════════════════════════════════════════
// FUNCTION: SHOW MAIN MENU
// ═══════════════════════════════════════════════════════════════
async function showMenu() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           QUANTUM TRAFFIC ENGINE - PROXY MANAGER              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  1. Import proxies from file (./import/proxylist.txt)');
  console.log('  2. Reset statistics counters (keep credentials)');
  console.log('  3. Delete all proxies (DANGEROUS - fresh start)');
  console.log('  4. Exit');
  console.log('');

  const choice = await askQuestion('Select option (1-4): ');
  return choice.trim();
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════
async function main() {
  try {
    console.log('');
    console.log('='.repeat(70));
    console.log('🚀 PROXY IMPORT TOOL v1.4.0 (ROTATING PROXY WITH SESSION ID + REGION)');
    console.log('='.repeat(70));
    console.log('');

    console.log('Connecting to MongoDB...');
    await database.connect();
    console.log('✅ Database connected');

    while (true) {
      const choice = await showMenu();

      switch (choice) {
        case '1':
          await importProxiesFromFile();
          break;

        case '2':
          await resetStatistics();
          break;

        case '3':
          await deleteAllProxies();
          break;

        case '4':
          console.log('');
          console.log('👋 Goodbye!');
          console.log('');
          rl.close();
          await database.close();
          process.exit(0);

        default:
          console.log('');
          console.log('❌ Invalid option. Please select 1-4.');
          console.log('');
      }

      await askQuestion('Press Enter to continue...');
    }

  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ FATAL ERROR');
    console.error('='.repeat(70));
    console.error('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    console.error('='.repeat(70));
    console.error('');

    rl.close();
    await database.close();
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL HANDLERS
// ═══════════════════════════════════════════════════════════════
process.on('SIGINT', async () => {
  console.log('');
  console.log('');
  console.log('⚠️ Interrupted by user');
  console.log('');
  rl.close();
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('');
  console.log('⚠️ Terminated');
  console.log('');
  rl.close();
  await database.close();
  process.exit(0);
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  importProxiesFromFile,
  resetStatistics,
  deleteAllProxies
};

// ═══════════════════════════════════════════════════════════════
// END OF x_import_proxy.js v1.4.0
// ═══════════════════════════════════════════════════════════════
