/** True on phones/tablets (coarse primary pointer) or when forced with ?touch=1 for testing. */
export function wantsTouchControls(): boolean {
  if (new URLSearchParams(window.location.search).get('touch') === '1') return true;
  return window.matchMedia('(pointer: coarse)').matches;
}
