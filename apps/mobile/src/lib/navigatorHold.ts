// Whether the root navigator waits before mounting any screen. Native: no. A phone always starts on the index
// route, which waits for the restored session itself, and notification links open only after that.
export function useNavigatorHold(): boolean {
  return false;
}
