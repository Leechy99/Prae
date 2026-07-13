import { test, expect } from '@playwright/test';

const API_KEY = 'test-api-key';

test.describe('Processing API', () => {
  test('POST /api/v1/process - processes HTML and returns cleaned content', async ({ request }) => {
    const expectedText = 'Hello 世界，这是简短的多语言内容。';
    const html = `<!doctype html><html><body><nav>Noise</nav><main><p>${expectedText}</p></main></body></html>`;

    // Base64 encode the HTML
    const base64Content = Buffer.from(html).toString('base64');

    const response = await request.post('/api/v1/process', {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        content: base64Content,
        contentType: 'text/html',
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result.outcome).toBeDefined();
    expect(body.result.strategiesUsed).toBeDefined();
    expect(body.result.strategiesUsed).toEqual(expect.arrayContaining([
      expect.objectContaining({ strategyId: 'chunking', success: true }),
      expect.objectContaining({ strategyId: 'relevance-filter', success: true }),
    ]));

    const outputs = body.result.fusedOutput.data;
    const canonicalText = outputs[0].content.text as string;
    expect(canonicalText).toBe(expectedText);
    expect(canonicalText.length).toBeLessThan(100);
    expect(outputs[0].metadata.strategiesApplied)
      .toEqual(expect.arrayContaining(['chunking', 'relevance-filter']));
    expect(outputs[0].chunks[0].text).toBe(expectedText);
    expect(outputs[0].metadata.confidence).toBe(body.result.confidence.overall);
    expect(outputs[1].metadata.confidence).toBe(body.result.confidence.overall);
  });

  test('POST /api/v1/process - rejects requests without API key', async ({ request }) => {
    const html = '<html><body>Test</body></html>';
    const base64Content = Buffer.from(html).toString('base64');

    // Request without API key
    const response = await request.post('/api/v1/process', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        content: base64Content,
        contentType: 'text/html',
      },
    });

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('GET /api/v1/strategies - lists available strategies', async ({ request }) => {
    const response = await request.get('/api/v1/strategies', {
      headers: {
        'x-api-key': API_KEY,
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.strategies).toBeDefined();
    expect(Array.isArray(body.strategies)).toBe(true);
    expect(body.strategies.length).toBeGreaterThan(0);

    // Check strategy structure
    const strategy = body.strategies[0];
    expect(strategy).toHaveProperty('id');
    expect(strategy).toHaveProperty('name');
    expect(strategy).toHaveProperty('type');
    expect(strategy).toHaveProperty('version');
    expect(strategy).toHaveProperty('enabled');
  });
});
