import HashTable from '#/util/HashTable.ts';
import StringNode from '#/util/StringNode.ts';
import ArrayUtil from '#/util/ArrayUtil.ts';

// todo: remove and replace
export default class JagString {
    static readonly collationTable = Int32Array.from([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
        63, 64, 65, 73, 74, 76, 78, 83, 84, 85, 86, 91, 92, 93, 94, 95, 97, 103, 104, 105, 106, 107, 108, 113, 114, 115, 116, 118, 119, 120, 121, 122, 123, 124, 125, 133, 134, 136, 138, 143, 144, 145, 146, 151, 152, 153, 154, 155, 157, 163, 164, 165,
        166, 168, 169, 174, 175, 176, 177, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220,
        221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 66, 67, 68, 69, 70, 71, 72, 75, 79, 80, 81, 82, 87, 88, 89, 90, 77, 96, 98, 99, 100, 101, 102,
        250, 251, 109, 110, 111, 112, 117, 252, 167, 126, 127, 128, 129, 130, 131, 132, 135, 139, 140, 141, 142, 147, 148, 149, 150, 137, 156, 158, 159, 160, 161, 162, 253, 254, 170, 171, 172, 173, 178, 255, 179
    ]);
    static readonly base37Alphabet = Int8Array.from([95, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57]);
    static internTable: HashTable<StringNode> | null = null;
    static readonly STRING_NULL: JagString = JagString.wrap('null');
    static readonly STRING_EMPTY: JagString = JagString.wrap('');
    static readonly STRING_DOT: JagString = JagString.wrap('.');

    mutable: boolean = true;
    byteLength: number = 0;
    length: any = Object.assign(() => this.byteLength, {
        valueOf: () => this.byteLength,
        [Symbol.toPrimitive]: () => this.byteLength,
        toString: () => String(this.byteLength)
    });
    cachedHash: number = 0;
    chars: Int8Array = new Int8Array(0);

    static wrap(arg1: string): JagString {
        const var2 = new Int8Array(arg1.length);
        for (let var6 = 0; var6 < arg1.length; var6++) {
            var2[var6] = arg1.charCodeAt(var6) & 0xff;
        }
        const var4 = var2.length;
        const var5 = new JagString();
        var5.chars = new Int8Array(var4);
        for (let var3 = 0; var3 < var4; var3++) {
            if (var2[var3] !== 0) {
                var5.chars[var5.byteLength++] = var2[var3];
            }
        }
        var5.compact();
        return var5.intern(-35)!;
    }

    static join(arg0: JagString[]): JagString {
        if (arg0.length < 2) {
            throw new Error();
        }
        return JagString.joinRange(arg0.length, arg0, 0);
    }

    // todo: StringTools.join
    static joinRange(arg0: number, arg1: JagString[], arg2: number): JagString {
        let var3 = 0;
        for (let var4 = 0; var4 < arg0; var4++) {
            if (arg1[var4 + arg2] == null) {
                arg1[arg2 + var4] = JagString.STRING_NULL;
            }
            var3 += arg1[var4 + arg2].byteLength;
        }
        let var5 = 0;
        const var6 = new Int8Array(var3);
        for (let var7 = 0; var7 < arg0; var7++) {
            const var8 = arg1[var7 + arg2];
            ArrayUtil.copy(var8.chars, 0, var6, var5, var8.byteLength);
            var5 += var8.byteLength;
        }
        const var9 = new JagString();
        var9.chars = var6;
        var9.byteLength = var3;
        return var9;
    }

    static newStringBuilder(arg0: number): JagString {
        const var1 = new JagString();
        var1.byteLength = 0;
        var1.chars = new Int8Array(arg0);
        return var1;
    }

    static fromBytes(arg0: number, arg1: Uint8Array | Int8Array, arg2: number): JagString {
        const var3 = new JagString();
        var3.byteLength = 0;
        var3.chars = new Int8Array(arg2);
        for (let var4 = arg0; var4 < arg0 + arg2; var4++) {
            if (arg1[var4] !== 0) {
                var3.chars[var3.byteLength++] = arg1[var4];
            }
        }
        return var3;
    }

    static parseInt(arg0: number): JagString {
        return JagString.formatIntWithSign(false, arg0);
    }

