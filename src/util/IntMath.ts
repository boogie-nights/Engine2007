export default class IntMath {
    static bitceil(arg0: number): number {
        const var6 = arg0 - 1;
        const var1 = var6 | (var6 >>> 1);
        const var2 = var1 | (var1 >>> 2);
        const var3 = var2 | (var2 >>> 4);
        const var4 = var3 | (var3 >>> 8);
        const var5 = var4 | (var4 >>> 16);
        return var5 + 1;
    }

    static method1058(arg0: number, arg1: number, arg2: number): number {
        if (arg0 > arg2) {
            return arg0;
        } else if (arg2 > arg1) {
            return arg1;
        } else {
            return arg2;
        }
    }
}
