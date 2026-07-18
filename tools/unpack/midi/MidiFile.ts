// import ByteArrayNode from '#/datastruct/ByteArrayNode.js';
// import HashTable from '#/util/HashTable.ts';
import Linkable from '#/util/Linkable.js';
import Packet from '#/io/Packet.js';
// import MidiParser from '#/midi2/MidiParser.js';

export default class MidiFile extends Linkable {
    // patches: HashTable<ByteArrayNode> | null = null;
    readonly midi: Uint8Array;

    constructor(arg0: Packet) {
        super();
        arg0.pos = arg0.data.length - 3;
        const var2 = arg0.g1();
        const var3 = arg0.g2();
        let var4 = var2 * 10 + 14;
        arg0.pos = 0;
        let var5 = 0;
        let var6 = 0;
        let var7 = 0;
        let var8 = 0;
        let var9 = 0;
        let var10 = 0;
        let var11 = 0;
        let var12 = 0;
        for (let var13 = 0; var13 < var2; var13++) {
            let var14 = -1;
            let lastRawOpcodeCount = -1;
            while (true) {
                const var15 = arg0.g1();

                if (var15 === 7 || var15 === 23) {
                    var4++;
                } else {
                    if (var15 !== lastRawOpcodeCount) {
                        var4++;
                    }
                    lastRawOpcodeCount = var15;
                }

                var14 = var15 & 0xf;
                if (var15 === 7) {
                    break;
                }
                if (var15 === 23) {
                    var5++;
                } else if (var14 === 0) {
                    var7++;
                } else if (var14 === 1) {
                    var8++;
                } else if (var14 === 2) {
                    var6++;
                } else if (var14 === 3) {
                    var9++;
                } else if (var14 === 4) {
                    var10++;
                } else if (var14 === 5) {
                    var11++;
                } else if (var14 === 6) {
                    var12++;
                } else {
                    throw new Error();
                }
            }
        }
        const var16 = var4 + var5 * 5;
        const var17 = var16 + (var7 + var8 + var6 + var9 + var11) * 2;
        const var18 = var17 + var10 + var12;
        const var19 = arg0.pos;
        const var20 = var2 + var5 + var6 + var7 + var8 + var9 + var10 + var11 + var12;
        for (let var21 = 0; var21 < var20; var21++) {
            arg0.gMidiVarLen();
        }
        const var22 = var18 + arg0.pos - var19;
        let var23 = arg0.pos;
        let var24 = 0;
        let var25 = 0;
        let var26 = 0;
        let var27 = 0;
        let var28 = 0;
        let var29 = 0;
        let var30 = 0;
        let var31 = 0;
        let var32 = 0;
        let var33 = 0;
        let var34 = 0;
        let var35 = 0;
        let var36 = 0;
        for (let var37 = 0; var37 < var6; var37++) {
            var36 = (var36 + arg0.g1()) & 0x7f;
            if (var36 === 0 || var36 === 32) {
                var12++;
            } else if (var36 === 1) {
                var24++;
            } else if (var36 === 33) {
                var25++;
            } else if (var36 === 7) {
                var26++;
            } else if (var36 === 39) {
                var27++;
            } else if (var36 === 10) {
                var28++;
            } else if (var36 === 42) {
                var29++;
            } else if (var36 === 99) {
                var30++;
            } else if (var36 === 98) {
                var31++;
            } else if (var36 === 101) {
                var32++;
            } else if (var36 === 100) {
                var33++;
            } else if (var36 === 64 || var36 === 65 || var36 === 120 || var36 === 121 || var36 === 123) {
                var34++;
            } else {
                var35++;
            }
        }
        let var38 = 0;
        let var39 = arg0.pos;
        arg0.pos += var34;
        let var40 = arg0.pos;
        arg0.pos += var11;
        let var41 = arg0.pos;
        arg0.pos += var10;
        let var42 = arg0.pos;
        arg0.pos += var9;
        let var43 = arg0.pos;
        arg0.pos += var24;
        let var44 = arg0.pos;
        arg0.pos += var26;
        let var45 = arg0.pos;
        arg0.pos += var28;
        let var46 = arg0.pos;
        arg0.pos += var7 + var8 + var11;
        let var47 = arg0.pos;
        arg0.pos += var7;
        let var48 = arg0.pos;
        arg0.pos += var35;
        let var49 = arg0.pos;
        arg0.pos += var8;
        let var50 = arg0.pos;
        arg0.pos += var25;
        let var51 = arg0.pos;
        arg0.pos += var27;
        let var52 = arg0.pos;
        arg0.pos += var29;
        let var53 = arg0.pos;
        arg0.pos += var12;
        let var54 = arg0.pos;
        arg0.pos += var9;
        let var55 = arg0.pos;
        arg0.pos += var30;
        let var56 = arg0.pos;
        arg0.pos += var31;
        let var57 = arg0.pos;
        arg0.pos += var32;
        let var58 = arg0.pos;
        arg0.pos += var33;
        let var59 = arg0.pos;
        arg0.pos += var5 * 3;
        this.midi = new Uint8Array(var22);
        const var60 = new Packet(this.midi);
        var60.p4(1297377380);
        var60.p4(6);
        var60.p2(var2 > 1 ? 1 : 0);
        var60.p2(var2);
        var60.p2(var3);
        arg0.pos = var19;
        let var61 = 0;
        let var62 = 0;
        let var63 = 0;
        let var64 = 0;
        let var65 = 0;
        let var66 = 0;
        let var67 = 0;
        const var68 = new Int32Array(128);
        let var69 = 0;
        label220: for (let var70 = 0; var70 < var2; var70++) {
            var60.p4(1297379947);
            var60.pos += 4;
            const var71 = var60.pos;
            let var72 = -1;
            let lastRawOpcode = -1;
            while (true) {
                while (true) {
                    const var73 = arg0.gMidiVarLen();
                    var60.pMidiVarLen(var73);
                    const var74 = arg0.data[var38++] & 0xff;
                    if (var74 === 7) {
                        var60.p1(255);
                        var60.p1(47);
                        var60.p1(0);
                        var60.psize4(var60.pos - var71);
                        continue label220;
                    }
                    if (var74 === 23) {
                        var60.p1(255);
                        var60.p1(81);
                        var60.p1(3);
                        var60.p1(arg0.data[var59++]);
                        var60.p1(arg0.data[var59++]);
                        var60.p1(arg0.data[var59++]);
                    } else {
                        const var75 = var74 !== lastRawOpcode;
                        lastRawOpcode = var74;
                        var72 = var74 & 0xf;
                        var61 ^= var74 >> 4;
                        if (var72 === 0) {
                            if (var75) {
                                var60.p1(var61 + 144);
                            }
                            var62 += (arg0.data[var46++] << 24) >> 24;
                            var63 += (arg0.data[var47++] << 24) >> 24;
                            var60.p1(var62 & 0x7f);
                            var60.p1(var63 & 0x7f);
                        } else if (var72 === 1) {
                            if (var75) {
                                var60.p1(var61 + 128);
                            }
                            var62 += (arg0.data[var46++] << 24) >> 24;
                            var64 += (arg0.data[var49++] << 24) >> 24;
                            var60.p1(var62 & 0x7f);
                            var60.p1(var64 & 0x7f);
                        } else if (var72 === 2) {
                            if (var75) {
                                var60.p1(var61 + 176);
                            }
                            var69 = (var69 + ((arg0.data[var23++] << 24) >> 24)) & 0x7f;
                            var60.p1(var69);
                            let var76;
                            if (var69 === 0 || var69 === 32) {
                                var76 = (arg0.data[var53++] << 24) >> 24;
                            } else if (var69 === 1) {
                                var76 = (arg0.data[var43++] << 24) >> 24;
                            } else if (var69 === 33) {
                                var76 = (arg0.data[var50++] << 24) >> 24;
                            } else if (var69 === 7) {
                                var76 = (arg0.data[var44++] << 24) >> 24;
                            } else if (var69 === 39) {
                                var76 = (arg0.data[var51++] << 24) >> 24;
                            } else if (var69 === 10) {
                                var76 = (arg0.data[var45++] << 24) >> 24;
                            } else if (var69 === 42) {
                                var76 = (arg0.data[var52++] << 24) >> 24;
                            } else if (var69 === 99) {
                                var76 = (arg0.data[var55++] << 24) >> 24;
                            } else if (var69 === 98) {
                                var76 = (arg0.data[var56++] << 24) >> 24;
                            } else if (var69 === 101) {
                                var76 = (arg0.data[var57++] << 24) >> 24;
                            } else if (var69 === 100) {
                                var76 = (arg0.data[var58++] << 24) >> 24;
                            } else if (var69 === 64 || var69 === 65 || var69 === 120 || var69 === 121 || var69 === 123) {
                                var76 = (arg0.data[var39++] << 24) >> 24;
                            } else {
                                var76 = (arg0.data[var48++] << 24) >> 24;
                            }
                            const var77 = var76 + var68[var69];
                            var68[var69] = var77;
                            var60.p1(var77 & 0x7f);
                        } else if (var72 === 3) {
                            if (var75) {
                                var60.p1(var61 + 224);
                            }
                            const var78 = var65 + ((arg0.data[var54++] << 24) >> 24);
                            var65 = var78 + (((arg0.data[var42++] << 24) >> 24) << 7);
                            var60.p1(var65 & 0x7f);
                            var60.p1((var65 >> 7) & 0x7f);
                        } else if (var72 === 4) {
                            if (var75) {
                                var60.p1(var61 + 208);
                            }
                            var66 += (arg0.data[var41++] << 24) >> 24;
                            var60.p1(var66 & 0x7f);
                        } else if (var72 === 5) {
                            if (var75) {
                                var60.p1(var61 + 160);
                            }
                            var62 += (arg0.data[var46++] << 24) >> 24;
                            var67 += (arg0.data[var40++] << 24) >> 24;
                            var60.p1(var62 & 0x7f);
                            var60.p1(var67 & 0x7f);
                        } else if (var72 === 6) {
                            if (var75) {
                                var60.p1(var61 + 192);
                            }
                            var60.p1(arg0.data[var53++]);
                        } else {
                            throw new Error();
                        }
                    }
                }
            }
        }
    }