    static toRawUsername(arg0: bigint | number): JagString | null {
        let value = BigInt(arg0);
        if (value <= 0n || value >= 6582952005840035281n) {
            return null;
        } else if (value % 37n === 0n) {
            return null;
        }
        let var2 = 0;
        let var3 = value;
        while (var3 !== 0n) {
            var3 /= 37n;
            var2++;
        }
        const var5 = new Int8Array(var2);
        while (value !== 0n) {
            const var6 = value;
            value /= 37n;
            var2--;
            var5[var2] = JagString.base37Alphabet[Number(var6 - value * 37n)];
        }
        const var8 = new JagString();
        var8.chars = var5;
        var8.byteLength = var5.length;
        return var8;
    }

    static formatIntWithSign(arg0: boolean, arg1: number): JagString {
        let var2 = 1;
        let var3 = (arg1 / 10) | 0;
        while (var3 !== 0) {
            var3 = (var3 / 10) | 0;
            var2++;
        }
        let var4 = var2;
        if (arg1 < 0 || arg0) {
            var4 = var2 + 1;
        }
        const var5 = new Int8Array(var4);
        if (arg1 < 0) {
            var5[0] = 45;
        } else if (arg0) {
            var5[0] = 43;
        }
        for (let var6 = 0; var6 < var2; var6++) {
            let var7 = arg1 % 10;
            arg1 = (arg1 / 10) | 0;
            if (var7 < 0) {
                var7 = -var7;
            }
            if (var7 > 9) {
                var7 += 39;
            }
            var5[var4 - var6 - 1] = var7 + 48;
        }
        const var8 = new JagString();
        var8.byteLength = var4;
        var8.chars = var5;
        return var8;
    }

    static fromLatin1String(arg0: string): JagString {
        const var1 = new Int8Array(arg0.length);
        for (let var4 = 0; var4 < arg0.length; var4++) {
            var1[var4] = arg0.charCodeAt(var4) & 0xff;
        }
        const var2 = new JagString();
        var2.byteLength = 0;
        var2.chars = var1;
        for (let var3 = 0; var3 < var1.length; var3++) {
            if (var1[var3] !== 0) {
                var1[var2.byteLength++] = var1[var3];
            }
        }
        return var2;
    }

    static formatIPv4(arg0: number): JagString {
        return JagString.join([
            JagString.parseInt((arg0 >> 24) & 0xff),
            JagString.STRING_DOT,
            JagString.parseInt((arg0 >> 16) & 0xff),
            JagString.STRING_DOT,
            JagString.parseInt((arg0 >> 8) & 0xff),
            JagString.STRING_DOT,
            JagString.parseInt(arg0 & 0xff)
        ]);
    }

    static longToString(arg0: bigint | number): JagString {
        let value = BigInt(arg0);
        let var2 = 1;
        for (let var3 = value / 10n; var3 !== 0n; var3 /= 10n) {
            var2++;
        }
        let var5 = var2;
        if (value < 0n) {
            var5 = var2 + 1;
        }
        const var6 = new Int8Array(var5);
        if (value < 0n) {
            var6[0] = 45;
        }
        for (let var7 = 0; var7 < var2; var7++) {
            let var8 = Number(value % 10n);
            value /= 10n;
            if (var8 < 0) {
                var8 = -var8;
            }
            if (var8 > 9) {
                var8 += 39;
            }
            var6[var5 - var7 - 1] = var8 + 48;
        }
        const var9 = new JagString();
        var9.chars = var6;
        var9.byteLength = var5;
        return var9;
    }

    static formatIntSigned(arg0: number): JagString {
        return JagString.formatIntWithSign(true, arg0);
    }

    static valueOf(arg0: bigint | number): JagString {
        return JagString.longToString(arg0);
    }

    static toLowerCaseChar(arg0: number): number {
        if ((arg0 >= 65 && arg0 <= 90) || (arg0 >= 192 && arg0 <= 222 && arg0 !== 215)) {
            return arg0 + 32;
        } else if (arg0 === 159) {
            return 255;
        } else if (arg0 === 140) {
            return 156;
        }
        return arg0;
    }

