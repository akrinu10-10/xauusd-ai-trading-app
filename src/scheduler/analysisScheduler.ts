// analysisScheduler.ts
// Menyatukan twelveDataService, indicatorEngine, geminiService, dan database
// jadi satu siklus analisa yang jalan tiap 15 menit.

import {
  getLatestAnalysis,
  getLatestCandles,
  saveAnalysisResult,
  saveCandles,
} from "../db/database";
import {
  GeminiAnalysisResult,
  GeminiService,
  IndicatorSummaryInput,
} from "../services/geminiService";
import { buildIndicatorSnapshot } from "../services/indicatorEngine";
import { Candle, TwelveDataService } from "../services/twelveDataService";

const SYMBOL = "XAU/USD";
const INTERVAL = "15min";
const INTERVAL_LABEL = "M15";
const CYCLE_MS = 15 * 60 * 1000; // 15 menit
const CANDLES_FOR_INDICATORS = 60; // cukup untuk ADX(14) & BB(20) yang stabil

export class AnalysisScheduler {
  private twelveData: TwelveDataService;
  private gemini: GeminiService;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private onCycleComplete?: (result: GeminiAnalysisResult) => void;
  private onErrorCallback?: (err: Error) => void;

  constructor(twelveDataApiKey: string, geminiApiKey: string) {
    this.twelveData = new TwelveDataService(twelveDataApiKey);
    this.gemini = new GeminiService(geminiApiKey);
  }

  /** Daftarkan callback yang dipanggil tiap siklus selesai, untuk refresh UI. */
  onCycle(callback: (result: GeminiAnalysisResult) => void): void {
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
    await this.catchUpIfNeeded();

    if (this.timer) return; // sudah jalan, jangan dobel

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
    await this.catchUpIfNeeded();
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
   * 3. Hitung indikator dari candle yang tersimpan
   * 4. Kirim ringkasan ke Gemini, minta analisa terstruktur
   * 5. Simpan hasil analisa
   * 6. Beri tahu UI lewat callback
   *
   * PERBAIKAN: sekarang tidak pernah throw ke pemanggil — semua error
   * ditangkap dan dialirkan lewat onErrorCallback, supaya UI bisa tahu.
   */
  async runCycle(): Promise<void> {
    if (this.isRunning) return; // cegah tumpang tindih kalau siklus sebelumnya belum selesai
    this.isRunning = true;

    try {
      const candles: Candle[] = await this.twelveData.getXauUsdCandles(
        INTERVAL,
        CANDLES_FOR_INDICATORS
      );
      await saveCandles(SYMBOL, INTERVAL, candles);

      const storedCandles = await getLatestCandles(SYMBOL, INTERVAL, CANDLES_FOR_INDICATORS);

      // PERBAIKAN: guard sebelum akses index terakhir.
      if (storedCandles.length === 0) {
        throw new Error("Belum ada candle tersimpan untuk dianalisa.");
      }

      const snapshot = buildIndicatorSnapshot(storedCandles);
      const lastClose = storedCandles[storedCandles.length - 1].close;

      const summaryInput: IndicatorSummaryInput = {
        symbol: SYMBOL,
        intervalLabel: INTERVAL_LABEL,
        lastClose,
        adx: snapshot.adx,
        atr: snapshot.atr,
        bbUpper: snapshot.bbUpper,
        bbMiddle: snapshot.bbMiddle,
        bbLower: snapshot.bbLower,
        bbWidthPercent: snapshot.bbWidthPercent,
        regime: snapshot.regime,
      };

      const result = await this.gemini.analyze(summaryInput);
      const cycleTime = new Date().toISOString();
      await saveAnalysisResult(SYMBOL, cycleTime, result);

      this.onCycleComplete?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("Siklus analisa gagal:", error);
      this.onErrorCallback?.(error);
    } finally {
      this.isRunning = false;
    }
  }
}