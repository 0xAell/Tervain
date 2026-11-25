/** The standalone edition resolves the same logical files from its embedded asset archive. */
declare global {
  interface Window {
    tervainFiles?: Record<string, string>;
  }
}
export const gameFile = (relative: string) =>
  window.tervainFiles?.[relative] ?? import.meta.env.BASE_URL + relative;