    static toUpperCaseChar(arg0: number): number {
        if ((arg0 >= 97 && arg0 <= 122) || (arg0 >= 224 && arg0 <= 254 && arg0 !== 247)) {
            return arg0 - 32;
        } else if (arg0 === 255) {
            return 159;
        } else if (arg0 === 156) {
            return 140;
        }
        return arg0;
    }

    static isPrintableChar(arg0: number): boolean {
        if (arg0 < 32) return false;
        if (arg0 === 127) return false;
        return arg0 < 129 || arg0 > 159;
    }

    static isAlphanumericChar(arg0: number): boolean {
        if (arg0 >= 97 && arg0 <= 122) return true;
        if (arg0 >= 65 && arg0 <= 90) return true;
        return arg0 >= 48 && arg0 <= 57;
    }

    static isLetterChar(arg0: number): boolean {
        return (arg0 >= 97 && arg0 <= 122) || (arg0 >= 65 && arg0 <= 90);
    }

    static isDigitChar(arg0: number): boolean {
        return arg0 >= 48 && arg0 <= 57;
    }

    indexOfChar(arg0: number, arg1: number): number {
        const var3 = (arg0 << 24) >> 24;
        for (let var4 = arg1; var4 < this.byteLength; var4++) {
            if (this.chars[var4] === var3) {
                return var4;
            }
        }
        return -1;
    }

    startsWithIgnoreCase(arg0: JagString): boolean {
        if (arg0.length > this.byteLength) {
            return false;
        }
        for (let var2 = 0; var2 < arg0.length; var2++) {
            let var3 = this.chars[var2];
            if ((var3 >= 65 && var3 <= 90) || (var3 >= -64 && var3 <= -34 && var3 !== -41)) {
                var3 = ((var3 + 32) << 24) >> 24;
            }
            let var4 = arg0.chars[var2];
            if ((var4 >= 65 && var4 <= 90) || (var4 >= -64 && var4 <= -34 && var4 !== -41)) {
                var4 = ((var4 + 32) << 24) >> 24;
            }
            if (var3 !== var4) {
                return false;
            }
        }
        return true;
    }

    toMaskedString(): JagString {
        const var1 = new JagString();
        var1.byteLength = this.byteLength;
        var1.chars = new Int8Array(this.byteLength);
        var1.chars.fill(42);
        return var1;
    }

    strEquals(arg1: JagString | null): boolean {
        if (arg1 == null) return false;
        if (arg1.length !== this.byteLength) return false;
        if (!this.mutable || !arg1.mutable) {
            if (this.cachedHash === 0) {
                this.cachedHash = this.computeCp1252HashFromUtf8();
                if (this.cachedHash === 0) this.cachedHash = 1;
            }
            if (arg1.cachedHash === 0) {
                arg1.cachedHash = arg1.computeCp1252HashFromUtf8();
                if (arg1.cachedHash === 0) arg1.cachedHash = 1;
            }
            if (this.cachedHash !== arg1.cachedHash) return false;
        }
        for (let var3 = 0; var3 < this.byteLength; var3++) {
            if (arg1.chars[var3] !== this.chars[var3]) return false;
        }
        return true;
    }

    charAt(arg0: number): number {
        return this.chars[arg0] & 0xff;
    }

    splitOn(arg0: number): JagString[] {
        let var2 = 0;
        for (let var3 = 0; var3 < this.byteLength; var3++) {
            if (arg0 === this.chars[var3]) var2++;
        }
        const var4 = new Array(var2 + 1);
        if (var2 === 0) {
            var4[0] = this;
            return var4;
        }
        let var5 = 0;
        let var6 = 0;
        for (let var7 = 0; var7 < var2; var7++) {
            let var8 = 0;
            for (; this.chars[var6 + var8] !== arg0; var8++) {}
            var4[var5++] = this.substring(var6, var6 + var8);
            var6 += var8 + 1;
        }
        var4[var2] = this.substring(var6, this.byteLength);
        return var4;
    }

    intern(arg0: number): JagString | null {
        const var2 = this.hash64(84);
        if (JagString.internTable == null) {
            JagString.internTable = new HashTable(4096);
        } else {
            for (let var5 = JagString.internTable.find(var2); var5 != null; var5 = JagString.internTable.method1054()) {
                const var6 = var5.value as JagString | null;
                if (this.strEquals(var6)) {
                    return var6;
                }
            }
        }
        if (arg0 !== -35) {
            return null;
        }
        const var8 = new StringNode();
        var8.value = this;
        this.mutable = false;
        JagString.internTable.put(var2, var8);
        return this;
    }

