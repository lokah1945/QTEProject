/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * migrate_fingerprints_v14.js - Add Statistics Fields (No Lock Mechanism)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Add usage statistics to fingerprint collections
 * 
 * NEW FIELDS:
 * - usage_count: Total times fingerprint used (default: 0)
 * - last_used: Last usage timestamp (default: null)
 * - success_count: Successful sessions (default: 0)
 * - fail_count: Failed sessions (default: 0)
 * - health_score: Success rate 0-100 (default: 100)
 * 
 * SELECTION PRIORITY:
 * 1. Fingerprints with last_used = null (never used)
 * 2. Fingerprints with oldest last_used timestamp
 * 3. Sort by usage_count ASC (lowest usage first)
 * 
 * USAGE:
 *   node migrate_fingerprints_v14.js
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
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

async function migrateFingerprints() {
  const client = new MongoClient(MONGODB_URL);

  try {
    console.log('═'.repeat(70));
    console.log('FINGERPRINT MIGRATION v14.0.0 - Statistics Fields');
    console.log('═'.repeat(70));
    console.log(`Database: ${DB_NAME}`);
    console.log('═'.repeat(70));

    // Connect
    console.log('\n🔌 Connecting to MongoDB...');
    await client.connect();
    const db = client.db(DB_NAME);
    console.log('✅ Connected');

    let totalProcessed = 0;
    let totalUpdated = 0;

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

      // Update documents (add statistics fields if not exist)
      console.log(`   🔄 Adding statistics fields...`);

      const result = await collection.updateMany(
        {},
        {
          $set: {
            // Only set if field doesn't exist
            usage_count: { $ifNull: ['$usage_count', 0] },
            last_used: { $ifNull: ['$last_used', null] },
            success_count: { $ifNull: ['$success_count', 0] },
            fail_count: { $ifNull: ['$fail_count', 0] },
            health_score: { $ifNull: ['$health_score', 100] }
          }
        }
      );

      // MongoDB updateMany with $ifNull doesn't work in $set
      // Use aggregation pipeline instead
      const bulkOps = [];
      
      // Find documents without statistics fields
      const cursor = collection.find({
        $or: [
          { usage_count: { $exists: false } },
          { last_used: { $exists: false } },
          { success_count: { $exists: false } },
          { fail_count: { $exists: false } },
          { health_score: { $exists: false } }
        ]
      });

      let updated = 0;
      const batchSize = 1000;
      let batch = [];

      await cursor.forEach(doc => {
        batch.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                usage_count: doc.usage_count ?? 0,
                last_used: doc.last_used ?? null,
                success_count: doc.success_count ?? 0,
                fail_count: doc.fail_count ?? 0,
                health_score: doc.health_score ?? 100
              }
            }
          }
        });

        if (batch.length >= batchSize) {
          bulkOps.push(...batch);
          batch = [];
        }
      });

      // Add remaining batch
      if (batch.length > 0) {
        bulkOps.push(...batch);
      }

      // Execute bulk operations
      if (bulkOps.length > 0) {
        const bulkResult = await collection.bulkWrite(bulkOps);
        updated = bulkResult.modifiedCount;
      }

      console.log(`   ✅ Updated: ${updated} documents`);
      console.log(`   ✅ Already migrated: ${totalDocs - updated} documents`);

      totalProcessed += totalDocs;
      totalUpdated += updated;

      // Create indexes for efficient queries
      console.log(`   🔧 Creating indexes...`);
      
      try {
        await collection.createIndex({ last_used: 1, usage_count: 1 });
        await collection.createIndex({ usage_count: 1 });
        await collection.createIndex({ health_score: -1 });
        console.log(`   ✅ Indexes created`);
      } catch (err) {
        console.log(`   ℹ️  Indexes already exist`);
      }

      // Show sample document
      const sample = await collection.findOne({});
      if (sample) {
        console.log(`\n   📄 Sample document statistics:`);
        console.log(`      usage_count:   ${sample.usage_count}`);
        console.log(`      last_used:     ${sample.last_used || 'null (never used)'}`);
        console.log(`      success_count: ${sample.success_count}`);
        console.log(`      fail_count:    ${sample.fail_count}`);
        console.log(`      health_score:  ${sample.health_score}`);
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('✅ MIGRATION COMPLETE');
    console.log('═'.repeat(70));
    console.log(`Total documents processed: ${totalProcessed}`);
    console.log(`Total documents updated:   ${totalUpdated}`);
    console.log(`Already migrated:          ${totalProcessed - totalUpdated}`);
    console.log('═'.repeat(70));

    // Verification queries
    console.log('\n📊 Verification Queries:');
    console.log('─'.repeat(70));
    
    for (const collectionName of FINGERPRINT_COLLECTIONS) {
      const collection = db.collection(collectionName);
      const exists = await db.listCollections({ name: collectionName }).toArray();
      
      if (exists.length === 0) continue;

      const stats = await collection.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            neverUsed: [
              { $match: { last_used: null } },
              { $count: 'count' }
            ],
            used: [
              { $match: { last_used: { $ne: null } } },
              { $count: 'count' }
            ],
            avgUsage: [
              { $group: { _id: null, avg: { $avg: '$usage_count' } } }
            ]
          }
        }
      ]).toArray();

      const result = stats[0];
      const total = result.total[0]?.count || 0;
      const neverUsed = result.neverUsed[0]?.count || 0;
      const used = result.used[0]?.count || 0;
      const avgUsage = result.avgUsage[0]?.avg || 0;

      console.log(`\n${collectionName}:`);
      console.log(`   Total:           ${total}`);
      console.log(`   Never used:      ${neverUsed} (${((neverUsed/total)*100).toFixed(1)}%)`);
      console.log(`   Already used:    ${used} (${((used/total)*100).toFixed(1)}%)`);
      console.log(`   Avg usage_count: ${avgUsage.toFixed(2)}`);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('💡 Next Steps:');
    console.log('─'.repeat(70));
    console.log('1. Update device_manager.js to v14.0.0');
    console.log('2. Remove fingerprints_runtime collection (deprecated):');
    console.log('   db.fingerprints_runtime.drop()');
    console.log('3. Test with: node opsi4.js');
    console.log('═'.repeat(70));

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED');
    console.error('═'.repeat(70));
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);

  } finally {
    await client.close();
    console.log('\n🔌 Database connection closed\n');
  }
}

// Run migration
if (require.main === module) {
  migrateFingerprints()
    .then(() => {
      console.log('✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Fatal error:', err);
      process.exit(1);
    });
}

module.exports = migrateFingerprints;
