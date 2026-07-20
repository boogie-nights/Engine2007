import Pix3D from '#/cache/dash3d/Pix3D.ts';

export default class Pix2D {
    static pixels: Int32Array = new Int32Array();

    static width: number = 0;
    static height: number = 0;

    static clipMinX: number = 0;
    static clipMaxX: number = 0;
    static clipMinY: number = 0;
    static clipMaxY: number = 0;

    static setPixels(arg0: Int32Array, arg1: number, arg2: number): void {
        Pix2D.pixels = arg0;
        Pix2D.width = arg1;
        Pix2D.height = arg2;
        Pix2D.setClipping(0, 0, arg1, arg2);
    }

    static resetClipping(): void {
        Pix2D.clipMinX = 0;
        Pix2D.clipMinY = 0;
        Pix2D.clipMaxX = Pix2D.width;
        Pix2D.clipMaxY = Pix2D.height;
    }

    static setSubClipping(arg0: number, arg1: number, arg2: number, arg3: number): void {
        if (Pix2D.clipMinX < arg0) {
            Pix2D.clipMinX = arg0;
        }
        if (Pix2D.clipMinY < arg1) {
            Pix2D.clipMinY = arg1;
        }
        if (Pix2D.clipMaxX > arg2) {
            Pix2D.clipMaxX = arg2;
        }
        if (Pix2D.clipMaxY > arg3) {
            Pix2D.clipMaxY = arg3;
        }
    }

    static setClipping(arg0: number, arg1: number, arg2: number, arg3: number): void {
        if (arg0 < 0) {
            arg0 = 0;
        }
        if (arg1 < 0) {
            arg1 = 0;
        }
        if (arg2 > Pix2D.width) {
            arg2 = Pix2D.width;
        }
        if (arg3 > Pix2D.height) {
            arg3 = Pix2D.height;
        }
        Pix2D.clipMinX = arg0;
        Pix2D.clipMinY = arg1;
        Pix2D.clipMaxX = arg2;
        Pix2D.clipMaxY = arg3;
    }

    static restoreClipping(arg0: Int32Array | number[]): void {
        Pix2D.clipMinX = arg0[0];
        Pix2D.clipMinY = arg0[1];
        Pix2D.clipMaxX = arg0[2];
        Pix2D.clipMaxY = arg0[3];
    }

    static saveClipping(arg0: Int32Array | number[]): void {
        arg0[0] = Pix2D.clipMinX;
        arg0[1] = Pix2D.clipMinY;
        arg0[2] = Pix2D.clipMaxX;
        arg0[3] = Pix2D.clipMaxY;
    }

    static cls(): void {
        let var0 = 0;
        let var1 = Pix2D.width * Pix2D.height - 7;
        while (var0 < var1) {
            Pix2D.pixels[var0++] = 0;
            Pix2D.pixels[var0++] = 0;
            Pix2D.pixels[var0++] = 0;
            Pix2D.pixels[var0++] = 0;
            Pix2D.pixels[var0++] = 0;
            Pix2D.pixels[var0++] = 0;
            Pix2D.pixels[var0++] = 0;
            Pix2D.pixels[var0++] = 0;
        }

        var1 += 7;
        while (var0 < var1) {
            Pix2D.pixels[var0++] = 0;
        }
    }

    static fillScanLine(arg0: number, arg1: number, arg2: Int32Array, arg3: Int32Array): void {
        let var4 = arg0 + arg1 * Pix2D.width;
        for (let var5 = 0; var5 < arg2.length; var5++) {
            let var6 = var4 + arg2[var5];
            for (let var7 = -arg3[var5]; var7 < 0; var7++) {
                Pix2D.pixels[var6++] = 0;
            }
            var4 += Pix2D.width;
        }
    }

    static method482(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number): void {
        let var6: number = 0;
        if (arg0 < Pix2D.clipMinX) {
            arg2 -= Pix2D.clipMinX - arg0;
            arg0 = Pix2D.clipMinX;
        }
        if (Pix2D.clipMinY > 0) {
            var6 = Pix2D.clipMinY * 2849;
            arg3 = 23 - Pix2D.clipMinY;
            arg1 = Pix2D.clipMinY;
        }
        if (arg0 + arg2 > Pix2D.clipMaxX) {
            arg2 = Pix2D.clipMaxX - arg0;
        }
        if (arg1 + arg3 > Pix2D.clipMaxY) {
            arg3 = Pix2D.clipMaxY - arg1;
        }
        const var7: number = Pix2D.width - arg2;
        let var8: number = arg0 + arg1 * Pix2D.width;
        for (let var9: number = -arg3; var9 < 0; var9++) {
            const var10: number = (65536 - var6) >> 8;
            const var11: number = var6 >> 8;
            const var12: number = ((((arg4 & 0xff00ff) * var10 + (arg5 & 0xff00ff) * var11) & 0xff00ff00) + (((arg4 & 0xff00) * var10 + (arg5 & 0xff00) * var11) & 0xff0000)) >>> 8;
            for (let var13: number = -arg2; var13 < 0; var13++) {
                Pix2D.pixels[var8++] = var12;
            }
            var8 += var7;
            var6 += 2849;
        }
    }

