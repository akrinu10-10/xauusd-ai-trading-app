import { StyleSheet, Text, View } from "react-native";
import { PaperPosition } from "../db/database";

interface Props {
  position: PaperPosition | null;
}

const formatPrice = (price: number) =>
  price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });

export function PaperPositionCard({ position }: Props) {
  if (!position) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Simulasi posisi</Text>
        <Text style={styles.muted}>Belum ada setup dari AI.</Text>
      </View>
    );
  }

  const statusLabel =
    position.status === "pending"
      ? "MENUNGGU ENTRY"
      : position.status === "open"
        ? "TERBUKA"
        : position.status === "cancelled"
          ? "DIBATALKAN"
          : position.status === "expired"
            ? "KEDALUWARSA"
            : "DITUTUP";
  const statusColor =
    position.status === "closed"
      ? position.close_reason === "take_profit"
        ? "#26a69a"
        : "#ef5350"
      : position.status === "open"
        ? "#26a69a"
        : position.status === "expired" || position.status === "cancelled"
          ? "#9aa0a6"
          : "#f0b429";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Simulasi {position.direction.toUpperCase()}
        </Text>
        <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <View style={styles.levels}>
        <Text style={styles.level}>Entry {formatPrice(position.entry)}</Text>
        <Text style={styles.level}>SL {formatPrice(position.stop_loss)}</Text>
        <Text style={styles.level}>TP {formatPrice(position.take_profit)}</Text>
      </View>
      {position.status === "closed" && position.exit_price !== null && (
        <Text style={styles.muted}>
          Keluar di {formatPrice(position.exit_price)} ·{" "}
          {position.close_reason === "take_profit" ? "Take Profit" : "Stop Loss"}
        </Text>
      )}
      {position.status === "expired" && (
        <Text style={styles.muted}>Setup tidak tersentuh dalam 2 jam.</Text>
      )}
      <Text style={styles.reasoning} numberOfLines={2}>
        {position.reasoning}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1a1d24",
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    color: "#d1d4dc",
    fontSize: 14,
    fontWeight: "700",
  },
  status: {
    fontSize: 11,
    fontWeight: "700",
  },
  levels: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  level: {
    color: "#d1d4dc",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  muted: {
    color: "#9aa0a6",
    fontSize: 12,
  },
  reasoning: {
    color: "#9aa0a6",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
  },
});
