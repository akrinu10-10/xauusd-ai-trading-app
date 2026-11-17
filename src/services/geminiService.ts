// geminiService.ts
// Memanggil Gemini API untuk analisa naratif berdasarkan ringkasan indikator.
// Dipanggil tiap siklus 15 menit oleh analysisScheduler, bukan tiap candle.

// Cek nama model aktif & free tier-nya di aistudio.google.com sebelum deploy —
// penamaan model Gemini berubah dari waktu ke waktu.
const GEMINI_MODEL = "gemini-flash-lite-latest";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface IndicatorSummaryInput {
  symbol: string;
  intervalLabel: string; // contoh: "M15"
  lastClose: number;
  adx: number;
  atr: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidthPercent: number;
  regime: string;
}

export interface GeminiAnalysisResult {
  trend: "uptrend" | "downtrend" | "sideways";
  can_open: boolean;
  direction: "buy" | "sell" | "none";
  confidence: "low" | "medium" | "high";
  reasoning: string;
}

export class GeminiError extends Error {}

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

  async analyze(input: IndicatorSummaryInput): Promise<GeminiAnalysisResult> {
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
          },
        }),
      });
    } catch (err) {
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

  private buildPrompt(input: IndicatorSummaryInput): string {
    return `Kamu analis teknikal untuk ${input.symbol}. Jawab HANYA dalam JSON valid, tanpa teks lain, tanpa markdown code fence.
Schema: { "trend": "uptrend|downtrend|sideways", "can_open": true|false, "direction": "buy|sell|none", "confidence": "low|medium|high", "reasoning": "string singkat dalam Bahasa Indonesia" }

Data ${input.intervalLabel} terbaru untuk ${input.symbol}:
- Harga penutupan terakhir: ${input.lastClose}
- ADX: ${input.adx.toFixed(2)} (regime saat ini: ${input.regime})
- ATR: ${input.atr.toFixed(2)}
- Bollinger Band: upper=${input.bbUpper.toFixed(2)}, middle=${input.bbMiddle.toFixed(2)}, lower=${input.bbLower.toFixed(2)}, width=${input.bbWidthPercent.toFixed(2)}%

Analisa tren saat ini berdasarkan data di atas, tentukan apakah ini momen yang masuk akal untuk membuka posisi, dan jelaskan alasannya secara singkat dan konkret (sebutkan indikator mana yang mendukung kesimpulanmu).`;
  }

  private parseResult(text: string): GeminiAnalysisResult {
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new GeminiError(`Gagal parsing JSON dari Gemini: ${text}`);
    }

    const validTrends = ["uptrend", "downtrend", "sideways"];
    const validDirections = ["buy", "sell", "none"];
    const validConfidence = ["low", "medium", "high"];

    if (
      !validTrends.includes(parsed.trend) ||
      typeof parsed.can_open !== "boolean" ||
      !validDirections.includes(parsed.direction) ||
      !validConfidence.includes(parsed.confidence) ||
      typeof parsed.reasoning !== "string"
    ) {
      throw new GeminiError(`Format hasil Gemini tidak sesuai schema: ${text}`);
    }

    return parsed as GeminiAnalysisResult;
  }
}
