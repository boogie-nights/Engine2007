import Linkable2 from '#/util/Linkable2.ts';

import Pix2D from '#/cache/graphics/Pix2D.js';
import type Pix8 from '#/cache/graphics/Pix8.js';
import JagString from '#/util/JagString.ts';

export default abstract class PixfontGeneric extends Linkable2 {
    charAdvance: Int32Array = new Int32Array(256);
    glyphWidth: Int32Array = new Int32Array(256);
    glyphHeight: Int32Array = new Int32Array(256);
    glyphOffsetX: Int32Array = new Int32Array(256);
    glyphOffsetY: Int32Array = new Int32Array(256);
    ascent: number = 0;
    maxAscent: number = 0;
    maxDescent: number = 0;
    modiconHeight: Int32Array | number[] | null = null;
    modicons: Pix8[] = [];
    kerningPairs: Int8Array | null = null;

    static readonly tagCopy: string = 'copy';
    static readonly tagGt: string = 'gt';
    static readonly tagTrans: string = 'trans=';
    static readonly tagShy: string = 'shy';
    static readonly tagShad: string = 'shad';
    static readonly tagCol: string = 'col=';
    static readonly tagEndStr: string = '/str';
    static readonly tagLt: string = 'lt';
    static readonly tagEndTrans: string = '/trans';
    static readonly tagEndCol: string = '/col';
    static readonly tagU: string = 'u';
    static readonly tagStr: string = 'str';
    static readonly tagImg: string = 'img=';
    static readonly tagBr: string = 'br';
    static readonly tagShadEquals: string = 'shad=';
    static readonly tagTimes: string = 'times';
    static readonly tagNbsp: string = 'nbsp';
    static readonly tagReg: string = 'reg';
    static readonly tagEuro: string = 'euro';
    static readonly tagEndShad: string = '/shad';
    static readonly tagStrEquals: string = 'str=';
    static readonly tagEndU: string = '/u';
    static readonly tagUEquals: string = 'u=';

    static strikeout: number = -1;
    static underline: number = -1;
    static defaultShadow: number = -1;
    static currentShadow: number = -1;
    static defaultCol: number = 0;
    static currentCol: number = 0;
    static defaultAlpha: number = 256;
    static alpha: number = 256;
    static extraSpaceWidth: number = 0;
    static extraSpacePos: number = 0;

    static lines: string[] = new Array(100);

    constructor(arg0: Uint8Array);
    constructor(arg0: Uint8Array, arg1: Int32Array | number[], arg2: Int32Array | number[], arg3: Int32Array | number[], arg4: Int32Array | number[]);
    constructor(arg0: Uint8Array, arg1?: Int32Array | number[], arg2?: Int32Array | number[], arg3?: Int32Array | number[], arg4?: Int32Array | number[]) {
        super();
        if (arg1 && arg2 && arg3 && arg4) {
            this.glyphOffsetX = arg1 instanceof Int32Array ? arg1 : Int32Array.from(arg1);
            this.glyphOffsetY = arg2 instanceof Int32Array ? arg2 : Int32Array.from(arg2);
            this.glyphWidth = arg3 instanceof Int32Array ? arg3 : Int32Array.from(arg3);
            this.glyphHeight = arg4 instanceof Int32Array ? arg4 : Int32Array.from(arg4);
            this.unpackMetrics(arg0);
            let minY = 0x7fffffff;
            let maxY = -0x80000000;
            for (let i = 0; i < 256; i++) {
                if (this.glyphOffsetY[i] < minY && this.glyphHeight[i] !== 0) minY = this.glyphOffsetY[i];
                if (this.glyphOffsetY[i] + this.glyphHeight[i] > maxY) maxY = this.glyphOffsetY[i] + this.glyphHeight[i];
            }
            this.maxAscent = this.ascent - minY;
            this.maxDescent = maxY - this.ascent;
        } else {
            this.unpackMetrics(arg0);
        }
    }

