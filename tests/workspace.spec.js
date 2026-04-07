import { test, expect } from '@playwright/test';

test('workspace navigation renders overview, review queue and reports', async ({ page }) => {
  const nav = page.locator('.sidebar-nav');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Seu painel economico em uma leitura so.' })).toBeVisible();

  await page.screenshot({ path: '.finai-runtime/playwright-overview.png', fullPage: true });

  await nav.getByRole('button', { name: /Audit Trail/i }).click();
  await expect(page.getByRole('heading', { name: 'Historico completo, com confianca e ajuste manual.' })).toBeVisible();
  await page.screenshot({ path: '.finai-runtime/playwright-audit.png', fullPage: true });

  await nav.getByRole('button', { name: /Review Queue/i }).click();
  await expect(page.getByRole('heading', { name: 'Resolva so o que ainda esta em aberto.' })).toBeVisible();
  const confirmButton = page.getByRole('button', { name: /Confirmar e aprender/i }).first();
  const cleanQueueHeading = page.getByRole('heading', { name: 'Fila limpa' });
  await expect(confirmButton.or(cleanQueueHeading)).toBeVisible();
  await page.screenshot({ path: '.finai-runtime/playwright-review-queue.png', fullPage: true });

  await nav.getByRole('button', { name: /Reports/i }).click();
  await expect(page.getByRole('heading', { name: 'Analise sua rotina sem perder o fio.' })).toBeVisible();
  await expect(page.getByText('Controles da analise')).toBeVisible();
  await expect(page.getByLabel('Periodo')).toBeVisible();
  await expect(page.getByLabel('Lente')).toBeVisible();
  await expect(page.getByRole('button', { name: /Semanas/i })).toBeVisible();
  await page.getByRole('button', { name: /Semanas/i }).click();
  await expect(page.getByText('Heatmap semanal')).toBeVisible();
  await page.getByRole('button', { name: /Merchants/i }).click();
  await expect(page.getByText('Picos e impulsos')).toBeVisible();
  await page.screenshot({ path: '.finai-runtime/playwright-reports.png', fullPage: true });
});

test('import center restores an in-progress draft after navigation', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('finai-import-draft-v1', JSON.stringify({
      stage: 'review',
      activeFileName: 'draft.csv',
      showOnlyReview: false,
      analysisMeta: {
        ruleMatches: 0,
        warnings: [],
      },
      rows: [
        {
          id: 'draft-1',
          date: '2026-04-04',
          description: 'Draft Merchant',
          cleaned_description: 'Draft Merchant',
          amount: 42,
          type: 'expense',
          category: 'Other',
          payment_method: 'pix',
          recurrence: 'one-time',
          account_id: null,
          ignore_dashboard: 0,
          statement_type: 'account',
          institution: 'Nubank',
          external_id: '',
          raw_category: '',
          source_file: 'draft.csv',
          match_key: 'draft merchant',
          duplicate_count: 1,
          is_subscription: 0,
          subscription_cycle: 'monthly',
          subscription_name: '',
          category_confidence: 0,
          category_source: 'unassigned',
          category_reason: 'No confident category yet.',
          recurrence_confidence: 100,
          recurrence_source: 'default',
          recurrence_reason: 'Default recurrence starts as one-time.',
          needs_review: true,
        },
      ],
    }));
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Import Center/i }).click();
  await expect(page.getByText('Rascunho restaurado')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Draft Merchant' })).toBeVisible();

  await page.getByRole('button', { name: /Overview/i }).click();
  await page.getByRole('button', { name: /Import Center/i }).click();
  await expect(page.getByText('Rascunho restaurado')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Draft Merchant' })).toBeVisible();
});
