export default abstract class Pix8 {
    yof: number = 0;
    owi: number = 0;
    wi: number = 0;
    hi: number = 0;
    xof: number = 0;
    ohi: number = 0;

    abstract plotSprite(arg0: number, arg1: number): void;

    abstract transPlotSprite(arg0: number, arg1: number, arg2: number): void;
}
