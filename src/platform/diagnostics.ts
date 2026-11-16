/**
 * The F3 panel's test controls (teleporting, the quest's shortcuts, setting the time, sending residents away, healing)
 * change the journey, and its benchmark flies the camera along a route for a minute while the world runs on round a
 * wanderer nobody is watching, so a player's build offers neither: only the development server does, or a page opened
 * with `?debug`. Its diagnostics are offered to everyone; the README sends players to the revision it shows. The tools
 * start the benchmark through `window.tervain` and `?bench`, not the panel.
 */
export function testControlsOffered(search: string, development: boolean): boolean {
  return development || new URLSearchParams(search).has('debug');
}
