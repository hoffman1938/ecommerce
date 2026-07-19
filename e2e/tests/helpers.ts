import { expect, type Page } from '@playwright/test';

export const STOREFRONT_URL = process.env.STOREFRONT_URL ?? 'http://localhost:3000';
export const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3001';
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.local`;
}

interface MailpitMessageSummary {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
}

/** Poll Mailpit for the newest message sent to `email`. */
export async function waitForEmail(
  email: string,
  subjectContains: string,
  timeoutMs = 30_000,
): Promise<{ id: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    if (search.ok) {
      const data = (await search.json()) as { messages?: MailpitMessageSummary[] };
      const match = (data.messages ?? []).find((m) =>
        m.Subject.toLowerCase().includes(subjectContains.toLowerCase()),
      );
      if (match) {
        const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
        const body = (await detail.json()) as { Text?: string; HTML?: string };
        return { id: match.ID, text: `${body.Text ?? ''}\n${body.HTML ?? ''}` };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No email to ${email} with subject containing "${subjectContains}"`);
}

export function extractLink(emailText: string, pathFragment: string): string {
  const regex = new RegExp(`https?://[^\\s"'<>]*${pathFragment}[^\\s"'<>]*`);
  const match = emailText.match(regex);
  if (!match) throw new Error(`No link containing "${pathFragment}" found in email`);
  return match[0].replace(/&amp;/g, '&');
}

export async function registerAndVerify(page: Page, email: string, password: string) {
  await page.goto('/register');
  await page.getByLabel('First name').fill('E2E');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  const mail = await waitForEmail(email, 'Verify');
  const verifyUrl = extractLink(mail.text, 'verify-email');
  await page.goto(verifyUrl);
  await expect(page.getByTestId('verify-result')).toContainText('verified', { timeout: 20_000 });
}

export async function loginStorefront(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/account/);
}

export async function loginAdmin(page: Page, email = 'admin@example.local', password = 'Admin123!') {
  await page.goto(`${ADMIN_URL}/login`);
  await page.getByTestId('admin-email').fill(email);
  await page.getByTestId('admin-password').fill(password);
  await page.getByTestId('admin-login-submit').click();
  await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 20_000 });
}

/** Fill the storefront checkout form up to the pay button. */
export async function fillCheckout(page: Page, email: string) {
  await page.waitForURL(/\/checkout/);
  const emailField = page.locator('input[type="email"]').first();
  if ((await emailField.inputValue()) === '') {
    await emailField.fill(email);
  }
  await page.getByText('First name').locator('..').locator('input').fill('E2E');
  await page.getByText('Last name').locator('..').locator('input').fill('Tester');
  await page.getByText('Street and number').locator('..').locator('input').fill('Teststraße 1');
  await page.getByText('City', { exact: true }).locator('..').locator('input').fill('Berlin');
  await page.getByText('Postal code').locator('..').locator('input').fill('10115');
  await page.getByText('Country code').locator('..').locator('input').fill('DE');
}
