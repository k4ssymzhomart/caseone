// The emergency siren: loops through expo-audio with a heavy haptic every 1.5 s until stopped
// (PHASE_0 0.6 emergency screen). It never stops by itself.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { haptic } from './haptics';

let player: AudioPlayer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
// Bumped by every start and stop: a start whose audio mode await outlives a later stop (or start) gives up,
// so a stop that lands while the siren is still arming is never lost.
let generation = 0;

export async function startSiren(): Promise<void> {
  stopSiren();
  const mine = generation;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
  } catch {
    // audio mode is best effort
  }
  if (mine !== generation) return;
  try {
    player = createAudioPlayer(require('../../assets/sounds/siren.wav'));
    player.loop = true;
    player.volume = 1;
    player.play();
  } catch {
    player = null;
  }
  void haptic.heavy();
  timer = setInterval(() => void haptic.heavy(), 1500);
}

export function stopSiren(): void {
  generation += 1;
  if (timer) clearInterval(timer);
  timer = null;
  if (player) {
    try {
      player.pause();
      player.remove();
    } catch {
      // already released
    }
  }
  player = null;
}

/** A short ding for in-app toasts. */
export function playDing(): void {
  try {
    const p = createAudioPlayer(require('../../assets/sounds/ding.wav'));
    p.play();
    setTimeout(() => {
      try {
        p.remove();
      } catch {
        // released
      }
    }, 1500);
  } catch {
    // sound is best effort
  }
}
