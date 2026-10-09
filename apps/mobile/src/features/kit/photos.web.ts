// Web build: react-native-web's Image has no resolveAssetSource (the kit crashed on load), expo-asset gives the
// served URL of the same assets.
import { Asset } from 'expo-asset';

export const KIT_PHOTO_URIS = [
  Asset.fromModule(require('../../../assets/icon.png')).uri,
  Asset.fromModule(require('../../../assets/splash-icon.png')).uri,
  Asset.fromModule(require('../../../assets/adaptive-icon.png')).uri,
] as const;
