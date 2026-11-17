// analysisScheduler.ts
// Menyatukan twelveDataService, indicatorEngine, geminiService, dan database
// jadi satu siklus analisa yang jalan tiap 15 menit.

import { TwelveDataService, Candle } from "../services/twelveDataService";
import {
  GeminiService,
  IndicatorSummaryInput,
  GeminiAnalysisResult,
} from "../services/geminiService";
import { buildIndicatorSnapshot } from "../services/indicatorEngine";
import {
  saveCandles,
  getLatestCandles,
  saveAnalysisResult,
  getLatestAnalysis,
} from "../db/database";

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

  constructor(twelveDataApiKey: string, geminiApiKey: string) {
    this.twelveData = new TwelveDataService(twelveDataApiKey);
    this.gemini = new GeminiService(geminiApiKey);
  }

  /** Daftarkan callback yang dipanggil tiap siklus selesai, untuk refresh UI. */
  onCycle(callback: (result: GeminiAnalysisResult) => void): void {
    this.onCycleComplete = callback;
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
      this.runCycle().catch((err) => console.error("Siklus analisa gagal:", err));
    }, CYCLE_MS);
  }

  /** Hentikan scheduler, panggil saat ChartScreen unmount. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
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
   * 3. Hitung indikator dari candle yang tersimpan
   * 4. Kirim ringkasan ke Gemini, minta analisa terstruktur
   * 5. Simpan hasil analisa
   * 6. Beri tahu UI lewat callback
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
    } finally {
      this.isRunning = false;
    }
  }
}
