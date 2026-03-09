/**
 * ═══════════════════════════════════════════════════════════════
 * ProxyQualityManager.js v4.4.0 - REGION-AWARE PROXY SELECTION
 * ═══════════════════════════════════════════════════════════════
 * * 🔥 CHANGELOG v4.4.0 (2026-03-04 22:10 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ FEATURE: Region-Aware Proxy Selection in getBestProxy()
 * - Added options.region parameter (e.g. 'US', 'ID', 'GB')
 * - When region is provided, matchStage filters by { region: region }
 * - When region is null/undefined, behaves as before (no region filter)
 * ✅ RETAINED: All v4.3.0 Logic (Singleton, Scoring, Aggregation, Fairness)
 * * 🔥 CHANGELOG v4.3.0 (2026-02-15 06:10 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ REFACTOR: Converted to Singleton Export
 * - module.exports = new ProxyQualityManager()
 * - Ensures single instance across application
 * ✅ RETAINED: All v4.2.0 Logic (Scoring, Aggregation, Fairness)
 * * 🔥 CHANGELOG v4.2.0 (2026-02-06 23:15 WIB):
 * ──────────────────────────────────────────────────────────────────────────────
 * ✅ ADD: Strict Cooldown Check in getBestProxy()
 * ✅ ADD: Usage Fairness Weighting
 * * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { db } = require('./database.js');

class ProxyQualityManager {
  constructor() {
    // Load thresholds from .env
    this.thresholds = {
      excellent: parseInt(process.env.PROXY_LATENCY_EXCELLENT || 200),
      good: parseInt(process.env.PROXY_LATENCY_GOOD || 500),
      acceptable: parseInt(process.env.PROXY_LATENCY_ACCEPTABLE || 2000),
      failed: parseInt(process.env.PROXY_LATENCY_THRESHOLD || 15000)
    };

    this.minHealthQuality = parseInt(process.env.MIN_HEALTH_QUALITY || 50);
    this.minSuccessRate = parseFloat(process.env.MIN_SUCCESS_RATE || 30) / 100;
    this.maxFailBeforeQuarantine = parseInt(process.env.MAX_FAIL_BEFORE_QUARANTINE || 10);
    
    console.log('[ProxyQualityManager] v4.4.0 Initialized (Singleton)');
  }

  /**
   * Calculate health quality score based on latency
   */
  calculateHealthScore(latency) {
    if (latency === null || latency === undefined) {
      return 50; // Neutral score for untested
    }

    if (latency < this.thresholds.excellent) {
      return 100; // Excellent
    } else if (latency < this.thresholds.good) {
      // Linear interpolation: 100 → 80
      return 100 - ((latency - this.thresholds.excellent) / 
                      (this.thresholds.good - this.thresholds.excellent)) * 20;
    } else if (latency < this.thresholds.acceptable) {
      // Linear interpolation: 80 → 50
      return 80 - ((latency - this.thresholds.good) / 
                    (this.thresholds.acceptable - this.thresholds.good)) * 30;
    } else if (latency < this.thresholds.failed) {
      // Linear interpolation: 50 → 0
      return 50 - ((latency - this.thresholds.acceptable) / 
                    (this.thresholds.failed - this.thresholds.acceptable)) * 50;
    } else {
      return 0; // Failed
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * ✅ GET BEST PROXY (DB-SIDE AGGREGATION)
   * ═══════════════════════════════════════════════════════════════
   */
  async getBestProxy(options = {}) {
    const { excludeIds = [], preferHighQuality = false, region = null } = options;

    try {
      const database = db();
      const proxiesCollection = database.collection('proxies');
      const { ObjectId } = require('mongodb');
      
      const now = new Date(); // 🔥 Capture exact time for cooldown check

      // ─────────────────────────────────────────────────────────────
      // 1. MATCH STAGE (STRICT FILTERING)
      // ─────────────────────────────────────────────────────────────
      const matchStage = {
        // Status must be valid
        status: { $in: ['live', 'testing'] },
        
        // Must NOT be currently assigned
        in_use: { $ne: true }, 
        
        // 🔥 CRITICAL: Cooldown Logic
        // Either 'cooldown_until' doesn't exist, is null, OR is in the past
        $or: [
          { cooldown_until: { $exists: false } },
          { cooldown_until: null },
          { cooldown_until: { $lte: now } } // Ready to use (Cooldown expired)
        ],

        // Health check (if available)
        $and: [
            {
                $or: [
                    { health_quality: { $gte: this.minHealthQuality } },
                    { health_quality: null } // Allow untested/fresh proxies
                ]
            }
        ]
      };

      // ✅ v4.4.0: REGION-AWARE FILTERING
      // When region is provided, only select proxies matching that region
      // DB field: proxies.region (e.g. 'US', 'ID', 'GB')
      if (region) {
        matchStage.region = region.toUpperCase();
        console.log(`[ProxyQualityManager] 🌍 Region filter active: ${matchStage.region}`);
      }

      // Apply exclusions
      if (excludeIds.length > 0) {
        matchStage._id = {
          $nin: excludeIds.map(id => new ObjectId(id))
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 2. PIPELINE (SCORING)
      // ─────────────────────────────────────────────────────────────
      const pipeline = [
        { $match: matchStage },
        
        {
          $addFields: {
            // Null coalescing for safety
            safe_health: { $ifNull: ["$health_quality", 50] },
            safe_success: { $ifNull: ["$success_count", 0] },
            safe_fail: { $ifNull: ["$fail_count", 0] },
            safe_usage: { $ifNull: ["$usage_count", 0] }
          }
        },
        
        {
          $addFields: {
            // Calculate Success Rate (0-100)
            calc_success_rate: {
              $cond: [
                { $eq: [{ $add: ["$safe_success", "$safe_fail"] }, 0] },
                50, // Default 50% for fresh proxies
                { $multiply: [{ $divide: ["$safe_success", { $add: ["$safe_success", "$safe_fail"] }] }, 100] }
              ]
            },
            // Calculate Usage Fairness (Inverse: Less used = Higher score)
            // Logic: 100 / (usage_count + 1)
            // Usage 0 = 100 pts, Usage 9 = 10 pts
            calc_fairness: {
              $multiply: [{ $divide: [1, { $add: ["$safe_usage", 1] }] }, 100]
            }
          }
        },
        
        {
          $addFields: {
            // 🔥 FINAL COMPOSITE SCORE
            // Weights: Health 40%, Success 40%, Fairness 20%
            final_score: {
              $add: [
                { $multiply: ["$safe_health", preferHighQuality ? 0.6 : 0.4] },
                { $multiply: ["$calc_success_rate", preferHighQuality ? 0.3 : 0.4] },
                { $multiply: ["$calc_fairness", preferHighQuality ? 0.1 : 0.2] }
              ]
            }
          }
        },
        
        { $sort: { final_score: -1 } }, // Highest score first
        { $limit: 1 } // Pick THE BEST
      ];

      const result = await proxiesCollection.aggregate(pipeline).toArray();

      if (!result || result.length === 0) {
        return null;
      }

      const best = result[0];

      // Return standardized proxy object
      return {
        _id: best._id,
        host: best.host,
        port: best.port,
        user: best.user,
        pass: best.pass,
        protocol: best.protocol || 'socks5',
        region: best.region,
        country: best.country,
        timezone: best.timezone,
        locale: best.locale,
        latency: best.latency,
        health_quality: best.health_quality,
        usage_count: best.usage_count,
        status: best.status,
        // Debug scoring info
        _score: parseFloat(best.final_score.toFixed(2)),
        _breakdown: {
          health: best.safe_health,
          successRate: parseFloat(best.calc_success_rate.toFixed(2)),
          usageFairness: parseFloat(best.calc_fairness.toFixed(2))
        }
      };

    } catch (error) {
      console.error('[ProxyQualityManager] Aggregation Error:', error.message);
      throw error;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * ✅ UPDATE: MARK SUCCESS
   * ═══════════════════════════════════════════════════════════════
   */
  async markProxySuccess(proxyId, latency) {
    try {
      const database = db();
      const proxiesCollection = database.collection('proxies');
      const { ObjectId } = require('mongodb');

      const healthScore = this.calculateHealthScore(latency);

      const updates = {
        $inc: {
          success_count: 1,
          usage_count: 1 // 🔥 Increment usage for fairness balancing
        },
        $set: {
          latency: latency,
          health_quality: healthScore,
          last_used: new Date(),
          updated_at: new Date(),
          status: 'live' // Restore to live if was testing
        }
      };

      await proxiesCollection.updateOne(
        { _id: new ObjectId(proxyId) },
        updates
      );

      return { updated: true, healthScore };

    } catch (error) {
      console.error('[ProxyQualityManager] markProxySuccess error:', error.message);
      throw error;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════
   * ✅ UPDATE: MARK FAILED
   * ═══════════════════════════════════════════════════════════════
   */
  async markProxyFailed(proxyId, latency = null) {
    try {
      const database = db();
      const proxiesCollection = database.collection('proxies');
      const { ObjectId } = require('mongodb');

      const updates = {
        $inc: { 
            fail_count: 1,
            usage_count: 1 // Even failures count as usage
        },
        $set: {
          last_used: new Date(),
          updated_at: new Date()
        }
      };

      // Update latency if available (e.g. timeout = 15000ms)
      if (latency !== null) {
        updates.$set.latency = latency;
        updates.$set.health_quality = this.calculateHealthScore(latency);
      } else {
        // Decrease health slightly on hard failure
        updates.$mul = { health_quality: 0.8 }; 
      }

      await proxiesCollection.updateOne(
        { _id: new ObjectId(proxyId) },
        updates
      );

      // Check Quarantine Logic
      const proxy = await proxiesCollection.findOne({ _id: new ObjectId(proxyId) });
      let quarantined = false;

      if (proxy && proxy.fail_count >= this.maxFailBeforeQuarantine) {
        await proxiesCollection.updateOne(
          { _id: new ObjectId(proxyId) },
          { $set: { status: 'quarantine' } }
        );
        quarantined = true;
      }

      return { updated: true, quarantined, failCount: proxy ? proxy.fail_count : 0 };

    } catch (error) {
      console.error('[ProxyQualityManager] markProxyFailed error:', error.message);
      throw error;
    }
  }

  /**
   * Update proxy latency from external test (e.g. Checker)
   */
  async updateLatency(proxyId, latency) {
    try {
      const database = db();
      const proxiesCollection = database.collection('proxies');
      const { ObjectId } = require('mongodb');

      const healthScore = this.calculateHealthScore(latency);

      await proxiesCollection.updateOne(
        { _id: new ObjectId(proxyId) },
        {
          $set: {
            latency: latency,
            health_quality: healthScore,
            last_test: new Date(),
            updated_at: new Date()
          }
        }
      );

      return { updated: true, healthScore };

    } catch (error) {
      console.error('[ProxyQualityManager] updateLatency error:', error.message);
      throw error;
    }
  }

  /**
   * Get proxy statistics for dashboard
   */
  async getStats() {
    try {
      const database = db();
      const proxiesCollection = database.collection('proxies');

      const [total, live, quarantine, blacklisted, untested, inUse] = await Promise.all([
        proxiesCollection.countDocuments({}),
        proxiesCollection.countDocuments({ status: 'live' }),
        proxiesCollection.countDocuments({ status: 'quarantine' }),
        proxiesCollection.countDocuments({ status: 'blacklisted' }),
        proxiesCollection.countDocuments({ health_quality: null }),
        proxiesCollection.countDocuments({ in_use: true })
      ]);

      return {
        total,
        live,
        quarantine,
        blacklisted,
        untested,
        inUse,
        available: live + untested - inUse // Real available pool
      };

    } catch (error) {
      console.error('[ProxyQualityManager] getStats error:', error.message);
      throw error;
    }
  }
}

// 🔥 EXPORT SINGLETON INSTANCE
module.exports = new ProxyQualityManager();