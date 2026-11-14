/**
 * House doors open for whoever comes near and close behind them: within `reach` of the doorway (m) a door swings
 * open over `opening` seconds, stays open `linger` seconds after the last person has left, and closes over `closing`.
 */
export const DOORS = { reach: 2.4, linger: 1.5, opening: 0.6, closing: 0.9, swing: Math.PI / 2 } as const;
