// Photo pipeline (CLAUDE.md §17, PHASE_0 0.6, PHASE_2 2.4): capture, compress, hash, dHash.
// Upload and attach happen in the API layer; this module only prepares the bytes and metadata.
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import UPNG from 'upng-js';

import { dhashFromRgba } from './dhash';

export type PhotoSource = 'camera' | 'gallery';
export type PhotoKind = 'before' | 'after';

export interface PreparedPhoto {
  /** Local file of the compressed JPEG. */
  uri: string;
  width: number;
  height: number;
  /** Compressed size in bytes. */
  bytes: number;
  sha256: string;
  dhash: string | null;
  source: PhotoSource;
  /** ISO UTC. EXIF DateTimeOriginal when present, else the moment the picker returned. */
  capturedAt: string;
  exif: Record<string, unknown> | null;
  /** The compressed bytes, uploaded as they are. */
  data: Uint8Array;
}

const LONG_SIDE = 1600;
const KZ_OFFSET = '+05:00'; // Asia/Qostanay, UTC+5 all year

/** True on the iOS Simulator and Android emulators: no camera there. */
export const isSimulator = !Device.isDevice;

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

/** EXIF «2026:10:09 10:42:13» (camera local time) plus an optional «+05:00» → ISO UTC. */
export function exifTimeToIso(
  value: unknown,
  offset: unknown,
): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const tz = typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset.trim()) ? offset.trim() : KZ_OFFSET;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function computeDhash(uri: string): Promise<string | null> {
  try {
    const ref = await ImageManipulator.manipulate(uri).resize({ width: 9, height: 8 }).renderAsync();
    const png = await ref.saveAsync({ format: SaveFormat.PNG, base64: true });
    if (!png.base64) return null;
    const bytes = base64ToBytes(png.base64);
    const img = UPNG.decode(bytes.buffer as ArrayBuffer);
    const rgba = UPNG.toRGBA8(img)[0];
    if (!rgba) return null;
    return dhashFromRgba(new Uint8Array(rgba), img.width, img.height);
  } catch {
    return null;
  }
}

/** Compresses to the long side 1600 at JPEG 0.7 (target ≤ 350 KB), then hashes. */
export async function preparePhoto(
  asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'width' | 'height' | 'exif'>,
  source: PhotoSource,
  pickedAt: Date,
  options: { trustExifTime?: boolean } = {},
): Promise<PreparedPhoto> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  const landscape = asset.width >= asset.height;
  const long = Math.max(asset.width, asset.height);
  if (long > LONG_SIDE) ctx.resize(landscape ? { width: LONG_SIDE } : { height: LONG_SIDE });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });

  const data = await new File(out.uri).bytes();
  const sha256 = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data));
  const dhash = await computeDhash(out.uri);

  const exif = (asset.exif ?? null) as Record<string, unknown> | null;
  const exifTime =
    options.trustExifTime === false
      ? null
      : exifTimeToIso(exif?.DateTimeOriginal ?? exif?.DateTime, exif?.OffsetTimeOriginal ?? exif?.OffsetTime);

  return {
    uri: out.uri,
    width: out.width,
    height: out.height,
    bytes: data.byteLength,
    sha256,
    dhash,
    source,
    capturedAt: exifTime ?? pickedAt.toISOString(),
    exif,
    data,
  };
}

async function fromLibrary(): Promise<ImagePicker.ImagePickerAsset> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new PhotoPermissionDenied();
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: true, quality: 1 });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) throw new PhotoCancelled();
  return asset;
}

async function fromCamera(): Promise<ImagePicker.ImagePickerAsset> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new PhotoPermissionDenied();
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], exif: true, quality: 1 });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) throw new PhotoCancelled();
  return asset;
}

/**
 * «После»: camera only on devices. The simulator has no camera, so it falls back to the library,
 * records `gallery`, and uses the moment the picker returned as `captured_at` so rule R2 can pass
 * during development (PHASE_2 2.4).
 */
export async function takeAfterPhoto(): Promise<PreparedPhoto> {
  if (isSimulator) {
    const asset = await fromLibrary();
    return preparePhoto(asset, 'gallery', new Date(), { trustExifTime: false });
  }
  const asset = await fromCamera();
  return preparePhoto(asset, 'camera', new Date());
}

/** «До»: camera or library (the case allows the gallery). On the simulator the camera falls back to the library. */
export async function takeBeforePhoto(from: 'camera' | 'library'): Promise<PreparedPhoto> {
  if (from === 'library' || isSimulator) {
    const asset = await fromLibrary();
    return preparePhoto(asset, 'gallery', new Date(), { trustExifTime: !isSimulator });
  }
  const asset = await fromCamera();
  return preparePhoto(asset, 'camera', new Date());
}
