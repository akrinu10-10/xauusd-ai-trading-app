// database.ts
// Inisialisasi SQLite lokal + fungsi dasar simpan/ambil candle dan hasil analisa AI.
// Pakai expo-sqlite (API async). Tidak perlu server, semua tersimpan di HP.

import * as SQLite from "expo-sqlite";
import { Directory, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { GeminiAnalysisResult } from "../services/geminiService";
import { Candle } from "../services/twelveDataService";

const DB_NAME = "xauusd_analyzer.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Ambil koneksi database, inisialisasi schema kalau belum ada. */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    // Keep the database separate from Expo SQLite's default files/SQLite directory.
    const directory =
      Platform.OS === "web"
        ? undefined
        : new Directory(Paths.document, "xauusd-database").uri;

    dbPromise = SQLite.openDatabaseAsync(DB_NAME, {}, directory)
      .then(async (db) => {
        await initSchema(db);
        return db;
      })
      .catch((error: unknown) => {
        dbPromise = null;
        throw error;
      });
  }

  return dbPromise;
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
      reasoning TEXT NOT NULL,
      entry REAL,
      stop_loss REAL,
      take_profit REAL
    );

    CREATE TABLE IF NOT EXISTS paper_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      entry REAL NOT NULL,
      stop_loss REAL NOT NULL,
      take_profit REAL NOT NULL,
      confidence TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      created_at TEXT NOT NULL,
      opened_at TEXT,
      closed_at TEXT,
      exit_price REAL,
      close_reason TEXT,
      last_checked_candle TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_candles_lookup
      ON candles (symbol, interval, datetime);

    CREATE INDEX IF NOT EXISTS idx_analysis_lookup
      ON analysis_results (symbol, cycle_time);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_paper_position
      ON paper_positions (symbol)
      WHERE status IN ('pending', 'open');
  `);

  const analysisColumns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(analysis_results)"
  );
  const existingColumns = new Set(analysisColumns.map((column) => column.name));

  for (const column of ["entry", "stop_loss", "take_profit"]) {
    if (!existingColumns.has(column)) {
      await db.execAsync(`ALTER TABLE analysis_results ADD COLUMN ${column} REAL`);
    }
  }
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
      (symbol, cycle_time, trend, can_open, direction, confidence, reasoning,
       entry, stop_loss, take_profit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      symbol,
      cycleTime,
      result.trend,
      result.can_open ? 1 : 0,
      result.direction,
      result.confidence,
      result.reasoning,
      result.entry,
      result.stop_loss,
      result.take_profit,
    ]
  );
}

export type PaperPositionStatus =
  | "pending"
  | "open"
  | "closed"
  | "cancelled"
  | "expired";
export type PaperPositionCloseReason =
  | "stop_loss"
  | "take_profit"
  | "expired";

export interface PaperPosition {
  id: number;
  symbol: string;
  direction: "buy" | "sell";
  status: PaperPositionStatus;
  entry: number;
  stop_loss: number;
  take_profit: number;
  confidence: string;
  reasoning: string;
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
  exit_price: number | null;
  close_reason: PaperPositionCloseReason | null;
  last_checked_candle: string | null;
}

type TradableAnalysis = GeminiAnalysisResult & {
  can_open: true;
  direction: "buy" | "sell";
  entry: number;
  stop_loss: number;
  take_profit: number;
};

function isTradableAnalysis(
  result: GeminiAnalysisResult
): result is TradableAnalysis {
  if (
    !result.can_open ||
    result.direction === "none" ||
    result.entry === null ||
    result.stop_loss === null ||
    result.take_profit === null ||
    !Number.isFinite(result.entry) ||
    !Number.isFinite(result.stop_loss) ||
    !Number.isFinite(result.take_profit) ||
    result.entry <= 0 ||
    result.stop_loss <= 0 ||
    result.take_profit <= 0
  ) {
    return false;
  }

  return result.direction === "buy"
    ? result.stop_loss < result.entry && result.entry < result.take_profit
    : result.take_profit < result.entry && result.entry < result.stop_loss;
}

/** Sinkronkan posisi simulasi dengan analisis baru, tanpa mengganti posisi terbuka. */
export async function syncPaperPositionWithAnalysis(
  symbol: string,
  result: GeminiAnalysisResult
): Promise<PaperPosition | null> {
  const db = await getDatabase();
  const createdAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    const activePosition = await db.getFirstAsync<{
      id: number;
      status: PaperPositionStatus;
    }>(
      `SELECT id, status FROM paper_positions
       WHERE symbol = ? AND status IN ('pending', 'open')
       LIMIT 1`,
      [symbol]
    );

    if (activePosition?.status === "open") return;

    if (!isTradableAnalysis(result)) {
      if (activePosition?.status === "pending") {
        await db.runAsync(
          `UPDATE paper_positions
           SET status = 'cancelled', closed_at = ?
           WHERE id = ? AND status = 'pending'`,
          [createdAt, activePosition.id]
        );
      }
      return;
    }

    if (activePosition?.status === "pending") {
      await db.runAsync(
        `UPDATE paper_positions
         SET direction = ?, entry = ?, stop_loss = ?, take_profit = ?,
             confidence = ?, reasoning = ?, created_at = ?,
             last_checked_candle = NULL
         WHERE id = ? AND status = 'pending'`,
        [
          result.direction,
          result.entry,
          result.stop_loss,
          result.take_profit,
          result.confidence,
          result.reasoning,
          createdAt,
          activePosition.id,
        ]
      );
      return;
    }

    await db.runAsync(
      `INSERT INTO paper_positions
        (symbol, direction, status, entry, stop_loss, take_profit,
         confidence, reasoning, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      [
        symbol,
        result.direction,
        result.entry,
        result.stop_loss,
        result.take_profit,
        result.confidence,
        result.reasoning,
        createdAt,
      ]
    );
  });

  return getLatestPaperPosition(symbol);
}

