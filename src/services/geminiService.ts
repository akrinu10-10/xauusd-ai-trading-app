// geminiService.ts
// Memanggil Gemini API untuk analisa langsung dari data candle OHLC.
// Dipanggil tiap siklus 15 menit oleh analysisScheduler, bukan tiap candle.

import { Candle } from "./twelveDataService";

// Cek nama model aktif & free tier-nya di aistudio.google.com sebelum deploy —
// penamaan model Gemini berubah dari waktu ke waktu.
const GEMINI_MODEL = "gemini-flash-lite-latest";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const ANALYSIS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    trend: {
      type: "STRING",
      enum: ["uptrend", "downtrend", "sideways"],
    },
    can_open: { type: "BOOLEAN" },
    direction: { type: "STRING", enum: ["buy", "sell", "none"] },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    reasoning: { type: "STRING" },
    entry: { type: "NUMBER", nullable: true },
    stop_loss: { type: "NUMBER", nullable: true },
    take_profit: { type: "NUMBER", nullable: true },
  },
  required: [
    "trend",
    "can_open",
    "direction",
    "confidence",
    "reasoning",
    "entry",
    "stop_loss",
    "take_profit",
  ],
} as const;

export interface MarketAnalysisInput {
  symbol: string;
  intervalLabel: string;
  candles: Candle[];
}

export interface GeminiAnalysisResult {
  trend: "uptrend" | "downtrend" | "sideways";
  can_open: boolean;
  direction: "buy" | "sell" | "none";
  confidence: "low" | "medium" | "high";
  reasoning: string;
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
}

export class GeminiError extends Error {}

function isGeminiAnalysisResult(value: unknown): value is GeminiAnalysisResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const result = value as Record<string, unknown>;
  const validSummary =
    (result.trend === "uptrend" ||
      result.trend === "downtrend" ||
      result.trend === "sideways") &&
    typeof result.can_open === "boolean" &&
    (result.direction === "buy" ||
      result.direction === "sell" ||
      result.direction === "none") &&
    (result.confidence === "low" ||
      result.confidence === "medium" ||
      result.confidence === "high") &&
    typeof result.reasoning === "string";

  if (!validSummary) return false;

  if (!result.can_open) {
    return (
      result.direction === "none" &&
      result.entry === null &&
      result.stop_loss === null &&
      result.take_profit === null
    );
  }

  if (
    result.direction === "none" ||
    typeof result.entry !== "number" ||
    typeof result.stop_loss !== "number" ||
    typeof result.take_profit !== "number" ||
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

export class GeminiService {
  private readonly apiKey: string;

  /**
   * @param apiKey Jangan hardcode. Simpan lewat expo-secure-store.
   */
  constructor(apiKey: string) {
    if (!apiKey?.trim()) {
      throw new Error("API key Gemini belum diisi.");
    }
    this.apiKey = apiKey;
  }

  async analyze(input: MarketAnalysisInput): Promise<GeminiAnalysisResult> {
    const prompt = this.buildPrompt(input);
    const url = `${BASE_URL}/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: ANALYSIS_RESPONSE_SCHEMA,
          },
        }),
      });
    } catch {
      throw new GeminiError("Gagal menghubungi Gemini API. Cek koneksi internet.");
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new GeminiError(`Gemini API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new GeminiError("Respons Gemini kosong atau format tidak terduga.");
    }

    return this.parseResult(text);
  }

  private buildPrompt(input: MarketAnalysisInput): string {
    const candles = input.candles.map(({ datetime, open, high, low, close }) => [
      datetime,
      open,
      high,
      low,
      close,
    ]);

    return `Kamu analis pasar ${input.symbol}. Buat penilaian independen berdasarkan price action dari data OHLC yang diberikan. Tidak ada indikator teknikal yang dihitung aplikasi; gunakan pendekatan analisismu sendiri, tetapi jangan mengklaim data atau berita di luar input.

Data ${input.intervalLabel} disusun dari candle terlama ke terbaru. Setiap candle berupa [waktu, open, high, low, close]:
${JSON.stringify(candles)}

Nilai arah yang mungkin terjadi pada 4-8 candle berikutnya dan tentukan level entry yang layak ditunggu, stop loss, dan take profit berdasarkan struktur harga. Untuk buy, pastikan stop_loss < entry < take_profit. Untuk sell, pastikan take_profit < entry < stop_loss. Jika arah atau level harga tidak jelas, pilih can_open false, direction "none", dan isi entry, stop_loss, take_profit dengan null. Jelaskan konteks dan ketidakpastian. Ini estimasi, bukan kepastian.

Jawab hanya menggunakan JSON sesuai schema yang diberikan, tanpa markdown atau key tambahan. Gunakan tepat nama field dan nilai enum dari schema (trend: uptrend, downtrend, atau sideways; jangan gunakan bullish/bearish). Jika can_open true, entry, stop_loss, take_profit wajib berisi angka dari analisis data. Jika belum ada setup, isi direction dengan none dan ketiga level dengan null.
{"trend":"sideways","can_open":false,"direction":"none","confidence":"low","reasoning":"Arah belum jelas.","entry":null,"stop_loss":null,"take_profit":null}`;
  }

  private parseResult(text: string): GeminiAnalysisResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new GeminiError(`Gagal parsing JSON dari Gemini: ${text}`);
    }

    if (!isGeminiAnalysisResult(parsed)) {
      throw new GeminiError(`Format hasil Gemini tidak sesuai schema: ${text}`);
    }

    return parsed;
  }
}
