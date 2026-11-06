import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearEmulatorStorage,
  signInAnonymouslyUser,
  linkAnonymousWithGoogle,
  emulatorReadDoc,
  emulatorWriteDoc,
  FirebasePermissionError,
  LevelProgressDoc,
  UserProfileDoc,
} from '../services/firebase';
import firebaseJson from '../../firebase.json';
import firebasercRaw from '../../.firebaserc?raw';
import firestoreRulesRaw from '../../firestore.rules?raw';

describe('T2 Firebase — Auth, Hosting Config & Firestore Security Rules', () => {
  beforeEach(() => {
    clearEmulatorStorage();
  });

  it('validates firebase.json and .firebaserc match SDD Section 5 specification', () => {
    expect(firebaseJson.hosting.public).toBe('dist');
    expect(firebaseJson.hosting.rewrites).toEqual([{ source: '**', destination: '/index.html' }]);
    expect(firebaseJson.firestore.rules).toBe('firestore.rules');

    const firebaserc = JSON.parse(firebasercRaw) as {
      projects: { default: string; dev: string; prod: string };
    };
    expect(firebaserc.projects.dev).toBe('neurobot-dev');
    expect(firebaserc.projects.prod).toBe('neurobot-prod');
  });

  it('allows anonymous login in the emulator and creates the own user document', async () => {
    const session = await signInAnonymouslyUser();
    expect(session.uid).toMatch(/^anon_/);
    expect(session.isAnonymous).toBe(true);

    const profile = await emulatorReadDoc<UserProfileDoc>(
      session,
      `users/${session.uid}`,
      firestoreRulesRaw,
    );
    expect(profile).not.toBeNull();
    expect(profile?.lastLevel).toBe('01-first-step');
  });

  it('preserves UID and progress when linking anonymous account to Google (RF-01)', async () => {
    const anon = await signInAnonymouslyUser();
    const progressDoc: LevelProgressDoc = {
      stars: 3,
      bestLoss: 0.012,
      neuronsUsed: 1,
      attempts: 2,
      completedAt: '2026-11-06T12:00:00.000Z',
    };

    await emulatorWriteDoc(
      anon,
      `users/${anon.uid}/progress/01-first-step`,
      progressDoc,
      firestoreRulesRaw,
    );

    const linked = await linkAnonymousWithGoogle(anon, {
      displayName: 'Maria Silva',
      email: 'maria@unb.br',
    });

    expect(linked.uid).toBe(anon.uid);
    expect(linked.isAnonymous).toBe(false);

    const preservedProgress = await emulatorReadDoc<LevelProgressDoc>(
      linked,
      `users/${linked.uid}/progress/01-first-step`,
      firestoreRulesRaw,
    );
    expect(preservedProgress?.stars).toBe(3);
    expect(preservedProgress?.bestLoss).toBe(0.012);
  });

  it('blocks reading or writing another user UID document via firestore.rules', async () => {
    const userA = await signInAnonymouslyUser();
    await emulatorWriteDoc(
      userA,
      `users/${userA.uid}/progress/01-first-step`,
      {
        stars: 2,
        bestLoss: 0.03,
        neuronsUsed: 2,
        attempts: 1,
        completedAt: '2026-11-06T12:00:00.000Z',
      },
      firestoreRulesRaw,
    );

    const userB = { uid: 'intruder_uid_999' };

    await expect(
      emulatorReadDoc(userB, `users/${userA.uid}`, firestoreRulesRaw),
    ).rejects.toThrowError(FirebasePermissionError);

    await expect(
      emulatorReadDoc(userB, `users/${userA.uid}/progress/01-first-step`, firestoreRulesRaw),
    ).rejects.toThrowError(FirebasePermissionError);

    await expect(
      emulatorWriteDoc(
        userB,
        `users/${userA.uid}/progress/01-first-step`,
        { stars: 0 },
        firestoreRulesRaw,
      ),
    ).rejects.toThrowError(FirebasePermissionError);

    await expect(
      emulatorReadDoc(null, `users/${userA.uid}`, firestoreRulesRaw),
    ).rejects.toThrowError(FirebasePermissionError);
  });
});
