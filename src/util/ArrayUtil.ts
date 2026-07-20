export default class ArrayUtil {
    static clear(arg0: number[] | Int32Array, arg1: number, arg2: number): void {
        let var3 = arg2 - 7;
        while (arg1 < var3) {
            arg0[arg1++] = 0;
            arg0[arg1++] = 0;
            arg0[arg1++] = 0;
            arg0[arg1++] = 0;
            arg0[arg1++] = 0;
            arg0[arg1++] = 0;
            arg0[arg1++] = 0;
            arg0[arg1++] = 0;
        }
        var3 += 7;
        while (arg1 < var3) {
            arg0[arg1++] = 0;
        }
    }

    static copy(arg0: Uint8Array | Int8Array, arg1: number, arg2: Uint8Array | Int8Array, arg3: number, arg4: number): void;
    static copy(arg0: number[] | Int32Array | null): Int32Array | null;
    static copy(arg0: Uint8Array | Int8Array | number[] | Int32Array | null, arg1?: number, arg2?: Uint8Array | Int8Array, arg3?: number, arg4?: number): void | Int32Array | null {
        if (arguments.length === 1) {
            if (arg0 === null) {
                return null;
            }
            const var1 = new Int32Array(arg0.length);
            ArrayUtil.method838(arg0 as number[] | Int32Array, 0, var1, 0, arg0.length);
            return var1;
        }
        arg1 = arg1!;
        arg3 = arg3!;
        arg4 = arg4!;
        if (arg0 === arg2) {
            if (arg1 === arg3) {
                return;
            }
            if (arg3 > arg1 && arg3 < arg1 + arg4) {
                const var9 = arg4 - 1;
                let var5 = arg1 + var9;
                let var6 = arg3 + var9;
                let var7 = var5 - var9;
                const var10 = var7 + 7;
                while (var5 >= var10) {
                    arg2![var6--] = arg0![var5--];
                    arg2![var6--] = arg0![var5--];
                    arg2![var6--] = arg0![var5--];
                    arg2![var6--] = arg0![var5--];
                    arg2![var6--] = arg0![var5--];
                    arg2![var6--] = arg0![var5--];
                    arg2![var6--] = arg0![var5--];
                    arg2![var6--] = arg0![var5--];
                }
                var7 = var10 - 7;
                while (var5 >= var7) {
                    arg2![var6--] = arg0![var5--];
                }
                return;
            }
        }
        let var8 = arg4 + arg1;
        const var11 = var8 - 7;
        while (arg1 < var11) {
            arg2![arg3++] = arg0![arg1++];
            arg2![arg3++] = arg0![arg1++];
            arg2![arg3++] = arg0![arg1++];
            arg2![arg3++] = arg0![arg1++];
            arg2![arg3++] = arg0![arg1++];
            arg2![arg3++] = arg0![arg1++];
            arg2![arg3++] = arg0![arg1++];
            arg2![arg3++] = arg0![arg1++];
        }
        var8 = var11 + 7;
        while (arg1 < var8) {
            arg2![arg3++] = arg0![arg1++];
        }
    }

    static method837(arg0: number[] | Int32Array, arg1: number, arg2: number, arg3: number): void {
        let var4 = arg1 + arg2 - 7;
        while (arg1 < var4) {
            arg0[arg1++] = arg3;
            arg0[arg1++] = arg3;
            arg0[arg1++] = arg3;
            arg0[arg1++] = arg3;
            arg0[arg1++] = arg3;
            arg0[arg1++] = arg3;
            arg0[arg1++] = arg3;
            arg0[arg1++] = arg3;
        }
        var4 += 7;
        while (arg1 < var4) {
            arg0[arg1++] = arg3;
        }
    }

    static method838(arg0: number[] | Int32Array, arg1: number, arg2: number[] | Int32Array, arg3: number, arg4: number): void {
        if (arg0 === arg2) {
            return;
        }
        let var5 = arg4;
        const var6 = var5 - 7;
        while (arg1 < var6) {
            arg2[arg3++] = arg0[arg1++];
            arg2[arg3++] = arg0[arg1++];
            arg2[arg3++] = arg0[arg1++];
            arg2[arg3++] = arg0[arg1++];
            arg2[arg3++] = arg0[arg1++];
            arg2[arg3++] = arg0[arg1++];
            arg2[arg3++] = arg0[arg1++];
            arg2[arg3++] = arg0[arg1++];
        }
        var5 = var6 + 7;
        while (arg1 < var5) {
            arg2[arg3++] = arg0[arg1++];
        }
    }

    static method1276(arg0: Uint8Array | Int8Array): Int8Array {
        const var1 = arg0.length;
        const var2 = new Int8Array(var1);
        ArrayUtil.copy(arg0, 0, var2, 0, var1);
        return var2;
    }

    static method1534(arg0: number, arg1: number, arg2: number, arg3: number[] | Int32Array): void {
        arg0--;
        const var10 = arg2 - 1;
        const var4 = var10 - 7;
        while (arg0 < var4) {
            const var5 = arg0 + 1;
            arg3[var5] = arg1;
            const var6 = var5 + 1;
            arg3[var6] = arg1;
            const var7 = var6 + 1;
            arg3[var7] = arg1;
            const var8 = var7 + 1;
            arg3[var8] = arg1;
            const var9 = var8 + 1;
            arg3[var9] = arg1;
            const var11 = var9 + 1;
            arg3[var11] = arg1;
            const var12 = var11 + 1;
            arg3[var12] = arg1;
            arg0 = var12 + 1;
            arg3[arg0] = arg1;
        }
        while (arg0 < var10) {
            arg0++;
            arg3[arg0] = arg1;
        }
    }
}
