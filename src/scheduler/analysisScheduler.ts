// analysisScheduler.ts
// Menyatukan twelveDataService, geminiService, dan database
// jadi satu siklus analisa yang jalan tiap 15 menit.

import {
  getLatestAnalysis,
  getLatestCandles,
  saveAnalysisResult,
  saveCandles,
  syncPaperPositionWithAnalysis,
} from "../db/database";
import {
  GeminiAnalysisResult,
  GeminiService,
} from "../services/geminiService";
import { Candle, TwelveDataService } from "../services/twelveDataService";

const SYMBOL = "XAU/USD";
const INTERVAL = "15min";
const INTERVAL_LABEL = "M15";
const CYCLE_MS = 15 * 60 * 1000; // 15 menit
const CANDLES_FOR_ANALYSIS = 60;

export class AnalysisScheduler {
  private twelveData: TwelveDataService;
  private gemini: GeminiService;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private onCycleComplete?: (
    result: GeminiAnalysisResult
  ) => void | Promise<void>;
  private onErrorCallback?: (err: Error) => void;

  constructor(twelveDataApiKey: string, geminiApiKey: string) {
    this.twelveData = new TwelveDataService(twelveDataApiKey);
    this.gemini = new GeminiService(geminiApiKey);
  }

  get isBusy(): boolean {
    return this.isRunning;
  }

  /** Daftarkan callback yang dipanggil tiap siklus selesai, untuk refresh UI. */
  onCycle(
    callback: (result: GeminiAnalysisResult) => void | Promise<void>
  ): void {
    this.onCycleComplete = callback;
  }

  /** PERBAIKAN: daftarkan callback yang dipanggil kalau satu siklus gagal. */
  onError(callback: (err: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Mulai scheduler: jalankan catch-up dulu (kalau analisa terakhir sudah
   * lewat 15 menit atau belum pernah ada sama sekali), baru set interval rutin.
   * Dipanggil sekali saat ChartScreen mount.
   */
  async start(): Promise<void> {
    if (this.timer) return; // sudah jalan, jangan dobel

    try {
      await this.catchUpIfNeeded();
    } catch (err) {
      this.onErrorCallback?.(
        err instanceof Error ? err : new Error(String(err))
      );
    }

    this.timer = setInterval(() => {
      this.runCycle();
    }, CYCLE_MS);
  }

  /** Hentikan scheduler, panggil saat ChartScreen unmount. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * PERBAIKAN: panggil ini saat app kembali ke foreground (AppState -> "active").
   * setInterval JS bisa tertunda/berhenti efektif saat app lama di background,
   * jadi perlu re-check manual apakah siklus sudah telat.
   */
  async resume(): Promise<void> {
    try {
      await this.catchUpIfNeeded();
    } catch (err) {
      this.onErrorCallback?.(
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }

  /** Dipanggil saat app dibuka kembali setelah sempat tertutup. */
  private async catchUpIfNeeded(): Promise<void> {
    const latest = await getLatestAnalysis(SYMBOL);

    if (!latest) {
      await this.runCycle();
      return;
    }

    const elapsed = Date.now() - new Date(latest.cycle_time).getTime();
    if (elapsed >= CYCLE_MS) {
      await this.runCycle();
    }
  }

  /**
   * Satu siklus penuh:
   * 1. Ambil candle terbaru dari Twelve Data
   * 2. Simpan ke SQLite
   * 3. Kirim data candle mentah ke Gemini untuk dianalisa
   * 4. Simpan hasil analisa
   * 5. Beri tahu UI lewat callback
   *
   * PERBAIKAN: sekarang tidak pernah throw ke pemanggil — semua error
   * ditangkap dan dialirkan lewat onErrorCallback, supaya UI bisa tahu.
   */
  async runCycle(): Promise<boolean> {
    if (this.isRunning) return false;
    this.isRunning = true;

    try {
      const candles: Candle[] = await this.twelveData.getXauUsdCandles(
        INTERVAL,
        CANDLES_FOR_ANALYSIS
      );
      await saveCandles(SYMBOL, INTERVAL, candles);

      const storedCandles = await getLatestCandles(
        SYMBOL,
        INTERVAL,
        CANDLES_FOR_ANALYSIS
      );

      // PERBAIKAN: guard sebelum akses index terakhir.
      if (storedCandles.length === 0) {
        throw new Error("Belum ada candle tersimpan untuk dianalisa.");
      }

      const marketInput = {
        symbol: SYMBOL,
        intervalLabel: INTERVAL_LABEL,
        candles: storedCandles,
      };

      const result = await this.gemini.analyze(marketInput);
      const cycleTime = new Date().toISOString();
      await saveAnalysisResult(SYMBOL, cycleTime, result);
      await syncPaperPositionWithAnalysis(SYMBOL, result);

      await this.onCycleComplete?.(result);
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("Siklus analisa gagal:", error);
      this.onErrorCallback?.(error);
      return false;
    } finally {
      this.isRunning = false;
    }
  }
}