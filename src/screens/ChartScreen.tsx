// ChartScreen.tsx
// Layar utama: chart XAUUSD + panel hasil analisa AI.
// Menyatukan AnalysisScheduler, database, ChartWebView, dan AnalysisCard.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AnalysisCard } from "../components/AnalysisCard";
import { ChartWebView, ChartWebViewHandle } from "../components/ChartWebView";
import { PaperPositionCard } from "../components/PaperPositionCard";
import {
  getLatestAnalysis,
  getLatestCandles,
  PaperPosition,
} from "../db/database";
import { AnalysisScheduler } from "../scheduler/analysisScheduler";
import { GeminiAnalysisResult } from "../services/geminiService";
import { PaperTradingService } from "../services/paperTradingService";

const SYMBOL = "XAU/USD";
const INTERVAL = "15min";
const POSITION_POLL_MS = 60 * 1000;

interface Props {
  // Diambil dari secure storage (expo-secure-store) di layar Settings,
  // bukan dihardcode di sini.
  twelveDataApiKey: string;
  geminiApiKey: string;
}

export function ChartScreen({ twelveDataApiKey, geminiApiKey }: Props) {
  const chartRef = useRef<ChartWebViewHandle>(null);
  const schedulerRef = useRef<AnalysisScheduler | null>(null);
  const paperTradingRef = useRef<PaperTradingService | null>(null);
  const positionRef = useRef<PaperPosition | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<
    (GeminiAnalysisResult & { cycle_time: string }) | null
  >(null);
  const [paperPosition, setPaperPosition] = useState<PaperPosition | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshChart = useCallback(async () => {
    try {
      const candles = await getLatestCandles(SYMBOL, INTERVAL, 100);
      chartRef.current?.setCandles(candles);
    } catch (err) {
      setLastError(
        err instanceof Error
          ? err.message
          : "Gagal memuat data chart dari penyimpanan lokal."
      );
    }
  }, []);

  const refreshPosition = useCallback(async (monitor = false) => {
    const service = paperTradingRef.current;
    if (!service) return;

    try {
      const currentPosition = monitor
        ? await service.monitorPosition(SYMBOL)
        : await service.getLatestPosition(SYMBOL);
      positionRef.current = currentPosition;
      setPaperPosition(currentPosition);
      chartRef.current?.setPositionLines(currentPosition);
    } catch (err) {
      setLastError(
        err instanceof Error
          ? err.message
          : "Gagal memantau simulasi posisi."
      );
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    const scheduler = schedulerRef.current;
    if (!scheduler) {
      setLastError("Scheduler analisa belum siap.");
      return;
    }
    if (scheduler.isBusy) {
      setLastError("Analisa sedang berjalan. Tunggu sampai selesai.");
      return;
    }

    setIsRefreshing(true);
    await scheduler.runCycle();
    await refreshChart();
    await refreshPosition(false);
    setIsRefreshing(false);
  }, [refreshChart, refreshPosition]);

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
      await refreshPosition(false);
    });

    // PERBAIKAN: alirkan error dari scheduler ke UI.
    scheduler.onError((err) => {
      setLastError(err.message);
      setIsRefreshing(false);
      void refreshChart();
    });

    void scheduler.start();

    return () => {
      scheduler.stop();
      schedulerRef.current = null;
    };
  }, [twelveDataApiKey, geminiApiKey, refreshChart, refreshPosition]);

  useEffect(() => {
    const service = new PaperTradingService(twelveDataApiKey);
    paperTradingRef.current = service;
    let active = true;
    let monitoring = false;

    const updatePosition = (position: PaperPosition | null) => {
      positionRef.current = position;
      setPaperPosition(position);
      chartRef.current?.setPositionLines(position);
    };

    const monitor = async () => {
      if (monitoring) return;
      monitoring = true;
      try {
        const position = await service.monitorPosition(SYMBOL);
        if (active) updatePosition(position);
      } catch (err) {
        if (active) {
          setLastError(
            err instanceof Error
              ? err.message
              : "Gagal memantau simulasi posisi."
          );
        }
      } finally {
        monitoring = false;
      }
    };

    service
      .getLatestPosition(SYMBOL)
      .then((position) => {
        if (active) updatePosition(position);
        if (
          active &&
          position &&
          (position.status === "pending" || position.status === "open") &&
          AppState.currentState === "active"
        ) {
          void monitor();
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setLastError(
            err instanceof Error
              ? err.message
              : "Gagal memuat simulasi posisi."
          );
        }
      });

    const timer = setInterval(() => {
      if (AppState.currentState === "active") {
        void monitor();
      }
    }, POSITION_POLL_MS);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void monitor();
      }
    });

    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
      if (paperTradingRef.current === service) {
        paperTradingRef.current = null;
      }
    };
  }, [twelveDataApiKey]);

  useEffect(() => {
    let active = true;

    getLatestAnalysis(SYMBOL)
      .then((analysis) => {
        if (active && analysis) setLatestAnalysis(analysis);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLastError(
          err instanceof Error
            ? err.message
            : "Gagal memuat riwayat analisa dari penyimpanan lokal."
        );
      });

    return () => {
      active = false;
    };
  }, [twelveDataApiKey, geminiApiKey]);

  // Saat app kembali ke foreground, cek apakah siklus analisa tertinggal.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        schedulerRef.current?.resume();
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.chartContainer}>
        <ChartWebView
          ref={chartRef}
          onReady={() => {
            void refreshChart();
            chartRef.current?.setPositionLines(positionRef.current);
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh candle dan analisis AI"
          style={[styles.refreshButton, isRefreshing && styles.refreshButtonBusy]}
          onPress={() => void handleManualRefresh()}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#0b0d11" />
          ) : (
            <Text style={styles.refreshButtonText}>Refresh + AI</Text>
          )}
        </Pressable>
      </View>
      {lastError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{lastError}</Text>
        </View>
      )}
      <PaperPositionCard position={paperPosition} />
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
    position: "relative",
  },
  refreshButton: {
    position: "absolute",
    top: 12,
    right: 12,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#26a69a",
    elevation: 3,
  },
  refreshButtonBusy: {
    minWidth: 112,
    opacity: 0.8,
  },
  refreshButtonText: {
    color: "#0b0d11",
    fontSize: 13,
    fontWeight: "700",
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