    unpackMetrics(arg0: Uint8Array): void {
        this.charAdvance = new Int32Array(256);

        if (arg0.length === 257) {
            for (let var2 = 0; var2 < this.charAdvance.length; var2++) {
                this.charAdvance[var2] = arg0[var2] & 0xff;
            }
            this.ascent = arg0[256] & 0xff;
            return;
        }

        let var3 = 0;
        for (let var4 = 0; var4 < 256; var4++) {
            this.charAdvance[var4] = arg0[var3++] & 0xff;
        }

        const var5 = new Int32Array(256);
        const var6 = new Int32Array(256);
        for (let var7 = 0; var7 < 256; var7++) {
            var5[var7] = arg0[var3++] & 0xff;
        }
        for (let var8 = 0; var8 < 256; var8++) {
            var6[var8] = arg0[var3++] & 0xff;
        }

        const var9 = new Array<Int8Array>(256);
        for (let var10 = 0; var10 < 256; var10++) {
            var9[var10] = new Int8Array(var5[var10]);
            let var11 = 0;
            for (let var12 = 0; var12 < var9[var10].length; var12++) {
                var11 = ((var11 + arg0[var3++]) << 24) >> 24;
                var9[var10][var12] = var11;
            }
        }

        const var13 = new Array<Int8Array>(256);
        for (let var14 = 0; var14 < 256; var14++) {
            var13[var14] = new Int8Array(var5[var14]);
            let var15 = 0;
            for (let var16 = 0; var16 < var13[var14].length; var16++) {
                var15 = ((var15 + arg0[var3++]) << 24) >> 24;
                var13[var14][var16] = var15;
            }
        }

        this.kerningPairs = new Int8Array(65536);
        for (let var17 = 0; var17 < 256; var17++) {
            if (var17 !== 32 && var17 !== 160) {
                for (let var18 = 0; var18 < 256; var18++) {
                    if (var18 !== 32 && var18 !== 160) {
                        this.kerningPairs[(var17 << 8) + var18] = PixfontGeneric.kernPair(var9, var13, var6, this.charAdvance, var5, var17, var18);
                    }
                }
            }
        }

        this.ascent = var6[32] + var5[32];
    }

    static kernPair(arg0: Int8Array[], arg1: Int8Array[], arg2: Int32Array, arg3: Int32Array, arg4: Int32Array, arg5: number, arg6: number): number {
        const var7: number = arg2[arg5];
        const var8: number = var7 + arg4[arg5];
        const var9: number = arg2[arg6];
        const var10: number = var9 + arg4[arg6];
        let var11: number = var7;
        if (var9 > var7) {
            var11 = var9;
        }
        let var12: number = var8;
        if (var10 < var8) {
            var12 = var10;
        }
        let var13: number = arg3[arg5];
        if (arg3[arg6] < var13) {
            var13 = arg3[arg6];
        }
        const var14: Int8Array = arg1[arg5];
        const var15: Int8Array = arg0[arg6];
        let var16: number = var11 - var7;
        let var17: number = var11 - var9;
        for (let var18: number = var11; var18 < var12; var18++) {
            const var19: number = var14[var16++] + var15[var17++];
            if (var19 < var13) {
                var13 = var19;
            }
        }
        return -var13;
    }

    charWid(arg0: number): number {
        return this.charAdvance[arg0 & 0xff];
    }

