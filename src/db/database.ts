// database.ts
// Inisialisasi SQLite lokal + fungsi dasar simpan/ambil candle dan hasil analisa AI.
// Pakai expo-sqlite (API async). Tidak perlu server, semua tersimpan di HP.

import * as SQLite from "expo-sqlite";
import { GeminiAnalysisResult } from "../services/geminiService";
import { Candle } from "../services/twelveDataService";

const DB_NAME = "xauusd_analyzer.db";

let dbInstance: SQLite.SQLiteDatabase | null = null;

/** Ambil koneksi database, inisialisasi schema kalau belum ada. */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  await initSchema(dbInstance);
  return dbInstance;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS candles (
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      datetime TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      PRIMARY KEY (symbol, interval, datetime)
    );

    CREATE TABLE IF NOT EXISTS analysis_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      cycle_time TEXT NOT NULL,
      trend TEXT NOT NULL,
      can_open INTEGER NOT NULL,
      direction TEXT NOT NULL,
      confidence TEXT NOT NULL,
      reasoning TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_candles_lookup
      ON candles (symbol, interval, datetime);

    CREATE INDEX IF NOT EXISTS idx_analysis_lookup
      ON analysis_results (symbol, cycle_time);
  `);
}

/**
 * Simpan candle baru. Pakai INSERT OR REPLACE supaya candle yang sama
 * (symbol + interval + datetime) ter-update kalau Twelve Data mengirim ulang
 * candle yang belum final (masih berjalan).
 */
export async function saveCandles(
  symbol: string,
  interval: string,
  candles: Candle[]
): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    for (const candle of candles) {
      await db.runAsync(
        `INSERT OR REPLACE INTO candles
          (symbol, interval, datetime, open, high, low, close)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [symbol, interval, candle.datetime, candle.open, candle.high, candle.low, candle.close]
      );
    }
  });
}

/** Ambil N candle terakhir, urutan kronologis (lama -> baru). */
export async function getLatestCandles(
  symbol: string,
  interval: string,
  limit: number = 100
): Promise<Candle[]> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<Candle>(
    `SELECT datetime, open, high, low, close
     FROM candles
     WHERE symbol = ? AND interval = ?
     ORDER BY datetime DESC
     LIMIT ?`,
    [symbol, interval, limit]
  );

  return rows.reverse();
}

/** Simpan satu hasil analisa AI untuk satu siklus. */
export async function saveAnalysisResult(
  symbol: string,
  cycleTime: string,
  result: GeminiAnalysisResult
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO analysis_results
      (symbol, cycle_time, trend, can_open, direction, confidence, reasoning)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      symbol,
      cycleTime,
      result.trend,
      result.can_open ? 1 : 0,
      result.direction,
      result.confidence,
      result.reasoning,
    ]
  );
}

/** Ambil hasil analisa paling baru untuk ditampilkan di UI. */
export async function getLatestAnalysis(
  symbol: string
): Promise<(GeminiAnalysisResult & { cycle_time: string }) | null> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<any>(
    `SELECT cycle_time, trend, can_open, direction, confidence, reasoning
     FROM analysis_results
     WHERE symbol = ?
     ORDER BY cycle_time DESC
     LIMIT 1`,
    [symbol]
  );

  if (!row) return null;

  return {
    cycle_time: row.cycle_time,
    trend: row.trend,
    can_open: !!row.can_open,
    direction: row.direction,
    confidence: row.confidence,
    reasoning: row.reasoning,
  };
}