    trim(): JagString {
        let var1 = 0;
        for (; var1 < this.byteLength && ((this.chars[var1] >= 0 && this.chars[var1] <= 32) || (this.chars[var1] & 0xff) === 160); var1++) {}
        let var2 = this.byteLength;
        for (; var1 < var2 && ((this.chars[var2 - 1] >= 0 && this.chars[var2 - 1] <= 32) || (this.chars[var2 - 1] & 0xff) === 160); var2--) {}
        if (var1 === 0 && this.byteLength === var2) return this;
        const var3 = new JagString();
        var3.byteLength = var2 - var1;
        var3.chars = new Int8Array(var3.length);
        for (let var4 = 0; var4 < var3.length; var4++) {
            var3.chars[var4] = this.chars[var1 + var4];
        }
        return var3;
    }

    toString(): string {
        let out = '';
        for (let i = 0; i < this.byteLength; i++) {
            out += String.fromCharCode(this.chars[i] & 0xff);
        }
        return out;
    }

    toInt(): number {
        return this.parseRadix(10);
    }

    computeCp1252HashFromUtf8(): number {
        let var1 = 0;
        for (let var2 = 0; var2 < this.byteLength; var2++) {
            var1 = ((this.chars[var2] & 0xff) + ((var1 << 5) - var1)) | 0;
        }
        return var1;
    }

    toURL(): URL {
        return new URL(this.toString());
    }

    parseRadix(arg0: number): number {
        let var2 = false;
        let var3 = false;
        let var4 = 0;
        for (let var5 = 0; var5 < this.byteLength; var5++) {
            let var6 = this.chars[var5] & 0xff;
            if (var5 === 0) {
                if (var6 === 45) {
                    var2 = true;
                    continue;
                }
                if (var6 === 43) {
                    continue;
                }
            }
            if (var6 >= 48 && var6 <= 57) var6 -= 48;
            else if (var6 >= 65 && var6 <= 90) var6 -= 55;
            else if (var6 >= 97 && var6 <= 122) var6 -= 87;
            else throw new Error();
            if (arg0 <= var6) throw new Error();
            if (var2) var6 = -var6;
            const var7 = (var4 * arg0 + var6) | 0;
            if (((var7 / arg0) | 0) !== var4) throw new Error();
            var4 = var7;
            var3 = true;
        }
        if (!var3) throw new Error();
        return var4;
    }

    getParameter(arg0: { getParameter?(name: string): unknown } | null): JagString | null {
        const var3 = arg0?.getParameter?.(this.toString()) ?? null;
        return var3 == null ? null : JagString.fromLatin1String(String(var3));
    }

    stringWidth(arg0: { stringWidth?(value: string): number; measureText?(value: string): { width: number } } | null): number {
        const s = this.toString();
        if (arg0?.stringWidth) return arg0.stringWidth(s);
        if (arg0?.measureText) return arg0.measureText(s).width | 0;
        return s.length;
    }

    println(): void {
        console.log(this.toString());
    }

    toCleanUsername(): JagString {
        const var1 = JagString.toRawUsername(this.toUserhash());
        return var1 == null ? JagString.STRING_EMPTY : var1;
    }

    copyToArray(arg0: number, arg1: number, arg2: Uint8Array | Int8Array): number {
        arg2.set(this.chars.subarray(0, arg0), arg1);
        return arg0;
    }

    copy(): Int8Array {
        return new Int8Array(this.chars.subarray(0, this.byteLength));
    }

    toScreenName(): JagString {
        let var1 = true;
        const var2 = new JagString();
        var2.byteLength = this.byteLength;
        var2.chars = new Int8Array(this.byteLength);
        for (let var3 = 0; var3 < this.byteLength; var3++) {
            const var4 = this.chars[var3];
            if (var4 === 95) {
                var1 = true;
                var2.chars[var3] = 32;
            } else if (var4 >= 97 && var4 <= 122 && var1) {
                var2.chars[var3] = ((var4 - 32) << 24) >> 24;
                var1 = false;
            } else {
                var1 = false;
                var2.chars[var3] = var4;
            }
        }
        return var2;
    }

