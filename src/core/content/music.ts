/**
 * The pieces of the in-world score, as the music director sees them: what each is for, where it came from and how long
 * it runs. The sound files themselves, their encodings and levels are the web build's (its generated audio manifest);
 * a test holds this table equal to that manifest, so a piece cannot be added to one and not the other.
 */

/** A piece plays once through; a loop runs for as long as a threat lasts; a sting marks a moment. */
export type MusicKind = 'piece' | 'loop' | 'sting';
/** What a piece is for: the mood of a place, a threat or a fight, a moment of the story, a place first seen. */
export type MusicMood = 'vale' | 'wild' | 'sacred' | 'night' | 'danger' | 'combat' | 'sting' | 'place';
/** Generated from a prompt, or composed in code around the Tervain theme. */
export type MusicOrigin = 'generated' | 'composed';

export interface MusicEntry { kind: MusicKind; mood: MusicMood; origin: MusicOrigin; /** Seconds. */ duration: number; title?: string }

export const MUSIC = {
  vale_1: { kind: 'piece', mood: 'vale', origin: 'generated', duration: 74.184 },
  vale_2: { kind: 'piece', mood: 'vale', origin: 'generated', duration: 73.7627 },
  wild_1: { kind: 'piece', mood: 'wild', origin: 'generated', duration: 73.9253 },
  wild_2: { kind: 'piece', mood: 'wild', origin: 'generated', duration: 73.9067 },
  wild_3: { kind: 'piece', mood: 'wild', origin: 'generated', duration: 71.936 },
  night_1: { kind: 'piece', mood: 'night', origin: 'generated', duration: 72.856 },
  night_2: { kind: 'piece', mood: 'night', origin: 'generated', duration: 70.9013 },
  sacred: { kind: 'piece', mood: 'sacred', origin: 'generated', duration: 72.8533 },
  danger: { kind: 'loop', mood: 'danger', origin: 'generated', duration: 38.18 },
  combat: { kind: 'loop', mood: 'combat', origin: 'generated', duration: 36.8 },
  sting_discover: { kind: 'sting', mood: 'sting', origin: 'generated', duration: 5.1707 },
  sting_victory: { kind: 'sting', mood: 'sting', origin: 'generated', duration: 5.2293 },
  sting_death: { kind: 'sting', mood: 'sting', origin: 'generated', duration: 4.8933 },
  sting_quest: { kind: 'sting', mood: 'sting', origin: 'generated', duration: 5.5787 },
  sting_lute: { kind: 'sting', mood: 'sting', origin: 'generated', duration: 7.0533 },
  vale_3: { kind: 'piece', mood: 'vale', origin: 'generated', duration: 72.488 },
  wild_4: { kind: 'piece', mood: 'wild', origin: 'generated', duration: 71.4293 },
  night_3: { kind: 'piece', mood: 'night', origin: 'generated', duration: 71.1413 },
  sacred_2: { kind: 'piece', mood: 'sacred', origin: 'generated', duration: 72.4373 },
  danger_2: { kind: 'loop', mood: 'danger', origin: 'generated', duration: 27.5 },
  combat_2: { kind: 'loop', mood: 'combat', origin: 'generated', duration: 32 },
  theme_vale: { kind: 'piece', mood: 'vale', origin: 'composed', duration: 84.232, title: "Rillford at Work" },
  theme_wild: { kind: 'piece', mood: 'wild', origin: 'composed', duration: 72.3467, title: "The Deepwood" },
  theme_night: { kind: 'piece', mood: 'night', origin: 'composed', duration: 66.768, title: "Embers" },
  theme_sacred: { kind: 'piece', mood: 'sacred', origin: 'composed', duration: 77.3173, title: "The Spring" },
  danger_watch: { kind: 'loop', mood: 'danger', origin: 'composed', duration: 20, title: "Something Watches" },
  battle_ford: { kind: 'loop', mood: 'combat', origin: 'composed', duration: 19.5918, title: "Steel at the Ford" },
  sting_victory_theme: { kind: 'sting', mood: 'sting', origin: 'composed', duration: 6.4, title: "A Fight Won" },
  sting_fall_theme: { kind: 'sting', mood: 'sting', origin: 'composed', duration: 12.0427, title: "The Fall" },
  sting_quest_theme: { kind: 'sting', mood: 'sting', origin: 'composed', duration: 7.0187, title: "A Step of the Story" },
  place_coast: { kind: 'sting', mood: 'place', origin: 'composed', duration: 12.2143, title: "The Grey Strand" },
  place_wood: { kind: 'sting', mood: 'place', origin: 'composed', duration: 12.2143, title: "Into the Deepwood" },
  place_vale: { kind: 'sting', mood: 'place', origin: 'composed', duration: 9.472, title: "The Vale Opens" },
  place_stone: { kind: 'sting', mood: 'place', origin: 'composed', duration: 10.688, title: "Cut Stone" },
  place_sacred: { kind: 'sting', mood: 'place', origin: 'composed', duration: 10.7333, title: "Holy Water" },
  place_light: { kind: 'sting', mood: 'place', origin: 'composed', duration: 5.6373, title: "Lantern Point" },
} as const satisfies Record<string, MusicEntry>;

export type MusicId = keyof typeof MUSIC;
