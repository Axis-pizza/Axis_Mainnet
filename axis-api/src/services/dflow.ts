// axis-api/src/services/dflow.ts

const DFLOW_API_BASE = "https://d.prediction-markets-api.dflow.net";

export interface DFlowTokenInfo {
  mint: string;
  symbol: string;
  name: string;
  image: string;
  side: 'YES' | 'NO';
  eventId: string;
  eventTitle: string;
  marketId: string;
  marketTitle: string;
  expiry: string;
  price?: number; // ★ ここを追加
}

export class DFlowService {
  static async getActiveMarketTokens(apiKey: string): Promise<DFlowTokenInfo[]> {
    if (!apiKey) {
      console.warn("⚠️ DFLOW_API_KEY is not set.");
      return [];
    }

    try {
      const url = `${DFLOW_API_BASE}/api/v1/events?withNestedMarkets=true&status=active&limit=100`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`DFlow API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const events = data.events || [];
      const tokens: DFlowTokenInfo[] = [];

      for (const event of events) {
        if (!event.markets) continue;

        for (const market of event.markets) {
          // ★ YES/NO の現在価格(Mid Price)を計算
          const yesBid = market.yesBid ? parseFloat(market.yesBid) : null;
          const yesAsk = market.yesAsk ? parseFloat(market.yesAsk) : null;
          let yesPrice = 0.5; // デフォルト50%
          if (yesBid !== null && yesAsk !== null) yesPrice = (yesBid + yesAsk) / 2;
          else if (yesBid !== null) yesPrice = yesBid;
          else if (yesAsk !== null) yesPrice = yesAsk;

          const noBid = market.noBid ? parseFloat(market.noBid) : null;
          const noAsk = market.noAsk ? parseFloat(market.noAsk) : null;
          let noPrice = 0.5;
          if (noBid !== null && noAsk !== null) noPrice = (noBid + noAsk) / 2;
          else if (noBid !== null) noPrice = noBid;
          else if (noAsk !== null) noPrice = noAsk;

          const accounts = market.accounts ? Object.values(market.accounts) : [];
          
          for (const account of accounts as any[]) {
             const eventImage = event.imageUrl || "";
             const expiry = market.expirationTime
               ? new Date(market.expirationTime * 1000).toISOString()
               : "";

             // YES Token
             if (account.yesMint) {
               tokens.push({
                 mint: account.yesMint,
                 symbol: "YES",
                 name: `YES: ${market.title}`,
                 image: eventImage,
                 side: 'YES',
                 eventId: event.ticker,
                 eventTitle: event.title,
                 marketId: market.ticker,
                 marketTitle: market.title,
                 expiry,
                 price: yesPrice, // ★ 計算した価格をセット
               });
             }

             // NO Token
             if (account.noMint) {
               tokens.push({
                 mint: account.noMint,
                 symbol: "NO",
                 name: `NO: ${market.title}`,
                 image: eventImage,
                 side: 'NO',
                 eventId: event.ticker,
                 eventTitle: event.title,
                 marketId: market.ticker,
                 marketTitle: market.title,
                 expiry,
                 price: noPrice, // ★ 計算した価格をセット
               });
             }
          }
        }
      }

      return tokens;
    } catch (error) {
      console.error("Failed to fetch DFlow markets:", error);
      return [];
    }
  }
}