    isValidInt(): boolean {
        let var1 = false;
        let var2 = 0;
        let var3 = false;
        for (let var4 = 0; var4 < this.byteLength; var4++) {
            let var5 = this.chars[var4] & 0xff;
            if (var4 === 0) {
                if (var5 === 45) {
                    var1 = true;
                    continue;
                }
                if (var5 === 43) continue;
            }
            if (var5 >= 48 && var5 <= 57) var5 -= 48;
            else if (var5 >= 65 && var5 <= 90) var5 -= 55;
            else if (var5 >= 97 && var5 <= 122) var5 -= 87;
            else return false;
            if (var5 >= 10) return false;
            if (var1) var5 = -var5;
            const var6 = (var5 + var2 * 10) | 0;
            if (var2 !== ((var6 / 10) | 0)) return false;
            var3 = true;
            var2 = var6;
        }
        return var3;
    }

    append(arg0: JagString): JagString;
    append(arg0: number): JagString;
    append(arg0: JagString | number): JagString {
        if (typeof arg0 === 'number') {
            if (arg0 <= 0 || arg0 > 255) throw new Error(`invalid char:${arg0}`);
            if (!this.mutable) throw new Error();
            this.cachedHash = 0;
            if (this.byteLength === this.chars.length) {
                let var2 = 1;
                for (; var2 <= this.byteLength; var2 += var2) {}
                const var3 = new Int8Array(var2);
                var3.set(this.chars.subarray(0, this.byteLength));
                this.chars = var3;
            }
            this.chars[this.byteLength++] = (arg0 << 24) >> 24;
            return this;
        }
        if (!this.mutable) throw new Error();
        this.cachedHash = 0;
        if (this.chars.length < this.byteLength + arg0.length) {
            let var2 = 1;
            for (; var2 < arg0.length + this.byteLength; var2 += var2) {}
            const var3 = new Int8Array(var2);
            var3.set(this.chars.subarray(0, this.byteLength));
            this.chars = var3;
        }
        this.chars.set(arg0.chars.subarray(0, arg0.length), this.byteLength);
        this.byteLength += arg0.length;
        return this;
    }

    indexOf(arg0: JagString): number {
        return this.indexOfFrom(0, arg0);
    }

    appendChar(arg0: number): JagString {
        if (arg0 <= 0 || arg0 > 255) throw new Error('invalid char');
        const var2 = new JagString();
        var2.chars = new Int8Array(this.byteLength + 1);
        var2.byteLength = this.byteLength + 1;
        var2.chars.set(this.chars.subarray(0, this.byteLength));
        var2.chars[this.byteLength] = (arg0 << 24) >> 24;
        return var2;
    }

    startsWith(arg0: JagString): boolean {
        if (this.byteLength < arg0.length) return false;
        for (let var2 = 0; var2 < arg0.length; var2++) {
            if (arg0.chars[var2] !== this.chars[var2]) return false;
        }
        return true;
    }

    equals(arg0: unknown): boolean {
        if (!(arg0 instanceof JagString)) throw new Error();
        return this.strEquals(arg0);
    }

    drawString(arg0: number, arg1: number, arg2: { drawString?(value: string, x: number, y: number): void; fillText?(value: string, x: number, y: number): void } | null): void {
        const var4 = this.toString();
        if (arg2?.drawString) arg2.drawString(var4, arg0, arg1);
        else if (arg2?.fillText) arg2.fillText(var4, arg0, arg1);
    }

    isDecimal(): boolean {
        return this.isValidInt();
    }

    toSentenceCase(): JagString {
        let var1 = 2;
        const var2 = new JagString();
        var2.byteLength = this.byteLength;
        var2.chars = new Int8Array(this.byteLength);
        for (let var3 = 0; var3 < this.byteLength; var3++) {
            let var4 = this.chars[var3];
            if ((var4 >= 97 && var4 <= 122) || (var4 >= -32 && var4 <= -2 && var4 !== -9)) {
                if (var1 === 2) var4 = ((var4 - 32) << 24) >> 24;
                var1 = 0;
            } else if ((var4 >= 65 && var4 <= 90) || !(var4 < -64 || var4 > -34 || var4 === -41)) {
                if (var1 === 0) var4 = ((var4 + 32) << 24) >> 24;
                var1 = 0;
            } else if (var4 === 46 || var4 === 33 || var4 === 63) {
                var1 = 2;
            } else if (var4 !== 32) {
                var1 = 1;
            } else if (var1 !== 2) {
                var1 = 1;
            }
            var2.chars[var3] = var4;
        }
        return var2;
    }