    static method495(arg0: number, arg1: number, arg2: number): void {
        if (arg0 >= Pix2D.clipMinX && arg1 >= Pix2D.clipMinY && arg0 < Pix2D.clipMaxX && arg1 < Pix2D.clipMaxY) {
            Pix2D.pixels[arg0 + arg1 * Pix2D.width] = arg2;
        }
    }

    static method498(arg0: number, arg1: number, arg2: number, arg3: number): void {
        if (arg2 === 0) {
            Pix2D.method495(arg0, arg1, arg3);
            return;
        }
        if (arg2 < 0) {
            arg2 = -arg2;
        }
        let var4 = arg1 - arg2;
        if (var4 < Pix2D.clipMinY) {
            var4 = Pix2D.clipMinY;
        }
        let var5 = arg1 + arg2 + 1;
        if (var5 > Pix2D.clipMaxY) {
            var5 = Pix2D.clipMaxY;
        }
        let var6 = var4;
        const var7 = arg2 * arg2;
        let var8 = 0;
        let var9 = arg1 - var4;
        let var10 = var9 * var9;
        let var11 = var10 - var9;
        if (arg1 > var5) {
            arg1 = var5;
        }
        while (var6 < arg1) {
            while (var11 <= var7 || var10 <= var7) {
                var10 += var8 + var8;
                var11 += var8++ + var8;
            }
            let var12 = arg0 + 1 - var8;
            if (var12 < Pix2D.clipMinX) {
                var12 = Pix2D.clipMinX;
            }
            let var13 = arg0 + var8;
            if (var13 > Pix2D.clipMaxX) {
                var13 = Pix2D.clipMaxX;
            }
            let var14 = var12 + var6 * Pix2D.width;
            for (let var15 = var12; var15 < var13; var15++) {
                Pix2D.pixels[var14++] = arg3;
            }
            var6++;
            var10 -= var9-- + var9;
            var11 -= var9 + var9;
        }
        let var16 = arg2;
        let var17 = var6 - arg1;
        let var18 = var17 * var17 + var7;
        let var19 = var18 - arg2;
        let var20 = var18 - var17;
        while (var6 < var5) {
            while (var20 > var7 && var19 > var7) {
                var20 -= var16-- + var16;
                var19 -= var16 + var16;
            }
            let var21 = arg0 - var16;
            if (var21 < Pix2D.clipMinX) {
                var21 = Pix2D.clipMinX;
            }
            let var22 = arg0 + var16;
            if (var22 > Pix2D.clipMaxX - 1) {
                var22 = Pix2D.clipMaxX - 1;
            }
            let var23 = var21 + var6 * Pix2D.width;
            for (let var24 = var21; var24 <= var22; var24++) {
                Pix2D.pixels[var23++] = arg3;
            }
            var6++;
            var20 += var17 + var17;
            var19 += var17++ + var17;
        }
    }

