import { test, expect } from '@playwright/test';

const API_KEY = 'test-api-key';

test.describe('Processing API', () => {
  test('POST /api/v1/process - processes HTML and returns cleaned content', async ({ request }) => {
    // Create a simple HTML document with noise
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page</title>
          <style>.nav { color: red; }</style>
        </head>
        <body>
          <nav class="nav">Navigation content</nav>
          <main>
            <h1>Main Content</h1>
            <p>This is the main content of the page.</p>
          </main>
          <footer>Footer info</footer>
        </body>
      </html>
    `;

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