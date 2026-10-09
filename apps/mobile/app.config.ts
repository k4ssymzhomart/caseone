/// <reference types="node" />
import type { ExpoConfig } from 'expo/config';
import fs from 'node:fs';

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const hasGoogleServices = fs.existsSync(googleServicesFile);
// The PWA export sets EXPO_BASE_URL=/app (DEPLOY_VM.md §4); native builds and the dev server stay at the root.
const baseUrl = process.env.EXPO_BASE_URL;

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
  web: { output: 'single', bundler: 'metro', favicon: './assets/icon.png' },
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
  experiments: { typedRoutes: true, reactCompiler: true, ...(baseUrl ? { baseUrl } : {}) },
  extra: { eas: { projectId: 'de6b8e43-4d09-49ad-baa3-897694e7b4be' } },
  owner: 'k4ssym',
};

export default config;
