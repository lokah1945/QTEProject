/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * reset_fingerprint_stats.js - HARD RESET & TYPE REPAIR
 * ═══════════════════════════════════════════════════════════════════════════════
 * * PURPOSE: 
 * 1. Memperbaiki tipe data yang rusak (Object/String -> Number)
 * 2. Mereset total statistik agar fresh untuk QTE v70
 * * TARGET FIELDS (Forced Value):
 * - usage_count   : 0    (Fixes corrupted Objects)
 * - last_used     : null (Fresh start)
 * - success_count : 0
 * - fail_count    : 0
 * - health_score  : 100
 * * USAGE:
 * node reset_fingerprint_stats.js
 * * ═══════════════════════════════════════════════════════════════════════════════
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URL = process.env.DB_CONNECTION_STRING || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'QuantumTrafficDB';

const FINGERPRINT_COLLECTIONS = [
  'fingerprints_chrome',
  'fingerprints_edge',
  'fingerprints_firefox',
  'fingerprints_safari'
];

async function resetStatistics() {
  const client = new MongoClient(MONGODB_URL);

  try {
    console.log('═'.repeat(70));
    console.log('FINGERPRINT STATISTICS RESET TOOL v1.0');
    console.log('═'.repeat(70));
    console.log(`Database: ${DB_NAME}`);
    console.log('Action  : HARD RESET (All stats set to 0/null)');
    console.log('═'.repeat(70));

    // Connect
    console.log('\n🔌 Connecting to MongoDB...');
    await client.connect();
    const db = client.db(DB_NAME);
    console.log('✅ Connected');

    let totalProcessed = 0;
    let totalReset = 0;

    // Process each collection
    for (const collectionName of FINGERPRINT_COLLECTIONS) {
      console.log('\n' + '─'.repeat(70));
      console.log(`📦 Processing: ${collectionName}`);
      console.log('─'.repeat(70));

      const collection = db.collection(collectionName);

      // Check if collection exists
      const collections = await db.listCollections({ name: collectionName }).toArray();
      if (collections.length === 0) {
        console.log(`   ⚠️  Collection not found, skipping...`);
        continue;
      }

      // Count documents
      const totalDocs = await collection.countDocuments();
      console.log(`   Total documents: ${totalDocs}`);

      if (totalDocs === 0) {
        console.log(`   ⚠️  Empty collection, skipping...`);
        continue;
      }

      console.log(`   🔄 Performing HARD RESET on statistics...`);

      // ─────────────────────────────────────────────────────────────────────────────
      // STRATEGY: UpdateMany with $set (Atomic & Fast)
      // Kita memaksa nilai menjadi 0/null tanpa peduli nilai sebelumnya.
      // Ini otomatis memperbaiki bug tipe data Object pada usage_count.
      // ─────────────────────────────────────────────────────────────────────────────
      
      const result = await collection.updateMany(
        {}, // Filter: Select ALL documents
        {
          $set: {
            usage_count: 0,       // Force Integer
            last_used: null,      // Force Null
            success_count: 0,     // Force Integer
            fail_count: 0,        // Force Integer
            health_score: 100     // Force Integer
          }
        }
      );

      console.log(`   ✅ Reset Complete: ${result.modifiedCount} documents updated`);
      
      // Jika modifiedCount < totalDocs, berarti sisanya sudah 0 (tidak perlu update)
      if (result.modifiedCount < totalDocs) {
        console.log(`   ℹ️  Already Clean: ${totalDocs - result.modifiedCount} documents`);
      }

      totalProcessed += totalDocs;
      totalReset += result.modifiedCount;

      // Create indexes for efficient queries (Safety check)
      console.log(`   🔧 Verifying indexes...`);
      try {
        await collection.createIndex({ last_used: 1, usage_count: 1 });
        await collection.createIndex({ usage_count: 1 });
        await collection.createIndex({ health_score: -1 });
      } catch (err) {
        // Ignore index errors
      }

      // Show sample document Verification
      const sample = await collection.findOne({});
      if (sample) {
        console.log(`\n   📄 Verification (Sample Doc):`);
        console.log(`      _id:           ${sample._id}`);
        console.log(`      usage_count:   ${sample.usage_count} (${typeof sample.usage_count})`); // Cek tipe data
        console.log(`      last_used:     ${sample.last_used}`);
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('✅ RESET COMPLETE');
    console.log('═'.repeat(70));
    console.log(`Total Collections: ${FINGERPRINT_COLLECTIONS.length}`);
    console.log(`Total Documents:   ${totalProcessed}`);
    console.log(`Total Updated:     ${totalReset}`);
    console.log('═'.repeat(70));

    // Final Verification Logic
    console.log('\n📊 Final Type Check (Searching for corrupt data):');
    console.log('─'.repeat(70));
    
    let allClean = true;
    for (const collectionName of FINGERPRINT_COLLECTIONS) {
        const collection = db.collection(collectionName);
        // Cari dokumen dimana usage_count BUKAN number (Type 16 is 32-bit int, 18 is 64-bit int, 1 is Double)
        // Kita cari yang TYPE OBJECT (3) atau STRING (2) atau lainnya
        const corruptDocs = await collection.countDocuments({
            usage_count: { $not: { $type: ["number", "int", "long", "double"] } }
        });
        
        if (corruptDocs > 0) {
            console.log(`❌ ${collectionName}: FOUND ${corruptDocs} CORRUPT DOCUMENTS!`);
            allClean = false;
        } else {
            console.log(`✅ ${collectionName}: Clean (All usage_count are numbers)`);
        }
    }

    if (!allClean) {
        console.log('\n⚠️ WARNING: Some documents might still be corrupt. Run script again.');
    } else {
        console.log('\n✨ Database is 100% Validated & Ready for QTE v70.');
    }
    console.log('═'.repeat(70));

  } catch (error) {
    console.error('\n❌ RESET FAILED');
    console.error('═'.repeat(70));
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);

  } finally {
    await client.close();
    console.log('\n🔌 Database connection closed\n');
  }
}

// Run reset
if (require.main === module) {
  resetStatistics()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Fatal error:', err);
      process.exit(1);
    });
}

module.exports = resetStatistics;