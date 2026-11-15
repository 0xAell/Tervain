import { SpeechDirector as Director } from '../core/rules/speech';
import { VOICE_AUDIO } from './sound/voiceManifest';

// Who says what, and when, is the core's (core/rules/speech.ts). The scene adds only what it alone knows: how long
// each recorded line lasts.
export type { SpeechHooks, Vec3 } from '../core/rules/speech';

export class SpeechDirector extends Director {
  protected override recorded(line: string): number | undefined {
    return (VOICE_AUDIO.lines as Record<string, readonly [string, number, number, string]>)[line]?.[2];
  }
}
