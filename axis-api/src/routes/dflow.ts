// axis-api/src/routes/dflow.ts
import { Hono } from 'hono';
import { Bindings } from '../config/env';
import { DFlowService } from '../services/dflow';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/markets', async (c) => {
  try {
    // c.env.DFLOW_API_KEY を引数に渡す
    const tokens = await DFlowService.getActiveMarketTokens(c.env.DFLOW_API_KEY);
    
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ tokens });
  } catch (error) {
    console.error("Route Error:", error);
    return c.json({ error: 'Failed to fetch prediction markets' }, 500);
  }
});

app.get('/quotes', async (c) => {
  try {
    const mintsStr = c.req.query('mints');
    if (!mintsStr) {
      return c.json({ error: 'mints parameter is required' }, 400);
    }

    const mints = mintsStr.split(',');
    const apiKey = c.env.DFLOW_API_KEY;

    // サービスを呼び出して価格マップを取得
    const prices = await DFlowService.getTokenPrices(mints, apiKey);
    
    // 短めのキャッシュ（10秒等）をかけると価格更新の鮮度と負荷のバランスが良くなります
    c.header('Cache-Control', 'public, max-age=10');
    return c.json({ prices });

  } catch (error) {
    console.error("DFlow Quote Route Error:", error);
    return c.json({ error: 'Failed to fetch quotes' }, 500);
  }
});

export default app;