    hashCode(): number {
        return this.computeCp1252HashFromUtf8();
    }

    substring(arg0: number): JagString;
    substring(arg0: number, arg1: number): JagString;
    substring(arg0: number, arg1?: number): JagString {
        if (arg1 === undefined) arg1 = this.byteLength;
        const var3 = new JagString();
        var3.chars = new Int8Array(arg1 - arg0);
        var3.byteLength = arg1 - arg0;
        var3.chars.set(this.chars.subarray(arg0, arg1));
        return var3;
    }

    equalsIgnoreCase(arg0: JagString | null): boolean {
        if (arg0 == null || arg0.length !== this.byteLength) return false;
        for (let var2 = 0; var2 < this.byteLength; var2++) {
            let var3 = this.chars[var2];
            if ((var3 >= 65 && var3 <= 90) || (var3 >= -64 && var3 <= -34 && var3 !== -41)) var3 = ((var3 + 32) << 24) >> 24;
            let var4 = arg0.chars[var2];
            if ((var4 >= 65 && var4 <= 90) || (var4 >= -64 && var4 <= -34 && var4 !== -41)) var4 = ((var4 + 32) << 24) >> 24;
            if (var3 !== var4) return false;
        }
        return true;
    }

    compare(arg0: JagString): number {
        const var2 = this.byteLength <= arg0.length ? this.byteLength : arg0.length;
        for (let var3 = 0; var3 < var2; var3++) {
            if ((arg0.chars[var3] & 0xff) > (this.chars[var3] & 0xff)) return -1;
            if ((arg0.chars[var3] & 0xff) < (this.chars[var3] & 0xff)) return 1;
        }
        if (this.byteLength < arg0.length) return -1;
        if (arg0.length < this.byteLength) return 1;
        return 0;
    }

    slashToSpace(): JagString {
        const var1 = new JagString();
        var1.byteLength = this.byteLength;
        var1.chars = new Int8Array(this.byteLength);
        for (let var2 = 0; var2 < this.byteLength; var2++) {
            const var3 = this.chars[var2];
            var1.chars[var2] = var3 === 47 ? 32 : var3;
        }
        return var1;
    }

    compareSorted(arg0: JagString): number {
        const var2 = arg0.length >= this.byteLength ? this.byteLength : arg0.length;
        for (let var3 = 0; var3 < var2; var3++) {
            if (JagString.collationTable[this.chars[var3] & 0xff] < JagString.collationTable[arg0.chars[var3] & 0xff]) return -1;
            if (JagString.collationTable[this.chars[var3] & 0xff] > JagString.collationTable[arg0.chars[var3] & 0xff]) return 1;
        }
        if (this.byteLength < arg0.length) return -1;
        if (arg0.length < this.byteLength) return 1;
        return 0;
    }

    browserCall(arg0: Record<string, unknown> | null): unknown {
        const var2 = this.toString();
        const fn = arg0?.[var2] ?? (globalThis as unknown as Record<string, unknown>)[var2];
        const var3 = typeof fn === 'function' ? fn.call(arg0 ?? globalThis) : undefined;
        if (typeof var3 === 'string') {
            const var4 = new Int8Array(var3.length);
            for (let var5 = 0; var5 < var3.length; var5++) {
                var4[var5] = var3.charCodeAt(var5) & 0xff;
            }
            return JagString.fromBytes(0, var4, var3.length);
        }
        return var3;
    }

    compact(): JagString {
        if (!this.mutable) throw new Error();
        this.cachedHash = 0;
        if (this.chars.length !== this.byteLength) {
            this.chars = new Int8Array(this.chars.subarray(0, this.byteLength));
        }
        return this;
    }

