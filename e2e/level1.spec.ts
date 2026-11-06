import { test, expect } from '@playwright/test';

test.describe('NeuroBot E2E — Fase 1 (Primeiro passo)', () => {
  test('completa a Fase 1 do início ao fim, ganha 3 estrelas e libera a Fase 2', async ({
    page,
  }) => {
    await page.goto('/');

    // Verifica cabeçalho e Fase 1 liberada / Fase 2 inicialmente bloqueada
    await expect(page.locator('h1.app-title')).toHaveText('NeuroBot');
    await expect(page.getByTestId('level-item-1')).toBeVisible();
    await expect(page.getByTestId('level-item-2')).toContainText('Bloqueada');

    // Carrega a rede ideal da Fase 1 (1 entrada dist_front -> 1 saída jump)
    await page.getByTestId('load-ideal-network-btn').click();
    await expect(page.getByTestId('exported-topology-json')).toContainText('"dist_front"');
    await expect(page.getByTestId('exported-topology-json')).toContainText('"jump"');

    // Seleciona velocidade 4x na Arena 2D e executa o robô
    await page.getByTestId('speed-btn-4x').click();
    await page.getByTestId('run-arena-btn').click();

    // Aguarda o robô superar o desafio na Arena 2D
    await expect(page.getByTestId('arena-outcome-banner')).toContainText('Desafio Superado', {
      timeout: 15000,
    });

    // Verifica que ganhou 3 estrelas (3 / 15) e liberou a Fase 2
    await expect(page.getByTestId('total-stars-badge')).toContainText('3 / 15');
    await expect(page.getByTestId('level-item-2')).toContainText('Liberada');

    // Captura screenshot E2E da Fase 1 concluída
    await page.screenshot({
      fullPage: true,
    });
  });
});