    static fillCircleTrans(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number): void {
        if (arg4 === 256) {
            Pix2D.method498(arg0, arg1, arg2, arg3);
            return;
        }
        const var5 = 256 - arg4;
        const var6 = arg4 * 255;
        const var7 = arg4 * 255;
        const var8 = (arg3 & 0xff) * arg4;
        let var9 = arg1 - arg2;
        if (var9 < Pix2D.clipMinY) {
            var9 = Pix2D.clipMinY;
        }
        let var10 = arg1 + arg2 + 1;
        if (var10 > Pix2D.clipMaxY) {
            var10 = Pix2D.clipMaxY;
        }
        let var11 = var9;
        const var12 = arg2 * arg2;
        let var13 = 0;
        let var14 = arg1 - var9;
        let var15 = var14 * var14;
        let var16 = var15 - var14;
        if (arg1 > var10) {
            arg1 = var10;
        }
        while (var11 < arg1) {
            while (var16 <= var12 || var15 <= var12) {
                var15 += var13 + var13;
                var16 += var13++ + var13;
            }
            let var17 = arg0 + 1 - var13;
            if (var17 < Pix2D.clipMinX) {
                var17 = Pix2D.clipMinX;
            }
            let var18 = arg0 + var13;
            if (var18 > Pix2D.clipMaxX) {
                var18 = Pix2D.clipMaxX;
            }
            let var19 = var17 + var11 * Pix2D.width;
            for (let var20 = var17; var20 < var18; var20++) {
                const var21 = ((Pix2D.pixels[var19] >> 16) & 0xff) * var5;
                const var22 = ((Pix2D.pixels[var19] >> 8) & 0xff) * var5;
                const var23 = (Pix2D.pixels[var19] & 0xff) * var5;
                const var24 = (((var6 + var21) >> 8) << 16) + (((var7 + var22) >> 8) << 8) + ((var8 + var23) >> 8);
                Pix2D.pixels[var19++] = var24;
            }
            var11++;
            var15 -= var14-- + var14;
            var16 -= var14 + var14;
        }
        let var25 = arg2;
        let var26 = -var14;
        let var27 = var26 * var26 + var12;
        let var28 = var27 - arg2;
        let var29 = var27 - var26;
        while (var11 < var10) {
            while (var29 > var12 && var28 > var12) {
                var29 -= var25-- + var25;
                var28 -= var25 + var25;
            }
            let var30 = arg0 - var25;
            if (var30 < Pix2D.clipMinX) {
                var30 = Pix2D.clipMinX;
            }
            let var31 = arg0 + var25;
            if (var31 > Pix2D.clipMaxX - 1) {
                var31 = Pix2D.clipMaxX - 1;
            }
            let var32 = var30 + var11 * Pix2D.width;
            for (let var33 = var30; var33 <= var31; var33++) {
                const var34 = ((Pix2D.pixels[var32] >> 16) & 0xff) * var5;
                const var35 = ((Pix2D.pixels[var32] >> 8) & 0xff) * var5;
                const var36 = (Pix2D.pixels[var32] & 0xff) * var5;
                const var37 = (((var6 + var34) >> 8) << 16) + (((var7 + var35) >> 8) << 8) + ((var8 + var36) >> 8);
                Pix2D.pixels[var32++] = var37;
            }
            var11++;
            var29 += var26 + var26;
            var28 += var26++ + var26;
        }
    }

    static method485(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number): void {
        const var6: number = arg2 - arg0;
        const var7: number = arg3 - arg1;
        const var8: number = var6 >= 0 ? var6 : -var6;
        const var9: number = var7 >= 0 ? var7 : -var7;
        let var10: number = var8;
        if (var8 < var9) {
            var10 = var9;
        }
        if (var10 === 0) {
            return;
        }
        let var11: number = ((var6 << 16) / var10) | 0;
        let var12: number = ((var7 << 16) / var10) | 0;
        if (var12 <= var11) {
            var11 = -var11;
        } else {
            var12 = -var12;
        }
        const var13: number = (arg5 * var12) >> 17;
        const var14: number = (arg5 * var12 + 1) >> 17;
        const var15: number = (arg5 * var11) >> 17;
        const var16: number = (arg5 * var11 + 1) >> 17;
        const var17: number = arg0 - Pix3D.getClipX();
        const var18: number = arg1 - Pix3D.getClipY();
        const var19 = var17 + var13;
        const var20 = var17 - var14;
        const var21 = var17 + var6 - var14;
        const var22 = var17 + var6 + var13;
        const var23 = var18 + var15;
        const var24 = var18 - var16;
        const var25 = var18 + var7 - var16;
        const var26 = var18 + var7 + var15;
        Pix3D.setHClip(var19, var20, var21);
        Pix3D.flatTriangle(var23, var24, var25, var19, var20, var21, arg4);
        Pix3D.setHClip(var19, var21, var22);
        Pix3D.flatTriangle(var23, var25, var26, var19, var21, var22, arg4);
    }

    static fillRectTrans(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number): void {
        if (arg0 < Pix2D.clipMinX) {
            arg2 -= Pix2D.clipMinX - arg0;
            arg0 = Pix2D.clipMinX;
        }

        if (arg1 < Pix2D.clipMinY) {
            arg3 -= Pix2D.clipMinY - arg1;
            arg1 = Pix2D.clipMinY;
        }

        if (arg0 + arg2 > Pix2D.clipMaxX) {
            arg2 = Pix2D.clipMaxX - arg0;
        }

        if (arg1 + arg3 > Pix2D.clipMaxY) {
            arg3 = Pix2D.clipMaxY - arg1;
        }

        const var6: number = ((((arg4 & 0xff00ff) * arg5) >> 8) & 0xff00ff) + ((((arg4 & 0xff00) * arg5) >> 8) & 0xff00);
        const var7: number = 256 - arg5;
        const var8: number = Pix2D.width - arg2;
        let var9: number = arg0 + arg1 * Pix2D.width;
        for (let var10: number = 0; var10 < arg3; var10++) {
            for (let var11: number = -arg2; var11 < 0; var11++) {
                const var12: number = Pix2D.pixels[var9];
                const var13: number = ((((var12 & 0xff00ff) * var7) >> 8) & 0xff00ff) + ((((var12 & 0xff00) * var7) >> 8) & 0xff00);
                Pix2D.pixels[var9++] = var6 + var13;
            }

            var9 += var8;
        }
    }

