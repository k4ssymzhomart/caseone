// Web build (DEPLOY_VM.md §4): no hardware back button (react-native-web logs an error for BackHandler);
// the browser's back button moves through the router history instead.
export function onHardwareBack(_handler: () => boolean): () => void {
  return () => undefined;
}
