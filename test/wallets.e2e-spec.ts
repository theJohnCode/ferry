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

describe('Wallets (e2e)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    app = await createApp({ fxProvider: FixedFxProvider });
    await resetDatabase(app);
  });

  afterEach(async () => {
    await closeApp(app);
  });

  describe('POST /wallets', () => {
    it('creates a wallet with an email', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallets')
        .send({ email: 'ada@example.com' })
        .expect(201);

      expect(response.body.email).toBe('ada@example.com');
      expect(response.body.mobile).toBeNull();
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.createdAt).toBe('string');
    });

    it('creates a wallet with a mobile number', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallets')
        .send({ mobile: '0803 123 4567' })
        .expect(201);

      // Normalised to E.164.
      expect(response.body.mobile).toBe('+2348031234567');
      expect(response.body.email).toBeNull();
    });

    it('normalises the email, so a second wallet with different casing is a 409', async () => {
      await createWallet(app, { email: 'ada@example.com' });

      const response = await request(app.getHttpServer())
        .post('/wallets')
        .send({ email: 'ADA@EXAMPLE.com' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('email address');
    });

    it('rejects the same mobile number spelled differently', async () => {
      await createWallet(app, { mobile: '+2348031234567' });

      await request(app.getHttpServer())
        .post('/wallets')
        .send({ mobile: '0803-123-4567' })
        .expect(409);
    });

    it('allows one wallet to have both email and mobile', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallets')
        .send({ email: 'kwame@example.com', mobile: '+233201234567' })
        .expect(201);

      expect(response.body.email).toBe('kwame@example.com');
      expect(response.body.mobile).toBe('+233201234567');
    });

    it('rejects a wallet with no contact details', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallets')
        .send({})
        .expect(400);

      expect(response.body.message).toContain('email or a mobile number');
    });

    it('rejects a body with unknown fields', async () => {
      await request(app.getHttpServer())
        .post('/wallets')
        .send({ email: 'ada@example.com', nickname: 'ade' })
        .expect(400);
    });

    it('rejects a malformed email', async () => {
      await request(app.getHttpServer())
        .post('/wallets')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('rejects a malformed mobile number', async () => {
      await request(app.getHttpServer())
        .post('/wallets')
        .send({ mobile: 'abc' })
        .expect(400);
    });
  });

  describe('GET /wallets/:id', () => {
    it('returns all five balances at zero and a zero USD total', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });

      const response = await request(app.getHttpServer())
        .get(`/wallets/${wallet.id}`)
        .expect(200);

      const currencies = response.body.balances.map(
        (b: { currency: string }) => b.currency,
      );
      expect(currencies).toEqual(['cGHS', 'cNGN', 'cXAF', 'EURx', 'USDx']);
      for (const balance of response.body.balances) {
        expect(balance.amount).toBe('0.00000000');
      }
      expect(response.body.totalUsd).toBe('0.00000000');
      expect(typeof response.body.ratesFetchedAt).toBe('string');
    });

    it('sums every balance into USD', async () => {
      const wallet = await createWallet(app, { email: 'ada@example.com' });
      await deposit(app, wallet.id, 'cNGN', '1600.00');
      await deposit(app, wallet.id, 'USDx', '100.00');

      const response = await request(app.getHttpServer())
        .get(`/wallets/${wallet.id}`)
        .expect(200);

      // 1600 cNGN is fixed-fake 1 USD plus 100 USDx.
      expect(response.body.totalUsd).toBe('101.00000000');
      expect(balanceOf(response.body.balances, 'cNGN')).toBe('1600.00000000');
      expect(balanceOf(response.body.balances, 'USDx')).toBe('100.00000000');
    });

    it('returns 404 for an unknown wallet', async () => {
      const response = await request(app.getHttpServer())
        .get('/wallets/00000000-0000-4000-8000-000000000000')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('does not exist');
    });

    it('returns 400 for an id that is not a UUID', async () => {
      await request(app.getHttpServer()).get('/wallets/not-a-uuid').expect(400);
    });
  });
});
