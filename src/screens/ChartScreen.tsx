// ChartScreen.tsx
// Layar utama: chart XAUUSD + panel hasil analisa AI.
// Menyatukan AnalysisScheduler, database, ChartWebView, dan AnalysisCard.

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
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
  const [latestAnalysis, setLatestAnalysis] = useState<
    (GeminiAnalysisResult & { cycle_time: string }) | null
  >(null);
  const [chartReady, setChartReady] = useState(false);

  // Mulai scheduler sekali saat layar dibuka, hentikan saat layar ditutup.
  useEffect(() => {
    const scheduler = new AnalysisScheduler(twelveDataApiKey, geminiApiKey);

    scheduler.onCycle(async (result) => {
      setLatestAnalysis({ ...result, cycle_time: new Date().toISOString() });
      await refreshChart();
    });

    scheduler.start().catch((err) => console.error("Gagal mulai scheduler:", err));

    loadInitialData();

    return () => scheduler.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Begitu WebView siap, kirim candle yang sudah tersimpan di SQLite (kalau ada).
  useEffect(() => {
    if (chartReady) {
      refreshChart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady]);

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
});
