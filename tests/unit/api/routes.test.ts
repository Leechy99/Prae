import express, { Express } from 'express';
import request from 'supertest';
import { createRouter } from '../../../src/api/routes';

describe('API Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(createRouter());
  });

  describe('GET /health', () => {
    it('returns status ok and timestamp', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('POST /api/v1/process', () => {
    it('returns 401 when X-API-Key header is missing', async () => {
      const response = await request(app)
        .post('/api/v1/process')
        .send({ content: 'test' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    it('returns 403 when API key is invalid', async () => {
      const response = await request(app)
        .post('/api/v1/process')
        .set('X-API-Key', 'wrong-key')
        .send({ content: 'test' });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Forbidden');
    });

    it('returns 400 when content is missing', async () => {
      const response = await request(app)
        .post('/api/v1/process')
        .set('X-API-Key', 'dev-api-key')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
    });

    it('processes valid base64 encoded content', async () => {
      const htmlContent = '<html><body>Test content</body></html>';
      const base64Content = Buffer.from(htmlContent).toString('base64');

      const response = await request(app)
        .post('/api/v1/process')
        .set('X-API-Key', 'dev-api-key')
        .send({ content: base64Content, contentType: 'text/html' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.result).toHaveProperty('id');
      expect(response.body.result).toHaveProperty('outcome');
      expect(response.body.result).toHaveProperty('confidence');
      expect(response.body.result).toHaveProperty('strategiesUsed');
    });
  });

  describe('GET /api/v1/strategies', () => {
    it('returns 401 when X-API-Key header is missing', async () => {
      const response = await request(app).get('/api/v1/strategies');

      expect(response.status).toBe(401);
    });

    it('returns list of strategies with valid API key', async () => {
      const response = await request(app)
        .get('/api/v1/strategies')
        .set('X-API-Key', 'dev-api-key');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('strategies');
      expect(Array.isArray(response.body.strategies)).toBe(true);
      expect(response.body.strategies.length).toBeGreaterThan(0);

      const strategy = response.body.strategies[0];
      expect(strategy).toHaveProperty('id');
      expect(strategy).toHaveProperty('name');
      expect(strategy).toHaveProperty('type');
      expect(strategy).toHaveProperty('version');
      expect(strategy).toHaveProperty('enabled');
      expect(strategy).toHaveProperty('priority');
    });
  });

  describe('POST /api/v1/experience/feedback', () => {
    it('returns 401 when X-API-Key header is missing', async () => {
      const response = await request(app)
        .post('/api/v1/experience/feedback')
        .send({ contentItemId: 'test', rating: 5 });

      expect(response.status).toBe(401);
    });

    it('returns 400 when contentItemId is missing', async () => {
      const response = await request(app)
        .post('/api/v1/experience/feedback')
        .set('X-API-Key', 'dev-api-key')
        .send({ rating: 5 });

      expect(response.status).toBe(400);
    });

    it('returns 400 when rating is out of range', async () => {
      const response = await request(app)
        .post('/api/v1/experience/feedback')
        .set('X-API-Key', 'dev-api-key')
        .send({ contentItemId: 'test', rating: 6 });

      expect(response.status).toBe(400);
    });

    it('records feedback with valid request', async () => {
      const response = await request(app)
        .post('/api/v1/experience/feedback')
        .set('X-API-Key', 'dev-api-key')
        .send({ contentItemId: 'test-item', rating: 4, feedback: 'Good processing' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Feedback recorded');
      expect(response.body.data).toHaveProperty('contentItemId', 'test-item');
      expect(response.body.data).toHaveProperty('rating', 4);
    });
  });
});