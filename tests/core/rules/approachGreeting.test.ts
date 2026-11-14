import { describe, expect, it } from 'vitest';
import { NpcApproachGreeting } from '../../../src/core/rules/npcApproachGreeting';

const greeting = { line: 'welcome', radius: 6, leaveRadius: 11, cooldown: 120 };

describe('a personal welcome on arrival', () => {
  it('is spoken once inside its radius and not again until the visitor has left and the cooldown has run', () => {
    const welcome = new NpcApproachGreeting(greeting);
    let spoken = 0;
    const speak = () => { spoken++; return true; };
    welcome.update(0.1, 8, true, speak);
    expect(spoken).toBe(0);
    welcome.update(0.1, 5, true, speak);
    expect(spoken).toBe(1);
    for (let i = 0; i < 50; i++) welcome.update(1, 5, true, speak);
    expect(spoken).toBe(1);
    // Stepping out to between the two radii does not re-arm it; leaving does, and the cooldown still has to pass.
    welcome.update(1, 9, true, speak); welcome.update(1, 5, true, speak);
    expect(spoken).toBe(1);
    welcome.update(1, 12, true, speak); welcome.update(1, 5, true, speak);
    expect(spoken).toBe(1);
    for (let i = 0; i < 70; i++) welcome.update(1, 12, true, speak);
    welcome.update(1, 5, true, speak);
    expect(spoken).toBe(2);
  });

  it('keeps the welcome when the line could not be heard, and tries again half a second later', () => {
    const welcome = new NpcApproachGreeting(greeting);
    let tries = 0, heard = false;
    const speak = () => { tries++; return heard; };
    welcome.update(0.1, 5, true, speak);
    welcome.update(0.1, 5, true, speak);
    expect(tries).toBe(1);
    welcome.update(0.5, 5, true, speak);
    expect(tries).toBe(2);
    heard = true;
    welcome.update(0.5, 5, true, speak);
    expect(tries).toBe(3);
    welcome.update(1, 5, true, speak);
    expect(tries).toBe(3);
  });

  it('waits while the speaker is busy', () => {
    const welcome = new NpcApproachGreeting(greeting);
    let spoken = 0;
    welcome.update(0.1, 5, false, () => { spoken++; return true; });
    expect(spoken).toBe(0);
    welcome.update(0.1, 5, true, () => { spoken++; return true; });
    expect(spoken).toBe(1);
  });
});
