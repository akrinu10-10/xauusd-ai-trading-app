// ChartWebView.tsx
// Wrapper WebView yang merender CHART_HTML dan menerima update candle
// dari parent (ChartScreen) lewat ref, memakai postMessage.

import { forwardRef, useImperativeHandle, useRef } from "react";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { CHART_HTML } from "../assets/chartHtml";
import { PaperPosition } from "../db/database";
import { Candle } from "../services/twelveDataService";
import { TypedWebView } from "./TypedWebView";

export interface ChartWebViewHandle {
  setCandles: (candles: Candle[]) => void;
  setPositionLines: (position: PaperPosition | null) => void;
}

interface Props {
  onReady?: () => void;
}

/** Ubah "2026-11-17 10:15:00" (format Twelve Data) jadi unix timestamp detik (UTC). */
function toUnixSeconds(datetime: string): number {
  return Math.floor(new Date(datetime.replace(" ", "T") + "Z").getTime() / 1000);
}

export const ChartWebView = forwardRef<ChartWebViewHandle, Props>(function ChartWebView(
  { onReady },
  ref
) {
  const webViewRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    setCandles(candles: Candle[]) {
      const payload = {
        type: "SET_CANDLES",
        candles: candles.map((c) => ({
          time: toUnixSeconds(c.datetime),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      };
      webViewRef.current?.postMessage(JSON.stringify(payload));
    },
    setPositionLines(position: PaperPosition | null) {
      webViewRef.current?.postMessage(
        JSON.stringify({
          type: "SET_POSITION_LINES",
          position:
            position &&
            (position.status === "pending" || position.status === "open")
              ? {
                  entry: position.entry,
                  stopLoss: position.stop_loss,
                  takeProfit: position.take_profit,
                }
              : null,
        })
      );
    },
  }));

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload.type === "CHART_READY") {
        onReady?.();
      }
    } catch {
      // Abaikan pesan yang tidak dikenali.
    }
  }

  return (
    <TypedWebView
      ref={webViewRef}
      originWhitelist={["*"]}
      source={{ html: CHART_HTML }}
      onMessage={handleMessage}
      javaScriptEnabled
      style={{ flex: 1, backgroundColor: "#111317" }}
    />
  );
});
