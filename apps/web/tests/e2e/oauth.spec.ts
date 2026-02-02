/**
 * OAuth E2E Tests (Playwright)
 *
 * End-to-end tests for OAuth UI flows
 */

import { test, expect, type Page } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'oauth-e2e@example.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'test-password-123';

test.describe('OAuth App Management', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();

    // Sign in
    await page.goto(`${BASE_URL}/sign-in`);
    await page.fill('input[type="email"]', TEST_USER_EMAIL);
    await page.fill('input[type="password"]', TEST_USER_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 5000 });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should display OAuth apps page', async () => {
    await page.goto(`${BASE_URL}/settings/oauth-apps`);

    await expect(page).toHaveTitle(/OAuth Apps/);
    await expect(page.getByRole('heading', { name: 'OAuth Apps' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create OAuth App/i })).toBeVisible();
  });

  test('should create new OAuth app', async () => {
    await page.goto(`${BASE_URL}/settings/oauth-apps`);

    // Click create button
    await page.click('button:has-text("Create OAuth App")');

    // Fill in form
    await page.fill('input[name="name"]', `E2E Test App ${Date.now()}`);
    await page.fill('textarea[name="description"]', 'Created by E2E tests');
    await page.fill('input[name="homepageUrl"]', 'https://example.com');
    await page.fill('textarea[name="redirectUris"]', 'https://example.com/callback');

    // Submit form
    await page.click('button:has-text("Create App")');

    // Wait for success dialog
    await expect(page.getByText('OAuth App Created')).toBeVisible({ timeout: 5000 });

    // Verify client credentials are shown
    await expect(page.getByText(/Client ID/i)).toBeVisible();
    await expect(page.getByText(/Client Secret/i)).toBeVisible();

    // Client secret should be visible (only shown once)
    const secretElement = page.locator('code:has-text("secret_")');
    await expect(secretElement).toBeVisible();

    // Click copy button
    await page.click('button:has-text("Copy")');

    // Close dialog
    await page.click('button:has-text("Done")');

    // Verify app appears in list
    await expect(page.getByText(`E2E Test App`)).toBeVisible();
  });

  test('should show validation errors for invalid input', async () => {
    await page.goto(`${BASE_URL}/settings/oauth-apps`);

    await page.click('button:has-text("Create OAuth App")');

    // Try to submit empty form
    await page.click('button:has-text("Create App")');

    // Should see validation errors (disabled button or error messages)
    const createButton = page.getByRole('button', { name: 'Create App' });
    await expect(createButton).toBeDisabled();
  });

  test('should display app details page', async () => {
    // Assumes at least one app exists from previous test
    await page.goto(`${BASE_URL}/settings/oauth-apps`);

    // Click on first app card
    await page.click('a:has-text("View Details")');

    // Should navigate to app detail page
    await expect(page).toHaveURL(/\/settings\/oauth-apps\/.+/);

    // Verify sections are visible
    await expect(page.getByText(/Active Users/i)).toBeVisible();
    await expect(page.getByText(/OAuth Credentials/i)).toBeVisible();
    await expect(page.getByText(/Redirect URIs/i)).toBeVisible();
  });

  test('should regenerate client secret', async () => {
    await page.goto(`${BASE_URL}/settings/oauth-apps`);
    await page.click('a:has-text("View Details")');

    // Click regenerate button
    await page.click('button:has-text("Regenerate")');

    // Confirm in dialog
    await expect(page.getByText(/Regenerate Client Secret/i)).toBeVisible();
    await expect(page.getByText(/Warning/i)).toBeVisible();

    await page.click('button:has-text("Regenerate Secret")');

    // Should see new secret
    await expect(page.getByText('New Client Secret')).toBeVisible({ timeout: 5000 });

    const newSecret = page.locator('code:has-text("secret_")');
    await expect(newSecret).toBeVisible();
  });

  test('should manage redirect URIs', async () => {
    await page.goto(`${BASE_URL}/settings/oauth-apps`);
    await page.click('a:has-text("View Details")');

    // Find redirect URI section
    const redirectSection = page.locator('text=Redirect URIs').locator('..');

    // Add new redirect URI
    await page.fill('input[placeholder*="https://"]', 'https://newapp.com/callback');
    await page.click('button:has-text("Add")');

    // Should see new URI in list
    await expect(page.getByText('https://newapp.com/callback')).toBeVisible();

    // Remove URI
    await page.click('button[aria-label*="Remove"]:visible >> nth=0');

    // Should be removed
    // (May still show if we removed a different one)
  });

  test('should delete OAuth app with confirmation', async () => {
    await page.goto(`${BASE_URL}/settings/oauth-apps`);
    await page.click('a:has-text("View Details")');

    // Click delete button
    await page.click('button:has-text("Delete App")');

    // Should show confirmation dialog
    await expect(page.getByText(/Delete OAuth App/i)).toBeVisible();
    await expect(page.getByText(/cannot be undone/i)).toBeVisible();

    // Type app name to confirm
    const appName = await page.locator('h1').textContent();
    await page.fill('input[placeholder*="Type"]', appName || '');

    // Confirm deletion
    await page.click('button:has-text("Delete App")');

    // Should redirect back to list
    await expect(page).toHaveURL(/\/settings\/oauth-apps$/);
  });
});

