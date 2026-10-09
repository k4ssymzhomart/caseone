// Web build of the photo pipeline (DEPLOY_VM.md §4, CLAUDE.md §17). expo-image-picker opens a file input (the
// rear camera on phones), a canvas compresses to the long side 1600 at JPEG 0.7, crypto.subtle gives the
// SHA-256 and a 9 × 8 canvas the dHash. The bytes go to the same upload path as on the phones. Browsers hide
// EXIF, so captured_at is the moment the picker returned and exif stays empty; source is `camera` for the camera
// input and `gallery` for the file picker.
import * as ImagePicker from 'expo-image-picker';

import { dhashFromRgba } from './dhash';
import { exifTimeToIso } from './exifTime';
import type { PhotoSource, PreparedPhoto } from './photo';

export type { PhotoKind, PhotoSource, PreparedPhoto } from './photo';
export { exifTimeToIso };

const LONG_SIDE = 1600;
const JPEG_QUALITY = 0.7;

/** Browsers are never the simulator: the camera input is offered everywhere (a file chooser on desktops). */
export const isSimulator = false;

export class PhotoCancelled extends Error {
  constructor() {
    super('PHOTO_CANCELLED');
  }
}

export class PhotoPermissionDenied extends Error {
  constructor() {
    super('PHOTO_PERMISSION');
  }
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  if (typeof img.decode === 'function') {
    await img.decode();
    return img;
  }
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_DECODE'));
  });
}

function canvas2d(width: number, height: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('CANVAS_UNAVAILABLE');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return { canvas, g };
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('JPEG_ENCODE'))), 'image/jpeg', JPEG_QUALITY);
  });
}

/** dHash of the compressed JPEG, like the phones: the image drawn into 9 × 8, then the shared hash. */
async function computeDhash(uri: string): Promise<string | null> {
  try {
    const img = await loadImage(uri);
    const { g } = canvas2d(9, 8);
    g.drawImage(img, 0, 0, 9, 8);
    return dhashFromRgba(new Uint8Array(g.getImageData(0, 0, 9, 8).data), 9, 8);
  } catch {
    return null;
  }
}

/** Compresses to the long side 1600 at JPEG 0.7 (target ≤ 350 KB), then hashes. */
export async function preparePhoto(
  asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'width' | 'height' | 'exif'>,
  source: PhotoSource,
  pickedAt: Date,
  _options: { trustExifTime?: boolean } = {},
): Promise<PreparedPhoto> {
  const img = await loadImage(asset.uri);
  // naturalWidth and drawImage follow the EXIF orientation in current browsers.
  const w0 = img.naturalWidth || asset.width;
  const h0 = img.naturalHeight || asset.height;
  const scale = Math.min(1, LONG_SIDE / Math.max(w0, h0, 1));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const { canvas, g } = canvas2d(width, height);
  g.drawImage(img, 0, 0, width, height);
  const blob = await toJpeg(canvas);
  if (asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri);

  const data = new Uint8Array(await blob.arrayBuffer());
  const sha256 = toHex(await crypto.subtle.digest('SHA-256', data));
  const uri = URL.createObjectURL(blob);
  const dhash = await computeDhash(uri);

  return {
    uri,
    width,
    height,
    bytes: data.byteLength,
    sha256,
    dhash,
    source,
    capturedAt: pickedAt.toISOString(),
    exif: null,
    data,
  };
}

// No permission calls before the pickers: the browser grants nothing up front, and an await before the click
// would cost the tap's user activation on iOS Safari, which then refuses to open the file input.
async function fromLibrary(): Promise<ImagePicker.ImagePickerAsset> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) throw new PhotoCancelled();
  return asset;
}

async function fromCamera(): Promise<ImagePicker.ImagePickerAsset> {
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: ImagePicker.CameraType.back,
    quality: 1,
  });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) throw new PhotoCancelled();
  return asset;
}

/** «После»: the camera input (the rear camera on phones, a file chooser on desktops). */
export async function takeAfterPhoto(): Promise<PreparedPhoto> {
  const asset = await fromCamera();
  return preparePhoto(asset, 'camera', new Date());
}

/** «До»: the camera input or the file picker (the case allows the gallery). */
export async function takeBeforePhoto(from: 'camera' | 'library'): Promise<PreparedPhoto> {
  if (from === 'library') {
    const asset = await fromLibrary();
    return preparePhoto(asset, 'gallery', new Date());
  }
  const asset = await fromCamera();
  return preparePhoto(asset, 'camera', new Date());
}