export async function getActivePaperPosition(
  symbol: string
): Promise<PaperPosition | null> {
  const db = await getDatabase();
  return db.getFirstAsync<PaperPosition>(
    `SELECT * FROM paper_positions
     WHERE symbol = ? AND status IN ('pending', 'open')
     ORDER BY id DESC
     LIMIT 1`,
    [symbol]
  );
}

export async function getLatestPaperPosition(
  symbol: string
): Promise<PaperPosition | null> {
  const db = await getDatabase();
  return db.getFirstAsync<PaperPosition>(
    `SELECT * FROM paper_positions
     WHERE symbol = ?
     ORDER BY CASE WHEN status IN ('pending', 'open') THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [symbol]
  );
}

export async function markPaperPositionOpened(
  id: number,
  openedAt: string,
  candleDatetime: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE paper_positions
     SET status = 'open', opened_at = ?, last_checked_candle = ?
     WHERE id = ? AND status = 'pending'`,
    [openedAt, candleDatetime, id]
  );
}

export async function markPaperPositionCandleChecked(
  id: number,
  candleDatetime: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE paper_positions SET last_checked_candle = ? WHERE id = ?`,
    [candleDatetime, id]
  );
}

export async function closePaperPosition(
  id: number,
  closedAt: string,
  exitPrice: number,
  closeReason: PaperPositionCloseReason,
  candleDatetime: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE paper_positions
     SET status = 'closed', closed_at = ?, exit_price = ?,
         close_reason = ?, last_checked_candle = ?
     WHERE id = ? AND status = 'open'`,
    [closedAt, exitPrice, closeReason, candleDatetime, id]
  );
}

export async function expirePaperPosition(
  id: number,
  expiredAt: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE paper_positions
     SET status = 'expired', closed_at = ?, close_reason = 'expired'
     WHERE id = ? AND status = 'pending'`,
    [expiredAt, id]
  );
}

/** Ambil hasil analisa paling baru untuk ditampilkan di UI. */
export async function getLatestAnalysis(
  symbol: string
): Promise<(GeminiAnalysisResult & { cycle_time: string }) | null> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<
    GeminiAnalysisResult & { cycle_time: string }
  >(
    `SELECT cycle_time, trend, can_open, direction, confidence, reasoning,
            entry, stop_loss, take_profit
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
    entry: row.entry,
    stop_loss: row.stop_loss,
    take_profit: row.take_profit,
  };
}
