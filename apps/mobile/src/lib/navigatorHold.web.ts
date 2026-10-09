// Web build (DEPLOY_VM.md §4): a refresh on a deep link (/app/order/164) mounts that screen first, before the
// stored session is restored, and its guard would send the person back to the start. The navigator waits
// until the session is known (localStorage, plus a token refresh when it has expired).
import { useSessionReady } from './api';

export function useNavigatorHold(): boolean {
  return !useSessionReady();
}
