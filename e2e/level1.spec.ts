import { test, expect } from '@playwright/test';

test.describe('NeuroBot E2E — Fase 1 (Primeiro passo com 4 obstáculos)', () => {
  test('falha sem calibrar pesos, treina a rede no Web Worker, supera as 4 caixas e ganha 3 estrelas', async ({
    page,
  }) => {
    await page.goto('/');

    // Verifica cabeçalho e Fase 1 liberada / Fase 2 inicialmente bloqueada
    await expect(page.locator('h1.app-title')).toHaveText('NeuroBot');
    await expect(page.getByTestId('level-item-1')).toBeVisible();
    await expect(page.getByTestId('level-item-2')).toContainText('Bloqueada');

    // Treina a rede neural no Web Worker (TensorFlow.js) para calibrar peso e bias
    await page.getByTestId('train-start-btn').click();
    await expect(page.getByTestId('training-status-pill')).toContainText('Treino concluído', {
      timeout: 15000,
    });

    // Seleciona velocidade 4x na Arena 2D e executa o robô contra as 4 caixas
    await page.getByTestId('speed-btn-4x').click();
    await page.getByTestId('run-arena-btn').click();

    // Aguarda o robô superar as 4 caixas e alcançar o alvo
    await expect(page.getByTestId('arena-outcome-banner')).toContainText('Desafio Superado', {
      timeout: 15000,
    });

    // Verifica que ganhou 3 estrelas (3 / 15) e liberou a Fase 2
    await expect(page.getByTestId('total-stars-badge')).toContainText('3 / 15');
    await expect(page.getByTestId('level-item-2')).toContainText('Liberada');
  });
});