    toUserhash(): bigint {
        let var1 = 0n;
        for (let var3 = 0; this.byteLength > var3 && var3 < 12; var3++) {
            const var4 = this.chars[var3];
            var1 *= 37n;
            if (var4 >= 65 && var4 <= 90) var1 += BigInt(var4 - 64);
            else if (var4 >= 97 && var4 <= 122) var1 += BigInt(var4 + 1 - 97);
            else if (var4 >= 48 && var4 <= 57) var1 += BigInt(var4 + 27 - 48);
        }
        while (var1 % 37n === 0n && var1 !== 0n) {
            var1 /= 37n;
        }
        return var1;
    }

    endsWith(arg0: JagString): boolean {
        if (arg0.length > this.byteLength) return false;
        const var2 = this.byteLength - arg0.length;
        for (let var3 = 0; var3 < arg0.length; var3++) {
            if (arg0.chars[var3] !== this.chars[var3 + var2]) return false;
        }
        return true;
    }

    resolveURL(arg0: string | URL): URL {
        return new URL(this.toString(), arg0);
    }

    indexOfFrom(arg0: number, arg1: JagString): number {
        const var3 = new Int32Array(arg1.length);
        const var4 = new Int32Array(256);
        const var5 = new Int32Array(arg1.length);
        for (let var6 = 0; var6 < var4.length; var6++) var4[var6] = arg1.length;
        for (let var7 = 1; var7 <= arg1.length; var7++) {
            var3[var7 - 1] = (arg1.length << 1) - var7;
            var4[arg1.chars[var7 - 1] & 0xff] = arg1.length - var7;
        }
        let var8 = arg1.length + 1;
        let var9 = arg1.length;
        while (var9 > 0) {
            var5[var9 - 1] = var8;
            while (var8 <= arg1.length && arg1.chars[var8 - 1] !== arg1.chars[var9 - 1]) {
                if (arg1.length - var9 <= var3[var8 - 1]) var3[var8 - 1] = arg1.length - var9;
                var8 = var5[var8 - 1];
            }
            var9--;
            var8--;
        }
        let var10 = var8;
        let var11 = 1;
        let var12 = arg1.length + 1 - var8;
        let var13 = 0;
        let var14 = 1;
        while (var12 >= var14) {
            var5[var14 - 1] = var13;
            while (var13 >= 1 && arg1.chars[var13 - 1] !== arg1.chars[var14 - 1]) var13 = var5[var13 - 1];
            var14++;
            var13++;
        }
        while (var10 < arg1.length) {
            for (let var15 = var11; var15 <= var10; var15++) {
                if (var3[var15 - 1] >= var10 + arg1.length - var15) var3[var15 - 1] = var10 + arg1.length - var15;
            }
            var11 = var10 + 1;
            var10 = var12 + var10 - var5[var12 - 1];
            var12 = var5[var12 - 1];
        }
        let var17;
        for (let var16 = arg1.length + arg0 - 1; var16 < this.byteLength; var16 += Math.max(var4[this.chars[var16] & 0xff], var3[var17])) {
            for (var17 = arg1.length - 1; var17 >= 0 && this.chars[var16] === arg1.chars[var17]; var17--) {
                var16--;
            }
            if (var17 === -1) return var16 + 1;
        }
        return -1;
    }

    eval(arg0: { eval?(value: string): unknown } | null): void {
        const var2 = this.toString();
        if (arg0?.eval) arg0.eval(var2);
        else globalThis.eval?.(var2);
    }

    hash64(arg0: number): bigint {
        let var2 = 0n;
        if (arg0 === 84) {
            for (let var4 = 0; var4 < this.byteLength; var4++) {
                var2 = BigInt(this.chars[var4] & 0xff) + (var2 << 5n) - var2;
            }
            return var2;
        }
        return -103n;
    }

    toLowerCase(): JagString {
        const var1 = new JagString();
        var1.byteLength = this.byteLength;
        var1.chars = new Int8Array(this.byteLength);
        for (let var2 = 0; var2 < this.byteLength; var2++) {
            let var3 = this.chars[var2];
            if ((var3 >= 65 && var3 <= 90) || (var3 >= -64 && var3 <= -34 && var3 !== -41)) var3 = ((var3 + 32) << 24) >> 24;
            var1.chars[var2] = var3;
        }
        return var1;
    }
}
