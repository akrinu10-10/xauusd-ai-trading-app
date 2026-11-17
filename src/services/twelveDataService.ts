// twelveDataService.ts
// Mengambil data candle XAU/USD dari Twelve Data API (time_series endpoint).
// Dipakai sebagai sumber data harga untuk engine indikator & analisa AI.

const BASE_URL = "https://api.twelvedata.com";

/** Satu candle OHLC, angka sudah di-parse jadi number. */
export interface Candle {
  datetime: string; // ISO-ish string dari Twelve Data, contoh "2026-11-17 10:15:00"
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Bentuk mentah satu candle sebagaimana dikirim Twelve Data (semua string). */
interface RawCandle {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

/**
 * Bentuk mentah response /time_series.
 * Twelve Data mengirim status: "error" + message kalau gagal
 * (misalnya kuota habis atau symbol salah), bukan HTTP error code biasa.
 */
interface TimeSeriesResponse {
  values?: RawCandle[];
  status?: string;
  message?: string;
}

export class TwelveDataError extends Error {}

export class TwelveDataService {
  private readonly apiKey: string;

  /**
   * @param apiKey Jangan hardcode di sini. Simpan lewat react-native-keychain
   * atau expo-secure-store, lalu inject lewat constructor.
   */
  constructor(apiKey: string) {
    if (!apiKey?.trim()) {
      throw new Error("API key Twelve Data belum diisi.");
    }
    this.apiKey = apiKey;
  }

  /**
   * Ambil candle terbaru untuk XAU/USD.
   * @param interval contoh: "15min", "1h", "1day"
   * @param outputSize jumlah candle yang diambil (cukup 50-100 untuk hitung ADX/ATR/BB)
   */
  async getXauUsdCandles(
    interval: string = "15min",
    outputSize: number = 50,
    signal?: AbortSignal
  ): Promise<Candle[]> {
    const url =
      `${BASE_URL}/time_series` +
      `?symbol=XAU/USD` +
      `&interval=${interval}` +
      `&outputsize=${outputSize}` +
      `&apikey=${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (err) {
      throw new TwelveDataError(
        "Gagal menghubungi Twelve Data. Cek koneksi internet."
      );
    }

    const data: TimeSeriesResponse = await response.json();

    if (data.status === "error") {
      throw new TwelveDataError(`Twelve Data error: ${data.message}`);
    }

    if (!data.values) {
      throw new TwelveDataError("Twelve Data tidak mengembalikan data candle.");
    }

    const candles: Candle[] = data.values.map((raw) => ({
      datetime: raw.datetime,
      open: parseFloat(raw.open),
      high: parseFloat(raw.high),
      low: parseFloat(raw.low),
      close: parseFloat(raw.close),
    }));

    // Twelve Data mengembalikan candle terbaru di index 0 (descending).
    // Dibalik di sini supaya urutan kronologis (lama -> baru),
    // lebih gampang dipakai untuk hitung indikator.
    return candles.reverse();
  }
}