    static fillRect(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number): void {
        if (arg0 < Pix2D.clipMinX) {
            arg2 -= Pix2D.clipMinX - arg0;
            arg0 = Pix2D.clipMinX;
        }

        if (arg1 < Pix2D.clipMinY) {
            arg3 -= Pix2D.clipMinY - arg1;
            arg1 = Pix2D.clipMinY;
        }

        if (arg0 + arg2 > Pix2D.clipMaxX) {
            arg2 = Pix2D.clipMaxX - arg0;
        }

        if (arg1 + arg3 > Pix2D.clipMaxY) {
            arg3 = Pix2D.clipMaxY - arg1;
        }

        const var5: number = Pix2D.width - arg2;
        let var6: number = arg0 + arg1 * Pix2D.width;
        for (let var7: number = -arg3; var7 < 0; var7++) {
            for (let var8: number = -arg2; var8 < 0; var8++) {
                Pix2D.pixels[var6++] = arg4;
            }

            var6 += var5;
        }
    }

    static drawRect(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number): void {
        Pix2D.hline(arg0, arg1, arg2, arg4);
        Pix2D.hline(arg0, arg1 + arg3 - 1, arg2, arg4);
        Pix2D.vline(arg0, arg1, arg3, arg4);
        Pix2D.vline(arg0 + arg2 - 1, arg1, arg3, arg4);
    }

    static drawRectTrans(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number): void {
        Pix2D.hlineTrans(arg0, arg1, arg2, arg4, arg5);
        Pix2D.hlineTrans(arg0, arg1 + arg3 - 1, arg2, arg4, arg5);
        if (arg3 >= 3) {
            Pix2D.vlineTrans(arg0, arg1 + 1, arg3 - 2, arg4, arg5);
            Pix2D.vlineTrans(arg0 + arg2 - 1, arg1 + 1, arg3 - 2, arg4, arg5);
        }
    }

    static hline(arg0: number, arg1: number, arg2: number, arg3: number): void {
        if (arg1 < Pix2D.clipMinY || arg1 >= Pix2D.clipMaxY) {
            return;
        }

        if (arg0 < Pix2D.clipMinX) {
            arg2 -= Pix2D.clipMinX - arg0;
            arg0 = Pix2D.clipMinX;
        }

        if (arg0 + arg2 > Pix2D.clipMaxX) {
            arg2 = Pix2D.clipMaxX - arg0;
        }

        const var4 = arg0 + arg1 * Pix2D.width;
        for (let var5 = 0; var5 < arg2; var5++) {
            Pix2D.pixels[var4 + var5] = arg3;
        }
    }

    static hlineTrans(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number): void {
        if (arg1 < Pix2D.clipMinY || arg1 >= Pix2D.clipMaxY) {
            return;
        }

        if (arg0 < Pix2D.clipMinX) {
            arg2 -= Pix2D.clipMinX - arg0;
            arg0 = Pix2D.clipMinX;
        }

        if (arg0 + arg2 > Pix2D.clipMaxX) {
            arg2 = Pix2D.clipMaxX - arg0;
        }

        const var5: number = 256 - arg4;
        const var6: number = ((arg3 >> 16) & 0xff) * arg4;
        const var7: number = ((arg3 >> 8) & 0xff) * arg4;
        const var8: number = (arg3 & 0xff) * arg4;
        let var9: number = arg0 + arg1 * Pix2D.width;
        for (let var10: number = 0; var10 < arg2; var10++) {
            const var11: number = ((Pix2D.pixels[var9] >> 16) & 0xff) * var5;
            const var12: number = ((Pix2D.pixels[var9] >> 8) & 0xff) * var5;
            const var13: number = (Pix2D.pixels[var9] & 0xff) * var5;
            const var14: number = (((var6 + var11) >> 8) << 16) + (((var7 + var12) >> 8) << 8) + ((var8 + var13) >> 8);
            Pix2D.pixels[var9++] = var14;
        }
    }

