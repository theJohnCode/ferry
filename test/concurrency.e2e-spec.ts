import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  balanceOf,
  closeApp,
  createApp,
  createWallet,
  deposit,
  FixedFxProvider,
  resetDatabase,
} from './helpers';

describe('Concurrency (e2e)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    app = await createApp({ fxProvider: FixedFxProvider });
    await resetDatabase(app);
  });

  afterEach(async () => {
    await closeApp(app);
  });

  it('runs 20 parallel transfers against a balance that affords 10, and never goes negative', async () => {
    const sender = await createWallet(app, { email: 'sender@example.com' });
    const receiver = await createWallet(app, { email: 'receiver@example.com' });
    await deposit(app, sender.id, 'USDx', '100.00');

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        request(app.getHttpServer())
          .post('/transfers')
          .set('Idempotency-Key', randomUUID())
          .send({
            fromWalletId: sender.id,
            toWalletId: receiver.id,
            currency: 'USDx',
            amount: '10.00',
          }),
      ),
    );

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<request.Response> =>
        result.status === 'fulfilled',
    );
    const succeeded = fulfilled.filter((result) => result.value.status === 201);
    const insufficient = fulfilled.filter(
      (result) => result.value.status === 422,
    );
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(succeeded).toHaveLength(10);
    expect(insufficient).toHaveLength(10);
    expect(rejected).toHaveLength(0);

    for (const failure of insufficient) {
      expect(failure.value.body.message).toContain('Not enough USDx');
    }

    const senderView = await request(app.getHttpServer()).get(
      `/wallets/${sender.id}`,
    );
    expect(balanceOf(senderView.body.balances, 'USDx')).toBe('0.00000000');

    const receiverView = await request(app.getHttpServer()).get(
      `/wallets/${receiver.id}`,
    );
    expect(balanceOf(receiverView.body.balances, 'USDx')).toBe('100.00000000');
  });

  it('handles opposite-direction transfers at the same instant without deadlocking', async () => {
    const river = await createWallet(app, { email: 'river@example.com' });
    const lake = await createWallet(app, { email: 'lake@example.com' });
    await deposit(app, river.id, 'USDx', '100.00');
    await deposit(app, lake.id, 'USDx', '100.00');

    const riverToLake = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .post('/transfers')
        .set('Idempotency-Key', randomUUID())
        .send({
          fromWalletId: river.id,
          toWalletId: lake.id,
          currency: 'USDx',
          amount: '5.00',
        }),
    );
    const lakeToRiver = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .post('/transfers')
        .set('Idempotency-Key', randomUUID())
        .send({
          fromWalletId: lake.id,
          toWalletId: river.id,
          currency: 'USDx',
          amount: '5.00',
        }),
    );

    const results = await Promise.all([...riverToLake, ...lakeToRiver]);

    for (const response of results) {
      expect(response.status).toBe(201);
    }

    const riverView = await request(app.getHttpServer()).get(
      `/wallets/${river.id}`,
    );
    const lakeView = await request(app.getHttpServer()).get(
      `/wallets/${lake.id}`,
    );
    expect(balanceOf(riverView.body.balances, 'USDx')).toBe('100.00000000');
    expect(balanceOf(lakeView.body.balances, 'USDx')).toBe('100.00000000');
  });
});
