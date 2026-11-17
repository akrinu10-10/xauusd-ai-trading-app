// indicatorEngine.ts
// Hitung ADX, ATR, dan Bollinger Band dari candle, lalu klasifikasi regime
// (trending/ranging/squeeze) untuk jadi konteks input prompt Gemini.
//
// Catatan: ADX di sini disederhanakan jadi DX terakhir (bukan DX yang
// di-smooth sepanjang 'period' seperti definisi Wilder penuh) supaya
// perhitungan tetap ringan untuk MVP. Kalau nanti perlu presisi penuh
// seperti versi MQL5 kamu, smoothing DX-nya tinggal ditambahkan.

import { Candle } from "./twelveDataService";

export interface IndicatorSnapshot {
  atr: number;
  adx: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidthPercent: number;
  regime: "trending" | "ranging" | "squeeze";
}

function trueRange(current: Candle, previous: Candle): number {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function average(values: number[]): number {
  return sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function wilderSmooth(values: number[], period: number): number {
  let smoothed = sum(values.slice(0, period));
  for (let i = period; i < values.length; i++) {
    smoothed = smoothed - smoothed / period + values[i];
  }
  return smoothed;
}

/** Average True Range (Wilder smoothing). */
export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) {
    throw new Error(`Butuh minimal ${period + 1} candle untuk hitung ATR.`);
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trueRanges.push(trueRange(candles[i], candles[i - 1]));
  }

  let atr = average(trueRanges.slice(0, period));
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}

/** Average Directional Index (disederhanakan, lihat catatan di atas). */
export function calculateADX(candles: Candle[], period: number = 14): number {
  if (candles.length < period * 2) {
    throw new Error(`Butuh minimal ${period * 2} candle untuk hitung ADX yang stabil.`);
  }

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(trueRange(candles[i], candles[i - 1]));
  }

  const smoothedTR = wilderSmooth(tr, period);
  const smoothedPlusDM = wilderSmooth(plusDM, period);
  const smoothedMinusDM = wilderSmooth(minusDM, period);

  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;

  return (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
}

/** Bollinger Bands dari harga close. */
export function calculateBollingerBands(
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2
) {
  if (candles.length < period) {
    throw new Error(`Butuh minimal ${period} candle untuk hitung Bollinger Band.`);
  }

  const closes = candles.slice(-period).map((c) => c.close);
  const middle = average(closes);
  const variance = average(closes.map((c) => (c - middle) ** 2));
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;
  const widthPercent = ((upper - lower) / middle) * 100;

  return { upper, middle, lower, widthPercent };
}

/**
 * Snapshot lengkap indikator + klasifikasi regime sederhana.
 * Threshold (25 untuk ADX, 1.5% untuk BB width) adalah titik awal —
 * sesuaikan setelah lihat perilaku XAUUSD di jam tradingmu.
 */
export function buildIndicatorSnapshot(candles: Candle[]): IndicatorSnapshot {
  const atr = calculateATR(candles);
  const adx = calculateADX(candles);
  const bb = calculateBollingerBands(candles);

  let regime: IndicatorSnapshot["regime"] = "ranging";
  if (adx > 25) {
    regime = "trending";
  } else if (bb.widthPercent < 1.5) {
    regime = "squeeze";
  }

  return {
    atr,
    adx,
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
    bbWidthPercent: bb.widthPercent,
    regime,
  };
}
