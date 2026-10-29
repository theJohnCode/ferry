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

describe('Ledger operations (e2e)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    app = await createApp({ fxProvider: FixedFxProvider });
    await resetDatabase(app);
  });

  afterEach(async () => {
    await closeApp(app);
  });

  describe('POST /wallets/:id/deposits', () => {
    it('credits the balance and records the transaction', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      const key = randomUUID();

      const response = await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/deposits`)
        .set('Idempotency-Key', key)
        .send({ currency: 'cNGN', amount: '200000.00' })
        .expect(201);

      expect(response.body.type).toBe('deposit');
      expect(response.body.destinationCurrency).toBe('cNGN');
      expect(response.body.destinationAmount).toBe('200000.00000000');

      const walletView = await request(app.getHttpServer()).get(
        `/wallets/${wallet.id}`,
      );
      expect(balanceOf(walletView.body.balances, 'cNGN')).toBe(
        '200000.00000000',
      );
    });

    it('returns 400 when the Idempotency-Key header is missing', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/deposits`)
        .send({ currency: 'cNGN', amount: '1.00' })
        .expect(400);
    });

    it('rejects a JSON number amount with 400', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/deposits`)
        .set('Idempotency-Key', randomUUID())
        .send({ currency: 'cNGN', amount: 500 })
        .expect(400);
    });

    it('rejects a zero amount with 400', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/deposits`)
        .set('Idempotency-Key', randomUUID())
        .send({ currency: 'cNGN', amount: '0.00' })
        .expect(400);
    });

    it('rejects an amount too large for the balance column with 400', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/deposits`)
        .set('Idempotency-Key', randomUUID())
        .send({ currency: 'cNGN', amount: '10000000000000000000000' })
        .expect(400);

      const walletView = await request(app.getHttpServer()).get(
        `/wallets/${wallet.id}`,
      );
      expect(balanceOf(walletView.body.balances, 'cNGN')).toBe('0.00000000');
    });

    it('returns 404 for an unknown wallet', async () => {
      await request(app.getHttpServer())
        .post('/wallets/00000000-0000-4000-8000-000000000000/deposits')
        .set('Idempotency-Key', randomUUID())
        .send({ currency: 'cNGN', amount: '1.00' })
        .expect(404);
    });
  });

  describe('POST /wallets/:id/swaps', () => {
    it('swaps at the current rate and rounds the destination down', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await deposit(app, wallet.id, 'cNGN', '1600.50');

      const response = await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/swaps`)
        .set('Idempotency-Key', randomUUID())
        .send({ from: 'cNGN', to: 'USDx', amount: '1600.00' })
        .expect(201);

      expect(response.body.destinationAmount).toBe('1.00000000');
      expect(response.body.rate).toBe('0.000625');
      expect(response.body.rateSource).toBe('live');

      const walletView = await request(app.getHttpServer()).get(
        `/wallets/${wallet.id}`,
      );
      expect(balanceOf(walletView.body.balances, 'cNGN')).toBe('0.50000000');
      expect(balanceOf(walletView.body.balances, 'USDx')).toBe('1.00000000');
    });

    it('rejects a swap that would overdraw the balance with 422 and changes nothing', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await deposit(app, wallet.id, 'USDx', '10.00');

      const response = await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/swaps`)
        .set('Idempotency-Key', randomUUID())
        .send({ from: 'USDx', to: 'cNGN', amount: '100.00' })
        .expect(422);

      expect(response.body.message).toContain('Not enough USDx');

      const walletView = await request(app.getHttpServer()).get(
        `/wallets/${wallet.id}`,
      );
      expect(balanceOf(walletView.body.balances, 'USDx')).toBe('10.00000000');
      expect(balanceOf(walletView.body.balances, 'cNGN')).toBe('0.00000000');
    });

    it('rejects a conversion whose result would overflow the balance column', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      // The largest amount DECIMAL(30, 8) can hold; at 1600 cNGN per USDx the
      // converted side would not fit, so the swap must fail cleanly.
      await deposit(app, wallet.id, 'USDx', '9999999999999999999999.99999999');

      const response = await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/swaps`)
        .set('Idempotency-Key', randomUUID())
        .send({
          from: 'USDx',
          to: 'cNGN',
          amount: '9999999999999999999999.99999999',
        })
        .expect(422);

      expect(response.body.message).toContain('too large');

      const walletView = await request(app.getHttpServer()).get(
        `/wallets/${wallet.id}`,
      );
      expect(balanceOf(walletView.body.balances, 'cNGN')).toBe('0.00000000');
    });

    it('rejects a swap between identical currencies', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/swaps`)
        .set('Idempotency-Key', randomUUID())
        .send({ from: 'cNGN', to: 'cNGN', amount: '1.00' })
        .expect(400);
    });
  });

  describe('POST /transfers', () => {
    it('converts to the receiver currency and records sender, receiver, amount and rate', async () => {
      const sender = await createWallet(app, { email: 'ada@example.com' });
      const receiver = await createWallet(app, { email: 'kwame@example.com' });
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

      expect(response.body.sourceWalletId).toBe(sender.id);
      expect(response.body.destinationWalletId).toBe(receiver.id);
      expect(response.body.sourceCurrency).toBe('cNGN');
      expect(response.body.sourceAmount).toBe('1600.00000000');
      expect(response.body.destinationCurrency).toBe('cGHS');
      expect(response.body.destinationAmount).toBe('16.00000000');
      expect(response.body.rate).toBe('0.01');
      expect(typeof response.body.createdAt).toBe('string');

      const senderView = await request(app.getHttpServer()).get(
        `/wallets/${sender.id}`,
      );
      expect(balanceOf(senderView.body.balances, 'cNGN')).toBe('1600.00000000');
      const receiverView = await request(app.getHttpServer()).get(
        `/wallets/${receiver.id}`,
      );
      expect(balanceOf(receiverView.body.balances, 'cGHS')).toBe('16.00000000');
    });

    it('credits the same currency when toCurrency is omitted', async () => {
      const sender = await createWallet(app, { email: 'ada@example.com' });
      const receiver = await createWallet(app, { email: 'kunle@example.com' });
      await deposit(app, sender.id, 'cNGN', '500.00');

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .set('Idempotency-Key', randomUUID())
        .send({
          fromWalletId: sender.id,
          toWalletId: receiver.id,
          currency: 'cNGN',
          amount: '250.00',
        })
        .expect(201);

      expect(response.body.destinationCurrency).toBe('cNGN');
      expect(response.body.rate).toBeNull();
      const receiverView = await request(app.getHttpServer()).get(
        `/wallets/${receiver.id}`,
      );
      expect(balanceOf(receiverView.body.balances, 'cNGN')).toBe(
        '250.00000000',
      );
    });

    it('rejects a transfer to the same wallet with 422', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await request(app.getHttpServer())
        .post('/transfers')
        .set('Idempotency-Key', randomUUID())
        .send({
          fromWalletId: wallet.id,
          toWalletId: wallet.id,
          currency: 'cNGN',
          amount: '1.00',
        })
        .expect(422);
    });

    it('rejects a transfer that overdrafts the sender with 422', async () => {
      const sender = await createWallet(app, { email: 'ada@example.com' });
      const receiver = await createWallet(app, { email: 'kwame@example.com' });
      await deposit(app, sender.id, 'cNGN', '100.00');

      await request(app.getHttpServer())
        .post('/transfers')
        .set('Idempotency-Key', randomUUID())
        .send({
          fromWalletId: sender.id,
          toWalletId: receiver.id,
          currency: 'cNGN',
          amount: '200.00',
        })
        .expect(422);
    });

    it('rejects a transfer from an unknown wallet with 404', async () => {
      const receiver = await createWallet(app, { email: 'kwame@example.com' });
      await request(app.getHttpServer())
        .post('/transfers')
        .set('Idempotency-Key', randomUUID())
        .send({
          fromWalletId: '00000000-0000-4000-8000-000000000000',
          toWalletId: receiver.id,
          currency: 'cNGN',
          amount: '1.00',
        })
        .expect(404);
    });
  });

  describe('idempotency', () => {
    it('replays a deposit with the same key and body and does not move money twice', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      const key = randomUUID();
      const body = { currency: 'cNGN', amount: '200000.00' };

      const first = await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/deposits`)
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/deposits`)
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      expect(second.body.id).toBe(first.body.id);

      const walletView = await request(app.getHttpServer()).get(
        `/wallets/${wallet.id}`,
      );
      expect(balanceOf(walletView.body.balances, 'cNGN')).toBe(
        '200000.00000000',
      );
    });

    it('replays a transfer with the same key and returns the original result', async () => {
      const sender = await createWallet(app, { email: 'ada@example.com' });
      const receiver = await createWallet(app, { email: 'kwame@example.com' });
      await deposit(app, sender.id, 'cNGN', '300.00');
      const key = randomUUID();
      const body = {
        fromWalletId: sender.id,
        toWalletId: receiver.id,
        currency: 'cNGN',
        amount: '100.00',
      };

      const first = await request(app.getHttpServer())
        .post('/transfers')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/transfers')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      expect(second.body.id).toBe(first.body.id);

      const receiverView = await request(app.getHttpServer()).get(
        `/wallets/${receiver.id}`,
      );
      expect(balanceOf(receiverView.body.balances, 'cNGN')).toBe(
        '100.00000000',
      );
    });

    it('rejects the same key reused with a different body with 422', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      const key = randomUUID();

      await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/deposits`)
        .set('Idempotency-Key', key)
        .send({ currency: 'cNGN', amount: '10.00' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/deposits`)
        .set('Idempotency-Key', key)
        .send({ currency: 'cNGN', amount: '20.00' })
        .expect(422);
    });

    it('moves money once when the same request arrives twice at the same instant', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      const key = randomUUID();
      const body = { currency: 'cNGN', amount: '100.00' };

      const send = () =>
        request(app.getHttpServer())
          .post(`/wallets/${wallet.id}/deposits`)
          .set('Idempotency-Key', key)
          .send(body);

      const [first, second] = await Promise.all([send(), send()]);

      expect([first.status, second.status]).toEqual([201, 201]);
      expect(first.body.id).toBe(second.body.id);

      const walletView = await request(app.getHttpServer()).get(
        `/wallets/${wallet.id}`,
      );
      expect(balanceOf(walletView.body.balances, 'cNGN')).toBe('100.00000000');
    });
  });

  describe('history and single transaction', () => {
    it('lists transactions newest first with pagination and filters', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await deposit(app, wallet.id, 'cNGN', '500.00');
      await deposit(app, wallet.id, 'USDx', '10.00');
      await request(app.getHttpServer())
        .post(`/wallets/${wallet.id}/swaps`)
        .set('Idempotency-Key', randomUUID())
        .send({ from: 'USDx', to: 'cNGN', amount: '1.00' });

      const all = await request(app.getHttpServer())
        .get(`/wallets/${wallet.id}/transactions`)
        .expect(200);
      expect(all.body.total).toBe(3);
      expect(all.body.items).toHaveLength(3);
      expect(all.body.page).toBe(1);
      expect(all.body.limit).toBe(20);
      expect(all.body.items[0].type).toBe('swap');
      expect(all.body.items[0].direction).toBe('self');
      expect(all.body.items[2].type).toBe('deposit');

      const firstPage = await request(app.getHttpServer())
        .get(`/wallets/${wallet.id}/transactions?page=1&limit=2`)
        .expect(200);
      expect(firstPage.body.total).toBe(3);
      expect(firstPage.body.items).toHaveLength(2);

      const deposits = await request(app.getHttpServer())
        .get(`/wallets/${wallet.id}/transactions?type=deposit`)
        .expect(200);
      expect(deposits.body.total).toBe(2);
      for (const item of deposits.body.items) {
        expect(item.type).toBe('deposit');
      }

      const usd = await request(app.getHttpServer())
        .get(`/wallets/${wallet.id}/transactions?currency=USDx`)
        .expect(200);
      expect(usd.body.total).toBe(2);
      for (const item of usd.body.items) {
        expect([item.sourceCurrency, item.destinationCurrency]).toContain(
          'USDx',
        );
      }
    });

    it('marks a received transfer in the receiver history with direction received', async () => {
      const sender = await createWallet(app, { email: 'ada@example.com' });
      const receiver = await createWallet(app, { email: 'kwame@example.com' });
      await deposit(app, sender.id, 'cNGN', '300.00');
      await request(app.getHttpServer())
        .post('/transfers')
        .set('Idempotency-Key', randomUUID())
        .send({
          fromWalletId: sender.id,
          toWalletId: receiver.id,
          currency: 'cNGN',
          amount: '100.00',
        });

      const receiverHistory = await request(app.getHttpServer())
        .get(`/wallets/${receiver.id}/transactions?type=transfer`)
        .expect(200);
      expect(receiverHistory.body.total).toBe(1);
      expect(receiverHistory.body.items[0].direction).toBe('received');

      const senderHistory = await request(app.getHttpServer())
        .get(`/wallets/${sender.id}/transactions?type=transfer`)
        .expect(200);
      expect(senderHistory.body.items[0].direction).toBe('sent');
    });

    it('fetches a single transaction, and 404s an unknown one', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await deposit(app, wallet.id, 'cNGN', '500.00');

      const history = await request(app.getHttpServer()).get(
        `/wallets/${wallet.id}/transactions`,
      );
      const transactionId = history.body.items[0].id;

      const single = await request(app.getHttpServer())
        .get(`/transactions/${transactionId}`)
        .expect(200);
      expect(single.body.id).toBe(transactionId);
      expect(single.body.type).toBe('deposit');
      expect(single.body.sourceWalletId).toBeNull();

      await request(app.getHttpServer())
        .get('/transactions/00000000-0000-4000-9000-000000000000')
        .expect(404);
    });
  });
});