    stringWid(arg0: string | null): number {
        if (arg0 === null) {
            return 0;
        }

        let var2 = -1;
        let var3 = -1;
        let var4 = 0;
        for (let var5 = 0; var5 < arg0.length; var5++) {
            let var6 = arg0.charCodeAt(var5) & 0xff;
            if (var6 === 60) {
                var2 = var5;
            } else {
                if (var6 === 62 && var2 !== -1) {
                    const var7 = arg0.substring(var2 + 1, var5);
                    var2 = -1;
                    if (var7 === PixfontGeneric.tagLt) {
                        var6 = 60;
                    } else if (var7 === PixfontGeneric.tagGt) {
                        var6 = 62;
                    } else if (var7 === PixfontGeneric.tagNbsp) {
                        var6 = 160;
                    } else if (var7 === PixfontGeneric.tagShy) {
                        var6 = 173;
                    } else if (var7 === PixfontGeneric.tagTimes) {
                        var6 = 215;
                    } else if (var7 === PixfontGeneric.tagEuro) {
                        var6 = 128;
                    } else if (var7 === PixfontGeneric.tagCopy) {
                        var6 = 169;
                    } else {
                        if (var7 !== PixfontGeneric.tagReg) {
                            if (var7.startsWith(PixfontGeneric.tagImg)) {
                                try {
                                    const var8 = JagString.wrap(var7.substring(4)).toInt();
                                    var4 += this.modicons[var8].owi;
                                    var3 = -1;
                                } catch (var9) {}
                            }
                            continue;
                        }
                        var6 = 174;
                    }
                }
                if (var2 === -1) {
                    var4 += this.charAdvance[var6];
                    if (this.kerningPairs !== null && var3 !== -1) {
                        var4 += this.kerningPairs[(var3 << 8) + var6];
                    }
                    var3 = var6;
                }
            }
        }

        return var4;
    }

