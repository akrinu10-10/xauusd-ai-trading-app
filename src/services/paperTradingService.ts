import {
  closePaperPosition,
  expirePaperPosition,
  getActivePaperPosition,
  getLatestPaperPosition,
  markPaperPositionCandleChecked,
  markPaperPositionOpened,
  PaperPosition,
} from "../db/database";
import { TwelveDataService } from "./twelveDataService";

const POSITION_INTERVAL = "1min";
const NORMAL_OUTPUT_SIZE = 3;
const CATCH_UP_OUTPUT_SIZE = 500;
const CATCH_UP_AFTER_MS = 2 * 60 * 1000;
const PENDING_VALIDITY_MS = 8 * 15 * 60 * 1000;

function candleTimeMs(datetime: string): number {
  return new Date(`${datetime.replace(" ", "T")}Z`).getTime();
}

export class PaperTradingService {
  private readonly marketData: TwelveDataService;

  constructor(apiKey: string) {
    this.marketData = new TwelveDataService(apiKey);
  }

  async getLatestPosition(symbol: string): Promise<PaperPosition | null> {
    return getLatestPaperPosition(symbol);
  }

  async monitorPosition(symbol: string): Promise<PaperPosition | null> {
    let position = await getActivePaperPosition(symbol);
    if (!position) {
      return getLatestPaperPosition(symbol);
    }

    const referenceTime = position.last_checked_candle ?? position.created_at;
    const isCatchingUp =
      Date.now() - new Date(referenceTime).getTime() > CATCH_UP_AFTER_MS;
    const candles = await this.marketData.getXauUsdCandles(
      POSITION_INTERVAL,
      isCatchingUp ? CATCH_UP_OUTPUT_SIZE : NORMAL_OUTPUT_SIZE
    );
    const firstEligibleEntryTime =
      Math.floor(new Date(position.created_at).getTime() / 60_000) * 60_000 +
      60_000;

    for (const candle of candles) {
      const currentCandleTime = candleTimeMs(candle.datetime);
      const lastCheckedTime = position.last_checked_candle
        ? candleTimeMs(position.last_checked_candle)
        : -Infinity;

      if (currentCandleTime < lastCheckedTime) continue;

      if (position.status === "pending") {
        if (currentCandleTime < firstEligibleEntryTime) {
          await markPaperPositionCandleChecked(position.id, candle.datetime);
          position = { ...position, last_checked_candle: candle.datetime };
          continue;
        }

        const entryTouched =
          candle.low <= position.entry && candle.high >= position.entry;
        if (!entryTouched) {
          await markPaperPositionCandleChecked(position.id, candle.datetime);
          position = { ...position, last_checked_candle: candle.datetime };
          continue;
        }

        const openedAt = new Date(currentCandleTime).toISOString();
        await markPaperPositionOpened(
          position.id,
          openedAt,
          candle.datetime
        );
        position = {
          ...position,
          status: "open",
          opened_at: openedAt,
          last_checked_candle: candle.datetime,
        };
        continue;
      }

      const openedCandleTime = position.opened_at
        ? Math.floor(new Date(position.opened_at).getTime() / 60_000) * 60_000
        : -Infinity;
      if (currentCandleTime === openedCandleTime) {
        continue;
      }

      const stopTouched =
        position.direction === "buy"
          ? candle.low <= position.stop_loss
          : candle.high >= position.stop_loss;
      const targetTouched =
        position.direction === "buy"
          ? candle.high >= position.take_profit
          : candle.low <= position.take_profit;

      if (stopTouched) {
        const closedAt = new Date(currentCandleTime).toISOString();
        await closePaperPosition(
          position.id,
          closedAt,
          position.stop_loss,
          "stop_loss",
          candle.datetime
        );
        position = {
          ...position,
          status: "closed",
          closed_at: closedAt,
          exit_price: position.stop_loss,
          close_reason: "stop_loss",
          last_checked_candle: candle.datetime,
        };
        break;
      }

      if (targetTouched) {
        const closedAt = new Date(currentCandleTime).toISOString();
        await closePaperPosition(
          position.id,
          closedAt,
          position.take_profit,
          "take_profit",
          candle.datetime
        );
        position = {
          ...position,
          status: "closed",
          closed_at: closedAt,
          exit_price: position.take_profit,
          close_reason: "take_profit",
          last_checked_candle: candle.datetime,
        };
        break;
      }

      await markPaperPositionCandleChecked(position.id, candle.datetime);
      position = { ...position, last_checked_candle: candle.datetime };
    }

    if (
      position.status === "pending" &&
      Date.now() - new Date(position.created_at).getTime() >=
        PENDING_VALIDITY_MS
    ) {
      await expirePaperPosition(position.id, new Date().toISOString());
    }

    return getLatestPaperPosition(symbol);
  }
}
