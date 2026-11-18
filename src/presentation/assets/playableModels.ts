/** File-backed game art authored from Tervain geometry. Older model study fixtures remain in the
 * source checkout. The browser loader and both local and hosted build pipelines use the same list. */
export function playableModel(file: string): boolean {
  return /^(?:flora\/(?:craft|hero)\/[a-z0-9-]+\.glb|craft\/furniture\/(?:[a-z0-9-]+\.glb|manifest\.json)|scenery\/intertidal-schist\.glb)$/.test(file);
}
