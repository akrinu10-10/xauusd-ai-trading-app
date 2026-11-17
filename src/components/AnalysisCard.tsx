// AnalysisCard.tsx
// Menampilkan hasil analisa AI terakhir: trend, bisa open atau tidak, dan alasannya.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { GeminiAnalysisResult } from "../services/geminiService";

interface Props {
  result: (GeminiAnalysisResult & { cycle_time: string }) | null;
}

const trendLabel: Record<GeminiAnalysisResult["trend"], string> = {
  uptrend: "Uptrend",
  downtrend: "Downtrend",
  sideways: "Sideways",
};

const directionColor: Record<GeminiAnalysisResult["direction"], string> = {
  buy: "#26a69a",
  sell: "#ef5350",
  none: "#9aa0a6",
};

export function AnalysisCard({ result }: Props) {
  if (!result) {
    return (
      <View style={styles.card}>
        <Text style={styles.waiting}>Menunggu analisa pertama...</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.trend}>{trendLabel[result.trend]}</Text>
        <Text style={[styles.direction, { color: directionColor[result.direction] }]}>
          {result.can_open ? result.direction.toUpperCase() : "TUNGGU"}
        </Text>
      </View>

      <Text style={styles.confidence}>Keyakinan: {result.confidence}</Text>
      <Text style={styles.reasoning}>{result.reasoning}</Text>
      <Text style={styles.timestamp}>
        Update terakhir: {new Date(result.cycle_time).toLocaleTimeString("id-ID")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1a1d24",
    borderRadius: 12,
    padding: 16,
    margin: 12,
  },
  waiting: {
    color: "#9aa0a6",
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  trend: {
    color: "#d1d4dc",
    fontSize: 18,
    fontWeight: "600",
  },
  direction: {
    fontSize: 16,
    fontWeight: "700",
  },
  confidence: {
    color: "#9aa0a6",
    marginBottom: 6,
  },
  reasoning: {
    color: "#d1d4dc",
    lineHeight: 20,
    marginBottom: 8,
  },
  timestamp: {
    color: "#6b7280",
    fontSize: 12,
  },
});
