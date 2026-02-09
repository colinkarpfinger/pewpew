/** Detect if the device is a touch-primary mobile/tablet */
export function isMobile(): boolean {
  return 'ontouchstart' in window && navigator.maxTouchPoints > 0;
}
