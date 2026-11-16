/**
 * The F3 panel's test controls (teleporting, the quest's shortcuts, setting the time, sending residents away, healing)
 * change the journey, so a player's build does not offer them: only the development server does, or a page opened with
 * `?debug`. Its diagnostics and the benchmark are offered to everyone; the README sends players to the revision it shows.
 */
export function testControlsOffered(search: string, development: boolean): boolean {
  return development || new URLSearchParams(search).has('debug');
}
