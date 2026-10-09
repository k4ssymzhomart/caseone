// Placeholder photos for the /kit gallery, from the app's own assets.
import { Image } from 'react-native';

export const KIT_PHOTO_URIS = [
  Image.resolveAssetSource(require('../../../assets/icon.png')).uri,
  Image.resolveAssetSource(require('../../../assets/splash-icon.png')).uri,
  Image.resolveAssetSource(require('../../../assets/adaptive-icon.png')).uri,
] as const;
