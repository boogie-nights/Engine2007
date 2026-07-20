export default interface TextureProvider {
    isOpaque(id: number): boolean;
    getTexels(brightness: number, id: number): Int32Array | null;
    isTextureEnabled(id: number): boolean;
    isLowMem(id: number): boolean;
    getAverageRgb(id: number): number;
    isLoaded(id: number): boolean;
    getTexels(id: number): Int32Array | null;
}
