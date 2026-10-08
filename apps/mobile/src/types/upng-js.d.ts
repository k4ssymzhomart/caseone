declare module 'upng-js' {
  interface UpngImage {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames: unknown[];
    tabs: Record<string, unknown>;
    data: ArrayBuffer;
  }
  const UPNG: {
    decode(buffer: ArrayBuffer): UpngImage;
    toRGBA8(image: UpngImage): ArrayBuffer[];
  };
  export default UPNG;
}
