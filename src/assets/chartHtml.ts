// chartHtml.ts
// HTML lengkap untuk candlestick chart XAUUSD via lightweight-charts.
// Diekspos sebagai string (bukan file .html terpisah) supaya tidak perlu
// konfigurasi tambahan di metro.config.js untuk loading asset HTML.

export const CHART_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body { margin: 0; padding: 0; background: #111317; overflow: hidden; }
    #chart { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="chart"></div>
  <script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
  <script>
    const chart = LightweightCharts.createChart(document.getElementById('chart'), {
      layout: { background: { color: '#111317' }, textColor: '#d1d4dc' },
      grid: {
        vertLines: { color: '#1f2330' },
        horzLines: { color: '#1f2330' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    let positionLines = [];

    function setPositionLines(position) {
      positionLines.forEach(function (line) {
        candleSeries.removePriceLine(line);
      });
      positionLines = [];

      if (!position) return;

      positionLines = [
        candleSeries.createPriceLine({
          price: position.entry,
          color: '#42a5f5',
          lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Solid,
          axisLabelVisible: true,
          title: 'ENTRY',
        }),
        candleSeries.createPriceLine({
          price: position.stopLoss,
          color: '#ef5350',
          lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SL',
        }),
        candleSeries.createPriceLine({
          price: position.takeProfit,
          color: '#26a69a',
          lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TP',
        }),
      ];
    }

    window.addEventListener('resize', function () {
      chart.resize(window.innerWidth, window.innerHeight);
    });

    // react-native-webview mengirim pesan lewat dua event berbeda
    // tergantung platform, jadi kita dengarkan keduanya.
    document.addEventListener('message', handleMessage); // Android
    window.addEventListener('message', handleMessage);   // iOS

    function handleMessage(event) {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'SET_CANDLES') {
          candleSeries.setData(payload.candles);
          chart.timeScale().fitContent();
        }

        if (payload.type === 'UPDATE_CANDLE') {
          candleSeries.update(payload.candle);
        }

        if (payload.type === 'SET_POSITION_LINES') {
          setPositionLines(payload.position);
        }
      } catch (err) {
        // Abaikan pesan yang bukan untuk chart ini.
      }
    }

    // Beri tahu React Native kalau chart sudah siap menerima data.
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHART_READY' }));
    }
  </script>
</body>
</html>
`;
