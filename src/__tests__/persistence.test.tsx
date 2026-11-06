import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { clearEmulatorStorage } from '../services/firebase';

describe('T8 Cloud Persistence — Save Progress, Save up to 10 Networks & Cross-Device Google Link', () => {
  beforeEach(() => {
    clearEmulatorStorage();
    useGameStore.setState({
      locale: 'pt-BR',
      activeLevelId: 1,
      unlockedUpToLevel: 1,
      starsByLevel: {},
      savedNetworks: [],
      authSession: null,
    });
  });

  it('persists level progress & networks across page reloads and device switches after Google linking (RF-01, RF-08, RF-09)', async () => {
    // 1. Login anônimo no Dispositivo A
    const anonSession = await useGameStore.getState().loginAnonymously();
    expect(anonSession.isAnonymous).toBe(true);

    // 2. Conclui a Fase 1 com 3 estrelas e salva uma rede customizada
    const stars = await useGameStore.getState().recordLevelCompletion(true, 0.015);
    expect(stars).toBe(3);

    const savedNet = await useGameStore.getState().saveCurrentNetwork('Minha Rede Campeã');
    expect(savedNet.name).toBe('Minha Rede Campeã');
    expect(useGameStore.getState().savedNetworks).toHaveLength(1);

    // 3. Vincula a conta anônima ao Google preservando o UID (RF-01)
    const googleSession = await useGameStore.getState().linkGoogleAccount({
      displayName: 'Alexsander UnB',
      email: 'alexsander@unb.br',
    });
    expect(googleSession?.uid).toBe(anonSession.uid);
    expect(googleSession?.isAnonymous).toBe(false);

    // 4. Simula recarregar a página / trocar para o Dispositivo B (zerando a store em memória)
    useGameStore.setState({
      unlockedUpToLevel: 1,
      starsByLevel: {},
      savedNetworks: [],
      authSession: null,
    });

    // Faz login com a conta Google vinculada no Dispositivo B e hidrata da nuvem (Firestore)
    await useGameStore.getState().hydrateFromCloud(googleSession!);

    expect(useGameStore.getState().starsByLevel['01-first-step']).toBe(3);
    expect(useGameStore.getState().unlockedUpToLevel).toBe(2);
    expect(useGameStore.getState().savedNetworks).toHaveLength(1);
    expect(useGameStore.getState().savedNetworks[0].name).toBe('Minha Rede Campeã');
  });

  it('enforces the limit of at most 10 saved networks per level (RF-09)', async () => {
    await useGameStore.getState().loginAnonymously();

    for (let i = 1; i <= 10; i++) {
      await useGameStore.getState().saveCurrentNetwork(`Rede #${i}`);
    }
    expect(useGameStore.getState().savedNetworks).toHaveLength(10);

    await expect(
      useGameStore.getState().saveCurrentNetwork('Rede #11 Excedente'),
    ).rejects.toThrow(/Maximum of 10 saved networks/i);
  });
});

