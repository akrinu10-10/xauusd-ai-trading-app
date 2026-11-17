// ChartScreen.tsx
// Layar utama: chart XAUUSD + panel hasil analisa AI.
// Menyatukan AnalysisScheduler, database, ChartWebView, dan AnalysisCard.

import { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { AnalysisCard } from "../components/AnalysisCard";
import { ChartWebView, ChartWebViewHandle } from "../components/ChartWebView";
import { getLatestAnalysis, getLatestCandles } from "../db/database";
import { AnalysisScheduler } from "../scheduler/analysisScheduler";
import { GeminiAnalysisResult } from "../services/geminiService";

const SYMBOL = "XAU/USD";
const INTERVAL = "15min";

interface Props {
  // Diambil dari secure storage (expo-secure-store) di layar Settings,
  // bukan dihardcode di sini.
  twelveDataApiKey: string;
  geminiApiKey: string;
}

export function ChartScreen({ twelveDataApiKey, geminiApiKey }: Props) {
  const chartRef = useRef<ChartWebViewHandle>(null);
  const schedulerRef = useRef<AnalysisScheduler | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<
    (GeminiAnalysisResult & { cycle_time: string }) | null
  >(null);
  const [chartReady, setChartReady] = useState(false);
  // PERBAIKAN: state error supaya user tahu kalau ada yang gagal,
  // bukan cuma diam di "Menunggu analisa pertama..." selamanya.
  const [lastError, setLastError] = useState<string | null>(null);

  // PERBAIKAN: dependency array sekarang [twelveDataApiKey, geminiApiKey]
  // (bukan [] lagi) — supaya kalau user ganti API key di tab Settings lalu
  // balik ke tab ini, scheduler lama dihentikan dan dibuat ulang dengan
  // key yang baru, bukan terus pakai key lama.
  useEffect(() => {
    const scheduler = new AnalysisScheduler(twelveDataApiKey, geminiApiKey);
    schedulerRef.current = scheduler;

    scheduler.onCycle(async (result) => {
      setLatestAnalysis({ ...result, cycle_time: new Date().toISOString() });
      setLastError(null); // siklus berhasil -> bersihkan error lama
      await refreshChart();
    });

    // PERBAIKAN: alirkan error dari scheduler ke UI.
    scheduler.onError((err) => {
      setLastError(err.message);
    });

    scheduler.start();

    loadInitialData();

    return () => {
      scheduler.stop();
      schedulerRef.current = null;
    };
  }, [twelveDataApiKey, geminiApiKey]);

  // Begitu WebView siap, kirim candle yang sudah tersimpan di SQLite (kalau ada).
  useEffect(() => {
    if (chartReady) {
      refreshChart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady]);

  // PERBAIKAN: saat app kembali ke foreground setelah lama di-background,
  // cek manual apakah siklus analisa sudah telat (setInterval bisa tertunda
  // saat OS men-suspend JS timer).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        schedulerRef.current?.resume();
      }
    });
    return () => subscription.remove();
  }, []);

  async function loadInitialData() {
    const analysis = await getLatestAnalysis(SYMBOL);
    if (analysis) setLatestAnalysis(analysis);
  }

  async function refreshChart() {
    const candles = await getLatestCandles(SYMBOL, INTERVAL, 100);
    chartRef.current?.setCandles(candles);
  }

  return (
    <View style={styles.container}>
      <View style={styles.chartContainer}>
        <ChartWebView ref={chartRef} onReady={() => setChartReady(true)} />
      </View>
      {lastError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{lastError}</Text>
        </View>
      )}
      <AnalysisCard result={latestAnalysis} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0d11",
  },
  chartContainer: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: "#3a1a1a",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 13,
  },
});