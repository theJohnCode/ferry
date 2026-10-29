import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  balanceOf,
  closeApp,
  createApp,
  createWallet,
  deposit,
  FailingFxProvider,
  FixedFxProvider,
  FlakyFxProvider,
  resetDatabase,
} from './helpers';

describe('Rates and FX failure handling (e2e)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  afterEach(async () => {
    if (app) {
      await closeApp(app);
    }
  });

  it('serves live rates from the fake provider and reports source and fetchedAt', async () => {
    app = await createApp({ fxProvider: FixedFxProvider });
    await resetDatabase(app);

    const response = await request(app.getHttpServer())
      .get('/rates')
      .expect(200);

    expect(response.body.source).toBe('live');
    expect(typeof response.body.fetchedAt).toBe('string');
    expect(response.body.rates.cNGN.USDx).toBe('0.000625');
    expect(response.body.rates.USDx.cNGN).toBe('1600');
    expect(response.body.rates.cGHS.cNGN).toBe('100');
    expect(response.body.rates.EURx.USDx).toBe('1.086956521739');
  });

  it('serves stale stored rates when the provider goes down after a successful fetch', async () => {
    app = await createApp({ fxProvider: FlakyFxProvider });
    await resetDatabase(app);

    const first = await request(app.getHttpServer()).get('/rates').expect(200);
    expect(first.body.source).toBe('live');

    const second = await request(app.getHttpServer()).get('/rates').expect(200);
    expect(second.body.source).toBe('stale');
    expect(second.body.rates.cNGN.USDx).toBe(first.body.rates.cNGN.USDx);
    expect(second.body.fetchedAt).toBe(first.body.fetchedAt);
  });

  it('serves the fixed fallback table when nothing was ever fetched', async () => {
    app = await createApp({ fxProvider: FailingFxProvider });
    await resetDatabase(app);

    const response = await request(app.getHttpServer())
      .get('/rates')
      .expect(200);

    expect(response.body.source).toBe('fallback');
    expect(response.body.fetchedAt).toBeNull();
    expect(response.body.rates.USDx.cNGN).toBe('1600');
    expect(response.body.rates.cNGN.USDx).toBe('0.000625');
  });

  it('keeps working with stale rates when the provider is down during a transfer', async () => {
    app = await createApp({ fxProvider: FlakyFxProvider });
    await resetDatabase(app);

    // A first rates read succeeds and leaves stored rates behind; from then
    // on the provider is "down" and the service must fall back to them.
    await request(app.getHttpServer()).get('/rates').expect(200);

    const sender = await createWallet(app, { email: 'sender@example.com' });
    const receiver = await createWallet(app, { email: 'receiver@example.com' });
    await deposit(app, sender.id, 'cNGN', '3200.00');

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .set('Idempotency-Key', randomUUID())
      .send({
        fromWalletId: sender.id,
        toWalletId: receiver.id,
        currency: 'cNGN',
        amount: '1600.00',
        toCurrency: 'cGHS',
      })
      .expect(201);

    expect(response.body.destinationAmount).toBe('16.00000000');
    expect(response.body.rateSource).toBe('stale');

    const receiverView = await request(app.getHttpServer()).get(
      `/wallets/${receiver.id}`,
    );
    expect(balanceOf(receiverView.body.balances, 'cGHS')).toBe('16.00000000');
  });

  it('uses the fallback table for wallet totals when the provider has never worked', async () => {
    app = await createApp({ fxProvider: FailingFxProvider });
    await resetDatabase(app);

    const wallet = await createWallet(app, { email: 'ada@example.com' });
    await deposit(app, wallet.id, 'cNGN', '1600.00');

    const response = await request(app.getHttpServer())
      .get(`/wallets/${wallet.id}`)
      .expect(200);
    expect(response.body.totalUsd).toBe('1.00000000');
    expect(response.body.ratesFetchedAt).toBeNull();
  });
});
