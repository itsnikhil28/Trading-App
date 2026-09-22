import http from 'http';
import { createApp } from '../src/app';
import { store } from '../src/store/memoryStore';
import { wsServer } from '../src/modules/websocket/ws.server';

async function runTests() {
  console.log('🧪 Starting Backend API & Trading Engine Automated Tests...\n');

  const app = createApp();
  const server = http.createServer(app);
  wsServer.initialize(server);

  await new Promise<void>((resolve) => {
    server.listen(4005, () => {
      console.log('Test server running on port 4005');
      resolve();
    });
  });

  const baseUrl = 'http://localhost:4005';
  let accessToken = '';
  let openedPositionId = '';
  let limitOrderId = '';

  const assert = (condition: boolean, msg: string) => {
    if (!condition) {
      console.error(`❌ FAILED: ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
    console.log(`✅ PASSED: ${msg}`);
  };

  try {
    // 1. Healthcheck
    const resHealth = await fetch(`${baseUrl}/api/health`);
    const healthJson = await resHealth.json();
    assert(resHealth.status === 200 && healthJson.status === 'ok', 'GET /api/health returns 200 OK');

    // 2. Auth: Register
    const testEmail = `trader_${Date.now()}@example.com`;
    const resReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!',
        name: 'Pro Trader',
      }),
    });
    const regJson = await resReg.json();
    assert(resReg.status === 201 && !!regJson.data.accessToken, 'POST /api/auth/register creates user & returns tokens');
    accessToken = regJson.data.accessToken;

    // 3. Auth: Login
    const resLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!',
      }),
    });
    const loginJson = await resLogin.json();
    assert(resLogin.status === 200 && !!loginJson.data.accessToken, 'POST /api/auth/login validates credentials & returns tokens');

    // 4. Auth: Me
    const resMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meJson = await resMe.json();
    assert(resMe.status === 200 && meJson.data.email === testEmail, 'GET /api/auth/me returns authenticated user');

    // 5. Markets: List
    const resMarkets = await fetch(`${baseUrl}/api/markets`);
    const marketsJson = await resMarkets.json();
    assert(resMarkets.status === 200 && marketsJson.data.length >= 5, 'GET /api/markets returns ticker list');

    // 6. Markets: Single Symbol
    const resBtc = await fetch(`${baseUrl}/api/markets/BTCUSDT`);
    const btcJson = await resBtc.json();
    assert(resBtc.status === 200 && btcJson.data.symbol === 'BTCUSDT', 'GET /api/markets/BTCUSDT returns BTC ticker');

    // 7. Portfolio: Balance
    const resPort = await fetch(`${baseUrl}/api/portfolio`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const portJson = await resPort.json();
    assert(resPort.status === 200 && portJson.data.balance > 0, 'GET /api/portfolio returns active account balance');

    // 8. Markets: Margin Config & Trades
    const resMargin = await fetch(`${baseUrl}/api/markets/BTCUSDT/margin-config`);
    const marginJson = await resMargin.json();
    assert(resMargin.status === 200 && marginJson.data.leverage > 0, 'GET /api/markets/BTCUSDT/margin-config returns coin leverage');

    const resTrades = await fetch(`${baseUrl}/api/markets/BTCUSDT/trades`);
    const tradesJson = await resTrades.json();
    assert(resTrades.status === 200 && Array.isArray(tradesJson.data), 'GET /api/markets/BTCUSDT/trades returns trade executions');

    // 9. Positions: List open positions
    const resPos = await fetch(`${baseUrl}/api/positions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const posJson = await resPos.json();
    assert(resPos.status === 200 && Array.isArray(posJson.data), 'GET /api/positions returns open positions');

    // 10. Orders: Place real limit order within allowable band (2% below market) and cancel
    const btcMarketPrice = btcJson.data.price || 85000;
    const testLimitPrice = Math.round(btcMarketPrice * 0.98);

    const resLimit = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: testLimitPrice,
        quantity: 0.001,
        leverage: 10,
      }),
    });
    const limitJson = await resLimit.json();
    assert(resLimit.status === 201 && !!limitJson.data.order.id, 'POST /api/orders places LIMIT order on Propr');
    limitOrderId = limitJson.data.order.id;

    // 11. Orders: Cancel order
    const resCancel = await fetch(`${baseUrl}/api/orders/${limitOrderId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const cancelJson = await resCancel.json();
    assert(resCancel.status === 200, 'POST /api/orders/:id/cancel cancels order');

    // 12. Orders: List User Orders
    const resOrders = await fetch(`${baseUrl}/api/orders`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ordersJson = await resOrders.json();
    assert(resOrders.status === 200 && Array.isArray(ordersJson.data), 'GET /api/orders returns user orders');

    // 13. Trades: List User Trades
    const resUserTrades = await fetch(`${baseUrl}/api/trades`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userTradesJson = await resUserTrades.json();
    assert(resUserTrades.status === 200 && Array.isArray(userTradesJson.data), 'GET /api/trades returns user trade history');

    console.log('\n🎉 ALL BACKEND API & TRADING ENGINE TESTS PASSED SUCCESSFULLY! 🎉\n');
  } catch (err) {
    console.error('Test failed with exception:', err);
    process.exit(1);
  } finally {
    wsServer.destroy();
    server.close();
    process.exit(0);
  }
}

runTests();
