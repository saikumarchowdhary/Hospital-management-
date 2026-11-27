declare module 'jsqr' {
  interface QRCode {
    data: string;
    binaryData: Uint8ClampedArray;
    location: {
      topLeftCorner: { x: number; y: number };
      topRightCorner: { x: number; y: number };
      bottomRightCorner: { x: number; y: number };
      bottomLeftCorner: { x: number; y: number };
      topLeftFinder: { x: number; y: number };
      topRightFinder: { x: number; y: number };
      bottomLeftFinder: { x: number; y: number };
    };
  }
  function jsQR(data: Uint8ClampedArray, width: number, height: number, options?: any): QRCode | null;
  export = jsQR;
}
