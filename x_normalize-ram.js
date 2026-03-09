/**
 * normalize-ram.js
 * Rule:
 * - Jika RAM > 8  -> set jadi 8
 * - Jika RAM <= 8 -> tidak diubah (skip)
 *
 * Default field RAM: hardware.ram_gb
 * Bisa override via env RAM_FIELD=ram_db (misalnya)
 */

require("dotenv").config();
const { MongoClient } = require("mongodb");

const MONGODB_URL =
  process.env.MONGODB_URL ||
  process.env.DB_CONNECTION_STRING ||
  process.env.MONGO_URI;

if (!MONGODB_URL) {
  console.error("Missing MongoDB connection string. Set MONGODB_URL (or DB_CONNECTION_STRING / MONGO_URI) in .env");
  process.exit(1);
}

const DB_NAME = process.env.MONGODB_DATABASE; // optional; kalau kosong akan pakai dari URL
const COLLECTION_NAME = "hardware_profiles";

// Field RAM yang mau dinormalisasi
const RAM_FIELD = process.env.RAM_FIELD || "hardware.ram_gb";

// Threshold & normalized value
const MAX_RAM = 8;
const NORMALIZED_RAM = 8;

async function main() {
  const client = new MongoClient(MONGODB_URL, {
    // opsional, tapi aman
    maxPoolSize: 10,
  });

  try {
    await client.connect();

    const db = DB_NAME ? client.db(DB_NAME) : client.db(); // db() tanpa nama -> pakai yang ada di URL
    const col = db.collection(COLLECTION_NAME);

    // Update hanya dokumen yang RAM_FIELD > 8 (yang <= 8 otomatis skip)
    const filter = { [RAM_FIELD]: { $gt: MAX_RAM } };
    const update = { $set: { [RAM_FIELD]: NORMALIZED_RAM } };

    const result = await col.updateMany(filter, update);

    console.log("Done.");
    console.log(`Database   : ${db.databaseName}`);
    console.log(`Collection : ${COLLECTION_NAME}`);
    console.log(`Field      : ${RAM_FIELD}`);
    console.log(`Matched    : ${result.matchedCount}`);
    console.log(`Modified   : ${result.modifiedCount}`);
  } catch (err) {
    console.error("Error:", err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();