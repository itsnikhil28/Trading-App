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

    // 7. Portfolio: Initial Balance
    const resPort = await fetch(`${baseUrl}/api/portfolio`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const portJson = await resPort.json();
    assert(resPort.status === 200 && portJson.data.balance === 10000, 'GET /api/portfolio returns starting balance $10,000');

    // 8. Order: Place Market Order (BUY 0.1 BTC at 10x leverage)
    const resOrder = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.1,
        leverage: 10,
        stopLoss: 80000,
        takeProfit: 110000,
      }),
    });
    const orderJson = await resOrder.json();
    assert(resOrder.status === 201 && orderJson.data.order.status === 'FILLED', 'POST /api/orders places and fills Market Order');
    assert(!!orderJson.data.position, 'Order placement created an open Position');
    openedPositionId = orderJson.data.position.id;

    // 9. Positions: List
    const resPos = await fetch(`${baseUrl}/api/positions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const posJson = await resPos.json();
    assert(resPos.status === 200 && posJson.data.length >= 1, 'GET /api/positions returns open positions');

    // 10. Positions: Risk Update (Modify SL / TP)
    const resRisk = await fetch(`${baseUrl}/api/positions/${openedPositionId}/risk`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        stopLoss: 82000,
        takeProfit: 115000,
      }),
    });
    const riskJson = await resRisk.json();
    assert(resRisk.status === 200 && riskJson.data.stopLoss === 82000, 'PATCH /positions/:id/risk updates Stop Loss and Take Profit');

    // 11. Positions: Partial Close (Close 0.05 BTC)
    const resPartial = await fetch(`${baseUrl}/api/positions/${openedPositionId}/partial-close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ quantity: 0.05 }),
    });
    const partialJson = await resPartial.json();
    assert(resPartial.status === 200 && partialJson.data.position.quantity === 0.05, 'POST /positions/:id/partial-close closes 50% position');

    // 12. Positions: Market Close (Remaining 0.05 BTC)
    const resClose = await fetch(`${baseUrl}/api/positions/${openedPositionId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const closeJson = await resClose.json();
    assert(resClose.status === 200 && closeJson.data.status === 'CLOSED', 'POST /positions/:id/close fully closes position');

    // 13. Limit Order & Cancel
    const resLimit = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        symbol: 'ETHUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: 2800,
        quantity: 1,
        leverage: 5,
      }),
    });
    const limitJson = await resLimit.json();
    assert(resLimit.status === 201 && limitJson.data.order.status === 'OPEN', 'POST /api/orders places LIMIT order as OPEN');
    limitOrderId = limitJson.data.order.id;

    const resCancel = await fetch(`${baseUrl}/api/orders/${limitOrderId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const cancelJson = await resCancel.json();
    assert(resCancel.status === 200 && cancelJson.data.status === 'CANCELLED', 'POST /api/orders/:id/cancel cancels open order');

    // 14. Trades: History
    const resTrades = await fetch(`${baseUrl}/api/trades`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const tradesJson = await resTrades.json();
    assert(resTrades.status === 200 && tradesJson.data.length >= 2, 'GET /api/trades returns executed trades');

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