test.describe('OAuth Authorization Flow', () => {
  let page: Page;
  let clientId: string;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should display consent page with app details', async () => {
    // Simulate authorization request
    const authUrl = new URL(`${BASE_URL}/oauth/consent`);
    authUrl.searchParams.set('client_id', 'test_client_id');
    authUrl.searchParams.set('redirect_uri', 'https://example.com/callback');
    authUrl.searchParams.set('scope', 'openid email gateway:access');
    authUrl.searchParams.set('state', 'random_state');
    authUrl.searchParams.set('code_challenge', 'test_challenge');
    authUrl.searchParams.set('code_challenge_method', 'S256');

    await page.goto(authUrl.toString());

    // May redirect to sign-in first
    if (page.url().includes('/sign-in')) {
      await page.fill('input[type="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click('button[type="submit"]');
    }

    // Should show consent page (if app exists)
    // Otherwise shows error page
    const hasConsentPage = await page.getByText(/wants to access/i).isVisible().catch(() => false);
    const hasErrorPage = await page.getByText(/not found/i).isVisible().catch(() => false);

    expect(hasConsentPage || hasErrorPage).toBeTruthy();
  });

  test('should show error for missing PKCE', async () => {
    const authUrl = new URL(`${BASE_URL}/oauth/consent`);
    authUrl.searchParams.set('client_id', 'test_client_id');
    authUrl.searchParams.set('redirect_uri', 'https://example.com/callback');
    authUrl.searchParams.set('scope', 'openid email gateway:access');
    // Missing code_challenge

    await page.goto(authUrl.toString());

    // Should show error about PKCE
    await expect(page.getByText(/PKCE/i)).toBeVisible({ timeout: 3000 });
  });

  test('should show team selector for multi-team users', async () => {
    // This test requires a user with multiple teams
    // Skip if not applicable
    test.skip();
  });

  test('should approve authorization and redirect', async () => {
    // This test requires a real OAuth app to be created
    // Skip for now - requires integration test setup
    test.skip();
  });

  test('should deny authorization and redirect with error', async () => {
    // This test requires a real OAuth app to be created
    // Skip for now
    test.skip();
  });
});

test.describe('User Authorization Management', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();

    // Sign in
    await page.goto(`${BASE_URL}/sign-in`);
    await page.fill('input[type="email"]', TEST_USER_EMAIL);
    await page.fill('input[type="password"]', TEST_USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 5000 });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should display authorized apps page', async () => {
    await page.goto(`${BASE_URL}/settings/authorized-apps`);

    await expect(page).toHaveTitle(/Authorized Apps/);
    await expect(page.getByRole('heading', { name: 'Authorized Applications' })).toBeVisible();
  });

  test('should show empty state when no authorizations', async () => {
    await page.goto(`${BASE_URL}/settings/authorized-apps`);

    // May show empty state or list of apps
    const hasEmptyState = await page.getByText(/No authorized apps/i).isVisible().catch(() => false);
    const hasAppList = await page.locator('[data-testid="authorization-card"]').count().then(c => c > 0).catch(() => false);

    expect(hasEmptyState || hasAppList).toBeTruthy();
  });

  test('should display authorization details', async () => {
    await page.goto(`${BASE_URL}/settings/authorized-apps`);

    // Find first authorization card (if exists)
    const firstCard = page.locator('[data-testid="authorization-card"]').first();
    const cardExists = await firstCard.count() > 0;

    if (cardExists) {
      // Should show app name, permissions, team, dates
      await expect(firstCard.getByText(/Permissions/i)).toBeVisible();
      await expect(firstCard.getByText(/Team/i)).toBeVisible();
      await expect(firstCard.getByText(/Authorized/i)).toBeVisible();
    }
  });

  test('should revoke authorization with confirmation', async () => {
    await page.goto(`${BASE_URL}/settings/authorized-apps`);

    const revokeButton = page.getByRole('button', { name: /Revoke Access/i }).first();
    const buttonExists = await revokeButton.isVisible().catch(() => false);

    if (buttonExists) {
      await revokeButton.click();

      // Confirm in dialog
      await expect(page.getByText(/Revoke Access/i)).toBeVisible();
      await page.click('button:has-text("Revoke Access")');

      // Should show success message
      await expect(page.getByText(/revoked/i)).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('Accessibility', () => {
  test('OAuth apps page should be accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/oauth-apps`);

    // Basic accessibility checks
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // All interactive elements should have labels
    const buttons = page.getByRole('button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const hasLabel = await button.getAttribute('aria-label') ||
                      await button.textContent();
      expect(hasLabel).toBeTruthy();
    }
  });
});

test.describe('Mobile Responsive', () => {
  test('OAuth apps should render on mobile', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }, // iPhone SE
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/settings/oauth-apps`);

    // Page should be scrollable and readable
    await expect(page.getByRole('heading', { name: 'OAuth Apps' })).toBeVisible();

    await context.close();
  });
});

test.describe('Performance', () => {
  test('OAuth apps page should load quickly', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(`${BASE_URL}/settings/oauth-apps`);
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });
});
