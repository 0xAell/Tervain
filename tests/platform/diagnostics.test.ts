import { describe, expect, it } from 'vitest';
import { testControlsOffered } from '../../src/platform/diagnostics';

describe('the F3 panel', () => {
  it('offers its test controls on the development server or with ?debug, never to a player’s ordinary page', () => {
    expect(testControlsOffered('', false)).toBe(false);
    expect(testControlsOffered('?shot=1&quality=high', false), 'a capture is not a debugging session').toBe(false);
    expect(testControlsOffered('?debug=1', false)).toBe(true);
    expect(testControlsOffered('?quality=low&debug', false)).toBe(true);
    expect(testControlsOffered('', true)).toBe(true);
  });
});
