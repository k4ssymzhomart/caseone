/// <reference types="node" />
import type { ExpoConfig } from 'expo/config';
import fs from 'node:fs';

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const hasGoogleServices = fs.existsSync(googleServicesFile);

const config: ExpoConfig = {
  name: 'Rota',
  slug: 'rota-qostanai',
  scheme: 'rota',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  backgroundColor: '#000000',
  android: {
    package: 'kz.rota.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#000000' },
    ...(hasGoogleServices ? { googleServicesFile } : {}),
    permissions: ['CAMERA', 'POST_NOTIFICATIONS', 'VIBRATE'],
    predictiveBackGestureEnabled: false,
  },
  ios: { bundleIdentifier: 'kz.rota.app', supportsTablet: false },
  plugins: [
    'expo-router',
    'expo-font',
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false }],
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#000000' }],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#FF3B30',
        sounds: ['./assets/sounds/siren.wav', './assets/sounds/ding.wav'],
      },
    ],
    ['expo-camera', { cameraPermission: 'Rota снимает фото до и после ремонта.' }],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Rota снимает фото до и после ремонта.',
        photosPermission: 'Rota прикрепляет фото неисправности к наряду.',
      },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: { eas: { projectId: undefined } }, // step 0.9 writes the real id here
};

export default config;