    splitString(str: string | null, widths: number[] | Int32Array | null = null, out: string[] = PixfontGeneric.lines): number {
        if (str === null) {
            return 0;
        }
        let width = 0;
        let start = 0;
        let builder = '';
        let breakPos = -1;
        let breakWidth = 0;
        let breakSkip = 0;
        let tagStart = -1;
        let previous = -1;
        let count = 0;

        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i) & 0xff;
            if (code === 60) {
                tagStart = i;
            } else {
                if (code === 62 && tagStart !== -1) {
                    const tag = str.substring(tagStart + 1, i);
                    tagStart = -1;
                    builder += '<' + tag + '>';
                    if (tag === 'br') {
                        out[count++] = builder.substring(start, builder.length);
                        start = builder.length;
                        width = 0;
                        breakPos = -1;
                        previous = -1;
                    } else {
                        let tagged = -1;
                        if (tag === 'lt') tagged = 60;
                        else if (tag === 'gt') tagged = 62;
                        else if (tag === 'nbsp') tagged = 160;
                        else if (tag === 'shy') tagged = 173;
                        else if (tag === 'times') tagged = 215;
                        else if (tag === 'euro') tagged = 128;
                        else if (tag === 'copy') tagged = 169;
                        else if (tag === 'reg') tagged = 174;
                        if (tagged >= 0) {
                            width += this.charWid(tagged);
                            if (this.kerningPairs !== null && previous !== -1) {
                                width += this.kerningPairs[(previous << 8) + tagged];
                            }
                            previous = tagged;
                        } else if (tag.startsWith('img=')) {
                            try {
                                const value = tag.substring(4);
                                if (!/^[+-]?\d+$/.test(value)) {
                                    throw new Error();
                                }
                                const icon = this.modicons[parseInt(value, 10)];
                                width += icon.owi;
                                previous = -1;
                            } catch {}
                        }
                    }
                    code = -1;
                }
                if (tagStart === -1) {
                    if (code !== -1) {
                        builder += String.fromCharCode(code);
                        width += this.charWid(code);
                        if (this.kerningPairs !== null && previous !== -1) {
                            width += this.kerningPairs[(previous << 8) + code];
                        }
                        previous = code;
                    }
                    if (code === 32) {
                        breakPos = builder.length;
                        breakWidth = width;
                        breakSkip = 1;
                    }
                    if (widths !== null && width > widths[count < widths.length ? count : widths.length - 1] && breakPos >= 0) {
                        out[count++] = builder.substring(start, breakPos - breakSkip);
                        start = breakPos;
                        breakPos = -1;
                        width -= breakWidth;
                        previous = -1;
                    }
                    if (code === 45) {
                        breakPos = builder.length;
                        breakWidth = width;
                        breakSkip = 0;
                    }
                }
            }
        }
        if (builder.length > start) {
            out[count++] = builder.substring(start, builder.length);
        }
        return count;
    }

    predictWidthMultiline(arg0: string | null, arg1: number): number {
        const var3 = this.splitString(arg0, Int32Array.from([arg1]), PixfontGeneric.lines);
        let var4 = 0;
        for (let var5 = 0; var5 < var3; var5++) {
            const var6 = this.stringWid(PixfontGeneric.lines[var5]);
            if (var6 > var4) {
                var4 = var6;
            }
        }
        return var4;
    }

    predictLinesMultiline(arg0: string | null, arg1: number): number {
        return this.splitString(arg0, Int32Array.from([arg1]), PixfontGeneric.lines);
    }

    static escape(arg0: string): string {
        const var1 = arg0.length;
        let var2 = 0;
        for (let var3 = 0; var3 < var1; var3++) {
            const var4 = arg0.charCodeAt(var3);
            if (var4 === 60 || var4 === 62) {
                var2 += 3;
            }
        }
        let var5 = '';
        for (let var7 = 0; var7 < var1; var7++) {
            const var8 = arg0.charCodeAt(var7);
            if (var8 === 60) {
                var5 += '<lt>';
            } else if (var8 === 62) {
                var5 += '<gt>';
            } else {
                var5 += arg0.charAt(var7);
            }
        }
        return var5;
    }

    drawString(arg0: string | null, arg1: number, arg2: number, arg3: number, arg4: number = -1): void {
        if (arg0 !== null) {
            this.resetState(arg3, arg4);
            this.drawStringInner(arg0, arg1, arg2);
        }
    }

    rightString(arg0: string | null, arg1: number, arg2: number, arg3: number, arg4: number = -1): void {
        if (arg0 !== null) {
            this.resetState(arg3, arg4);
            this.drawStringInner(arg0, arg1 - this.stringWid(arg0), arg2);
        }
    }

    centreString(arg0: string | null, arg1: number, arg2: number, arg3: number, arg4: number = -1): void {
        if (arg0 !== null) {
            this.resetState(arg3, arg4);
            this.drawStringInner(arg0, arg1 - ((this.stringWid(arg0) / 2) | 0), arg2);
        }
    }

    drawStringMultilineCore(arg0: string | null, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number, arg7: number, arg8: number, arg9: number): number {
        if (arg0 === null) {
            return 0;
        }

        this.resetStateAlpha(arg5, arg6, 256);
        if (arg9 === 0) {
            arg9 = this.ascent;
        }

        let var11: number[] | null = [arg3];
        if (arg4 < this.maxAscent + this.maxDescent + arg9 && arg4 < arg9 + arg9) {
            var11 = null;
        }
        const var12 = this.splitString(arg0, var11, PixfontGeneric.lines);
        if (arg8 === 3 && var12 === 1) {
            arg8 = 1;
        }

        let var13: number;
        if (arg8 === 0) {
            var13 = arg2 + this.maxAscent;
        } else if (arg8 === 1) {
            var13 = (arg2 + this.maxAscent + (arg4 - this.maxAscent - this.maxDescent - (var12 - 1) * arg9) / 2) | 0;
        } else if (arg8 === 2) {
            var13 = arg2 + arg4 - this.maxDescent - (var12 - 1) * arg9;
        } else {
            let var14 = ((arg4 - this.maxAscent - this.maxDescent - (var12 - 1) * arg9) / (var12 + 1)) | 0;
            if (var14 < 0) {
                var14 = 0;
            }
            var13 = arg2 + this.maxAscent + var14;
            arg9 += var14;
        }

        for (let var15 = 0; var15 < var12; var15++) {
            if (arg7 === 0) {
                this.drawStringInner(PixfontGeneric.lines[var15], arg1, var13);
            } else if (arg7 === 1) {
                this.drawStringInner(PixfontGeneric.lines[var15], (arg1 + (arg3 - this.stringWid(PixfontGeneric.lines[var15])) / 2) | 0, var13);
            } else if (arg7 === 2) {
                this.drawStringInner(PixfontGeneric.lines[var15], arg1 + arg3 - this.stringWid(PixfontGeneric.lines[var15]), var13);
            } else if (var15 === var12 - 1) {
                this.drawStringInner(PixfontGeneric.lines[var15], arg1, var13);
            } else {
                this.calculateSpaceWidth(PixfontGeneric.lines[var15], arg3);
                this.drawStringInner(PixfontGeneric.lines[var15], arg1, var13);
                PixfontGeneric.extraSpaceWidth = 0;
            }
            var13 += arg9;
        }
        return var12;
    }

    drawStringMultiline(arg0: string | null, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number, arg7: number, arg8: number, arg9: number): number {
        return this.drawStringMultilineCore(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9);
    }

    centreStringWave(arg0: string | null, arg1: number, arg2: number, arg3: number, arg4: number): void {
        if (arg0 === null) {
            return;
        }
        this.resetState(arg3, 0);
        const var6 = new Int32Array(arg0.length);
        for (let var7 = 0; var7 < arg0.length; var7++) {
            var6[var7] = (Math.sin(var7 / 2.0 + arg4 / 5.0) * 5.0) | 0;
        }
        this.drawStringInnerCustomOffsetsAndColours(arg0, arg1 - ((this.stringWid(arg0) / 2) | 0), arg2, null, var6);
    }

    centreStringWave2(arg0: string | null, arg1: number, arg2: number, arg3: number, arg4: number): void {
        if (arg0 === null) {
            return;
        }
        this.resetState(arg3, 0);
        const var6 = new Int32Array(arg0.length);
        const var7 = new Int32Array(arg0.length);
        for (let var8 = 0; var8 < arg0.length; var8++) {
            var6[var8] = (Math.sin(var8 / 5.0 + arg4 / 5.0) * 5.0) | 0;
            var7[var8] = (Math.sin(var8 / 3.0 + arg4 / 5.0) * 5.0) | 0;
        }
        this.drawStringInnerCustomOffsetsAndColours(arg0, arg1 - ((this.stringWid(arg0) / 2) | 0), arg2, var6, var7);
    }

    centreStringWave3(arg0: string | null, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number): void {
        if (arg0 === null) {
            return;
        }
        this.resetState(arg3, 0);
        let var7 = 7.0 - arg5 / 8.0;
        if (var7 < 0.0) {
            var7 = 0.0;
        }
        const var9 = new Int32Array(arg0.length);
        for (let var10 = 0; var10 < arg0.length; var10++) {
            var9[var10] = (Math.sin(var10 / 1.5 + arg4) * var7) | 0;
        }
        this.drawStringInnerCustomOffsetsAndColours(arg0, arg1 - ((this.stringWid(arg0) / 2) | 0), arg2, null, var9);
    }

    resetStateAlpha(arg0: number, arg1: number, arg2: number): void {
        PixfontGeneric.strikeout = -1;
        PixfontGeneric.underline = -1;
        PixfontGeneric.defaultShadow = arg1;
        PixfontGeneric.currentShadow = arg1;
        PixfontGeneric.defaultCol = arg0;
        PixfontGeneric.currentCol = arg0;
        PixfontGeneric.defaultAlpha = arg2;
        PixfontGeneric.alpha = arg2;
        PixfontGeneric.extraSpaceWidth = 0;
        PixfontGeneric.extraSpacePos = 0;
    }

    setIcons(arg0: Pix8[], arg1: Int32Array | number[] | null): void {
        if (arg1 !== null && arg1.length !== arg0.length) {
            throw new Error();
        }
        this.modicons = arg0;
        this.modiconHeight = arg1;
    }

    resetState(arg0: number, arg1: number): void {
        PixfontGeneric.strikeout = -1;
        PixfontGeneric.underline = -1;
        PixfontGeneric.defaultShadow = arg1;
        PixfontGeneric.currentShadow = arg1;
        PixfontGeneric.defaultCol = arg0;
        PixfontGeneric.currentCol = arg0;
        PixfontGeneric.defaultAlpha = 256;
        PixfontGeneric.alpha = 256;
        PixfontGeneric.extraSpaceWidth = 0;
        PixfontGeneric.extraSpacePos = 0;
    }

    updateState(arg0: string) {
        try {
            if (arg0.startsWith(PixfontGeneric.tagCol)) {
                PixfontGeneric.currentCol = JagString.wrap(arg0.substring(4)).parseRadix(16);
                return;
            }
            if (arg0 === PixfontGeneric.tagEndCol) {
                PixfontGeneric.currentCol = PixfontGeneric.defaultCol;
                return;
            }
            if (arg0.startsWith(PixfontGeneric.tagTrans)) {
                PixfontGeneric.alpha = JagString.wrap(arg0.substring(6)).toInt();
                return;
            }
            if (arg0 === PixfontGeneric.tagEndTrans) {
                PixfontGeneric.alpha = PixfontGeneric.defaultAlpha;
                return;
            }
            if (arg0.startsWith(PixfontGeneric.tagStrEquals)) {
                PixfontGeneric.strikeout = JagString.wrap(arg0.substring(4)).parseRadix(16);
                return;
            }
            if (arg0 === PixfontGeneric.tagStr) {
                PixfontGeneric.strikeout = 8388608;
                return;
            }
            if (arg0 === PixfontGeneric.tagEndStr) {
                PixfontGeneric.strikeout = -1;
                return;
            }
            if (arg0.startsWith(PixfontGeneric.tagUEquals)) {
                PixfontGeneric.underline = JagString.wrap(arg0.substring(2)).parseRadix(16);
                return;
            }
            if (arg0 === PixfontGeneric.tagU) {
                PixfontGeneric.underline = 0;
                return;
            }
            if (arg0 === PixfontGeneric.tagEndU) {
                PixfontGeneric.underline = -1;
                return;
            }
            if (arg0.startsWith(PixfontGeneric.tagShadEquals)) {
                PixfontGeneric.currentShadow = JagString.wrap(arg0.substring(5)).parseRadix(16);
                return;
            }
            if (arg0 === PixfontGeneric.tagShad) {
                PixfontGeneric.currentShadow = 0;
                return;
            }
            if (arg0 === PixfontGeneric.tagEndShad) {
                PixfontGeneric.currentShadow = PixfontGeneric.defaultShadow;
                return;
            }
            if (arg0 === PixfontGeneric.tagBr) {
                this.resetStateAlpha(PixfontGeneric.defaultCol, PixfontGeneric.defaultShadow, PixfontGeneric.defaultAlpha);
                return;
            }
        } catch (var2) {}
    }

    calculateSpaceWidth(arg0: string, arg1: number): void {
        let var3 = 0;
        let var4 = false;
        for (let var5 = 0; var5 < arg0.length; var5++) {
            const var6 = arg0.charCodeAt(var5);
            if (var6 === 60) {
                var4 = true;
            } else if (var6 === 62) {
                var4 = false;
            } else if (!var4 && var6 === 32) {
                var3++;
            }
        }
        if (var3 > 0) {
            PixfontGeneric.extraSpaceWidth = (((arg1 - this.stringWid(arg0)) << 8) / var3) | 0;
        }
    }

    drawStringInner(str: string | null, x: number, y: number) {
        if (str === null) {
            return;
        }

        x |= 0;
        const baseY = (y | 0) - this.ascent;
        let tagStart = -1;
        let previous = -1;

        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i) & 0xff;
            if (code === 60) {
                tagStart = i;
                continue;
            }
            if (code === 62 && tagStart !== -1) {
                const tag = str.substring(tagStart + 1, i);
                tagStart = -1;
                if (tag === 'lt') code = 60;
                else if (tag === 'gt') code = 62;
                else if (tag === 'nbsp') code = 160;
                else if (tag === 'shy') code = 173;
                else if (tag === 'times') code = 215;
                else if (tag === 'euro') code = 128;
                else if (tag === 'copy') code = 169;
                else if (tag === 'reg') code = 174;
                else {
                    if (tag.startsWith('img=')) {
                        try {
                            const value = tag.substring(4);
                            if (!/^[+-]?\d+$/.test(value)) {
                                throw new Error();
                            }
                            const iconIndex = parseInt(value, 10);
                            const icon = this.modicons[iconIndex];
                            const iconHeight = this.modiconHeight === null ? icon.ohi : this.modiconHeight[iconIndex];
                            if (PixfontGeneric.alpha === 256) {
                                icon.plotSprite(x, baseY + this.ascent - iconHeight);
                            } else {
                                icon.transPlotSprite(x, baseY + this.ascent - iconHeight, PixfontGeneric.alpha);
                            }
                            x += icon.owi;
                            previous = -1;
                        } catch {}
                    } else {
                        this.updateState(tag);
                    }
                    continue;
                }
            }
            if (tagStart !== -1) {
                continue;
            }

            if (this.kerningPairs !== null && previous !== -1) {
                x += this.kerningPairs[(previous << 8) + code];
            }

            const w = this.glyphWidth[code] | 0;
            const h = this.glyphHeight[code] | 0;
            if (code === 32) {
                if (PixfontGeneric.extraSpaceWidth > 0) {
                    PixfontGeneric.extraSpacePos += PixfontGeneric.extraSpaceWidth;
                    x += PixfontGeneric.extraSpacePos >> 8;
                    PixfontGeneric.extraSpacePos &= 0xff;
                }
            } else {
                const gx = x + this.glyphOffsetX[code];
                const gy = baseY + this.glyphOffsetY[code];
                if (PixfontGeneric.alpha === 256) {
                    if (PixfontGeneric.currentShadow !== -1) {
                        this.plotLetter(code, gx + 1, gy + 1, w, h, PixfontGeneric.currentShadow);
                    }
                    this.plotLetterScanline(code, gx, gy, w, h, PixfontGeneric.currentCol);
                } else {
                    if (PixfontGeneric.currentShadow !== -1) {
                        this.plotLetterTrans(code, gx + 1, gy + 1, w, h, PixfontGeneric.currentShadow, PixfontGeneric.alpha);
                    }
                    this.plotLetterTransScanline(code, gx, gy, w, h, PixfontGeneric.currentCol, PixfontGeneric.alpha);
                }
            }

            const advance = this.charAdvance[code] | 0;
            if (PixfontGeneric.strikeout !== -1) {
                Pix2D.hline(x, baseY + ((this.ascent * 0.7) | 0), advance, PixfontGeneric.strikeout);
            }
            if (PixfontGeneric.underline !== -1) {
                Pix2D.hline(x, baseY + this.ascent + 1, advance, PixfontGeneric.underline);
            }
            x += advance;
            previous = code;
        }
    }

    drawStringInnerCustomOffsetsAndColours(str: string | null, x: number, y: number, xOffsets: ArrayLike<number> | null = null, yOffsets: ArrayLike<number> | null = null): void {
        if (str === null) {
            return;
        }

        x |= 0;
        const baseY = (y | 0) - this.ascent;
        let tagStart = -1;
        let previous = -1;
        let offsetIndex = 0;

        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i) & 0xff;
            if (code === 60) {
                tagStart = i;
                continue;
            }
            if (code === 62 && tagStart !== -1) {
                const tag = str.substring(tagStart + 1, i);
                tagStart = -1;
                let tagged = -1;
                if (tag === 'lt') tagged = 60;
                else if (tag === 'gt') tagged = 62;
                else if (tag === 'nbsp') tagged = 160;
                else if (tag === 'shy') tagged = 173;
                else if (tag === 'times') tagged = 215;
                else if (tag === 'euro') tagged = 128;
                else if (tag === 'copy') tagged = 169;
                else if (tag === 'reg') tagged = 174;
                if (tagged >= 0) {
                    code = tagged;
                } else {
                    if (tag.startsWith('img=')) {
                        const dx = xOffsets?.[offsetIndex] ?? 0;
                        const dy = yOffsets?.[offsetIndex] ?? 0;
                        offsetIndex++;
                        try {
                            const value = tag.substring(4);
                            if (!/^[+-]?\d+$/.test(value)) {
                                throw new Error();
                            }
                            const iconIndex = parseInt(value, 10);
                            const icon = this.modicons[iconIndex];
                            const iconHeight = this.modiconHeight === null ? icon.ohi : this.modiconHeight[iconIndex];
                            if (PixfontGeneric.alpha === 256) {
                                icon.plotSprite(x + dx, baseY + this.ascent - iconHeight + dy);
                            } else {
                                icon.transPlotSprite(x + dx, baseY + this.ascent - iconHeight + dy, PixfontGeneric.alpha);
                            }
                            x += icon.owi;
                            previous = -1;
                        } catch {}
                    } else {
                        this.updateState(tag);
                    }
                    continue;
                }
            }
            if (tagStart !== -1) continue;

            if (this.kerningPairs !== null && previous !== -1) {
                x += this.kerningPairs[(previous << 8) + code];
            }

            const dx = xOffsets?.[offsetIndex] ?? 0;
            const dy = yOffsets?.[offsetIndex] ?? 0;
            offsetIndex++;
            const w = this.glyphWidth[code] | 0;
            const h = this.glyphHeight[code] | 0;
            if (code === 32) {
                if (PixfontGeneric.extraSpaceWidth > 0) {
                    PixfontGeneric.extraSpacePos += PixfontGeneric.extraSpaceWidth;
                    x += PixfontGeneric.extraSpacePos >> 8;
                    PixfontGeneric.extraSpacePos &= 0xff;
                }
            } else {
                const gx = x + this.glyphOffsetX[code] + dx;
                const gy = baseY + this.glyphOffsetY[code] + dy;
                if (PixfontGeneric.alpha === 256) {
                    if (PixfontGeneric.currentShadow !== -1) this.plotLetter(code, gx + 1, gy + 1, w, h, PixfontGeneric.currentShadow);
                    this.plotLetterScanline(code, gx, gy, w, h, PixfontGeneric.currentCol);
                } else {
                    if (PixfontGeneric.currentShadow !== -1) this.plotLetterTrans(code, gx + 1, gy + 1, w, h, PixfontGeneric.currentShadow, PixfontGeneric.alpha);
                    this.plotLetterTransScanline(code, gx, gy, w, h, PixfontGeneric.currentCol, PixfontGeneric.alpha);
                }
            }
            const advance = this.charAdvance[code] | 0;
            if (PixfontGeneric.strikeout !== -1) Pix2D.hline(x, baseY + ((this.ascent * 0.7) | 0), advance, PixfontGeneric.strikeout);
            if (PixfontGeneric.underline !== -1) Pix2D.hline(x, baseY + this.ascent, advance, PixfontGeneric.underline);
            x += advance;
            previous = code;
        }
    }

    abstract plotLetter(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number): void;

    abstract plotLetterScanline(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number): void;

    abstract plotLetterTransScanline(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number): void;

    abstract plotLetterTrans(arg0: number, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number): void;
}