    static vline(arg0: number, arg1: number, arg2: number, arg3: number): void {
        if (arg0 < Pix2D.clipMinX || arg0 >= Pix2D.clipMaxX) {
            return;
        }

        if (arg1 < Pix2D.clipMinY) {
            arg2 -= Pix2D.clipMinY - arg1;
            arg1 = Pix2D.clipMinY;
        }

        if (arg1 + arg2 > Pix2D.clipMaxY) {
            arg2 = Pix2D.clipMaxY - arg1;
        }

        const var4 = arg0 + arg1 * Pix2D.width;
        for (let var5 = 0; var5 < arg2; var5++) {
            Pix2D.pixels[var4 + var5 * Pix2D.width] = arg3;
        }
    }

    static vlineTrans(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number): void {
        if (arg0 < Pix2D.clipMinX || arg0 >= Pix2D.clipMaxX) {
            return;
        }

        if (arg1 < Pix2D.clipMinY) {
            arg2 -= Pix2D.clipMinY - arg1;
            arg1 = Pix2D.clipMinY;
        }

        if (arg1 + arg2 > Pix2D.clipMaxY) {
            arg2 = Pix2D.clipMaxY - arg1;
        }

        const var5: number = 256 - arg4;
        const var6: number = ((arg3 >> 16) & 0xff) * arg4;
        const var7: number = ((arg3 >> 8) & 0xff) * arg4;
        const var8: number = (arg3 & 0xff) * arg4;
        let var9: number = arg0 + arg1 * Pix2D.width;
        for (let var10: number = 0; var10 < arg2; var10++) {
            const var11: number = ((Pix2D.pixels[var9] >> 16) & 0xff) * var5;
            const var12: number = ((Pix2D.pixels[var9] >> 8) & 0xff) * var5;
            const var13: number = (Pix2D.pixels[var9] & 0xff) * var5;
            const var14: number = (((var6 + var11) >> 8) << 16) + (((var7 + var12) >> 8) << 8) + ((var8 + var13) >> 8);
            Pix2D.pixels[var9] = var14;
            var9 += Pix2D.width;
        }
    }

    static line(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number): void {
        let var5: number = arg2 - arg0;
        let var6: number = arg3 - arg1;
        if (var6 === 0) {
            if (var5 >= 0) {
                Pix2D.hline(arg0, arg1, var5 + 1, arg4);
            } else {
                Pix2D.hline(arg0 + var5, arg1, 1 - var5, arg4);
            }
        } else if (var5 !== 0) {
            if (var5 + var6 < 0) {
                arg0 += var5;
                var5 = -var5;
                arg1 += var6;
                var6 = -var6;
            }

            if (var5 > var6) {
                const var7: number = arg1 << 16;
                let var8: number = var7 + 32768;
                const var9: number = var6 << 16;
                const var10: number = Math.floor(var9 / var5 + 0.5);
                let var11: number = var5 + arg0;
                if (arg0 < Pix2D.clipMinX) {
                    var8 += var10 * (Pix2D.clipMinX - arg0);
                    arg0 = Pix2D.clipMinX;
                }
                if (var11 >= Pix2D.clipMaxX) {
                    var11 = Pix2D.clipMaxX - 1;
                }
                while (arg0 <= var11) {
                    const var12: number = var8 >> 16;
                    if (var12 >= Pix2D.clipMinY && var12 < Pix2D.clipMaxY) {
                        Pix2D.pixels[arg0 + var12 * Pix2D.width] = arg4;
                    }
                    var8 += var10;
                    arg0++;
                }
            } else {
                const var13: number = arg0 << 16;
                let var14: number = var13 + 32768;
                const var15: number = var5 << 16;
                const var16: number = Math.floor(var15 / var6 + 0.5);
                let var17: number = var6 + arg1;
                if (arg1 < Pix2D.clipMinY) {
                    var14 += var16 * (Pix2D.clipMinY - arg1);
                    arg1 = Pix2D.clipMinY;
                }
                if (var17 >= Pix2D.clipMaxY) {
                    var17 = Pix2D.clipMaxY - 1;
                }
                while (arg1 <= var17) {
                    const var18: number = var14 >> 16;
                    if (var18 >= Pix2D.clipMinX && var18 < Pix2D.clipMaxX) {
                        Pix2D.pixels[var18 + arg1 * Pix2D.width] = arg4;
                    }
                    var14 += var16;
                    arg1++;
                }
            }
        } else if (var6 >= 0) {
            Pix2D.vline(arg0, arg1, var6 + 1, arg4);
        } else {
            Pix2D.vline(arg0, arg1 + var6, -var6 + 1, arg4);
        }
    }
}