    // method660(): void {
    //     if (this.patches != null) {
    //         return;
    //     }
    //     this.patches = new HashTable(16);
    //     const var1 = new Int32Array(16);
    //     const var2 = new Int32Array(16);
    //     var1[9] = var2[9] = 128;
    //     const var3 = new MidiParser(this.midi);
    //     const var4 = var3.getTrackCount();
    //     for (let var5 = 0; var5 < var4; var5++) {
    //         var3.setTrack(var5);
    //         var3.processDeltaTime(var5);
    //         var3.unsetTrack(var5);
    //     }
    //     label53: do {
    //         while (true) {
    //             const var6 = var3.nextTrackToPlay();
    //             const var7 = var3.trackCurrentTick![var6];
    //             while (var3.trackCurrentTick![var6] === var7) {
    //                 var3.setTrack(var6);
    //                 const var8 = var3.getEvent(var6);
    //                 if (var8 === 1) {
    //                     var3.finishTrack();
    //                     var3.unsetTrack(var6);
    //                     continue label53;
    //                 }
    //                 const var9 = var8 & 0xf0;
    //                 if (var9 === 176) {
    //                     const var10 = var8 & 0xf;
    //                     const var11 = (var8 >> 8) & 0x7f;
    //                     const var12 = (var8 >> 16) & 0x7f;
    //                     if (var11 === 0) {
    //                         var1[var10] = (var1[var10] & 0xffe03fff) + (var12 << 14);
    //                     }
    //                     if (var11 === 32) {
    //                         var1[var10] = (var1[var10] & 0xffffc07f) + (var12 << 7);
    //                     }
    //                 }
    //                 if (var9 === 192) {
    //                     const var13 = var8 & 0xf;
    //                     const var14 = (var8 >> 8) & 0x7f;
    //                     var2[var13] = var1[var13] + var14;
    //                 }
    //                 if (var9 === 144) {
    //                     const var15 = var8 & 0xf;
    //                     const var16 = (var8 >> 8) & 0x7f;
    //                     const var17 = (var8 >> 16) & 0x7f;
    //                     if (var17 > 0) {
    //                         const var18 = var2[var15];
    //                         let var19 = this.patches.find(BigInt(var18));
    //                         if (var19 == null) {
    //                             var19 = new ByteArrayNode(new Uint8Array(128));
    //                             this.patches.put(BigInt(var18), var19);
    //                         }
    //                         var19.data[var16] = 1;
    //                     }
    //                 }
    //                 var3.processDeltaTime(var6);
    //                 var3.unsetTrack(var6);
    //             }
    //         }
    //     } while (!var3.allTracksFinished());
    // }

    // method661(): void {
    //     this.patches = null;
    // }
}
