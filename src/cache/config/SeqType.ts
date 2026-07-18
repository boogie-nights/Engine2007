import { ConfigType } from '#/cache/config/ConfigType.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

export default class SeqType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: SeqType[] = [];
    static count: number = 0;

    static get(id: number): SeqType {
        return SeqType.configs[id];
    }

    static getId(name: string): number {
        return SeqType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): SeqType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }
        return this.get(id);
    }

    static load(index: Js5Index): void {
        const groupCount = index.capacity;

        let totalSlots = 0;
        for (let g = 0; g < groupCount; g++) {
            totalSlots += index.groupSize[g] ?? 0;
        }

        if (totalSlots === 0) {
            SeqType.count = 0;
            return;
        }

        SeqType.configs = new Array(totalSlots);
        SeqType.configNames.clear();

        let nextId = 0;
        let loadedCount = 0;

        for (let g = 0; g < groupCount; g++) {
            const groupSize = index.groupSize[g];
            if (groupSize === 0) continue;

            if (!index.packed[g] || Object.keys(index.unpacked[g] ?? {}).length === 0) {
                if (!index.unpackGroup(g)) {
                    continue;
                }
            }

            const fileIds = index.fileIds[g];

            for (let i = 0; i < groupSize; i++) {
                const fileId = fileIds ? fileIds[i] : i;
                const id = nextId++;

                const data = index.unpacked[g]?.[fileId];
                if (!data) continue;

                const type = new SeqType(id);
                type.decodeType(new Packet(data));
                type.postDecode();

                SeqType.configs[id] = type;
                loadedCount++;

                if (type.debugname) {
                    SeqType.configNames.set(type.debugname.toLowerCase(), id);
                }
            }
        }

        SeqType.count = loadedCount;
    }

    frameCount: number = 0;
    frames: Int32Array | null = null;
    delays: Uint16Array | null = null;
    iframes: Int32Array | null = null;

    frameSoundSynth: Int32Array | null = null;
    frameSoundLoops: Int32Array | null = null;
    frameSoundVolume: Int32Array | null = null;
    frameSoundAlts: Map<number, number[]> = new Map();

    loops: number = -1;
    walkmerge: number[] | null = null;
    reachforward: boolean = false;
    priority: number = 5;
    replaceheldleft: number = -1;
    replaceheldright: number = -1;
    maxloops: number = 99;
    preanim_move: number = 0;
    postanim_move: number = 0;
    duplicatebehaviour: number = 0;
    field1993: boolean = false;

    // precalculated for seqlength
    duration: number = 0;

    
    decode(code: number, dat: Packet): void {
        if (code === 1) {
            this.frameCount = dat.g2();
            this.delays = new Uint16Array(this.frameCount);
            this.frames = new Int32Array(this.frameCount);

            for (let i = 0; i < this.frameCount; i++) {
                this.delays[i] = dat.g2();
            }
            for (let i = 0; i < this.frameCount; i++) {
                this.frames[i] = dat.g2();
            }
            for (let i = 0; i < this.frameCount; i++) {
                this.frames[i] += dat.g2() << 16;
            }

        for (let i = 0; i < this.frameCount; i++) {
            if (this.delays[i] === 0) {
                this.delays[i] = 1;
            }
            this.duration += this.delays[i];
        }
        } else if (code === 2) {
            this.loops = dat.g2();
        } else if (code === 3) {
            const count = dat.g1();
            this.walkmerge = [];
            for (let i = 0; i < count; i++) {
                this.walkmerge.push(dat.g1());
            }
        } else if (code === 4) {
            this.reachforward = true;
        } else if (code === 5) {
            this.priority = dat.g1();
        } else if (code === 6) {
            this.replaceheldleft = dat.g2();
        } else if (code === 7) {
            this.replaceheldright = dat.g2();
        } else if (code === 8) {
            this.maxloops = dat.g1();
        } else if (code === 9) {
            this.preanim_move = dat.g1();
        } else if (code === 10) {
            this.postanim_move = dat.g1();
        } else if (code === 11) {
            this.duplicatebehaviour = dat.g1();
        } else if (code === 12) {
            const count = dat.g1();
            this.iframes = new Int32Array(count);
            for (let i = 0; i < count; i++) {
                this.iframes[i] = dat.g2();
            }
            for (let i = 0; i < count; i++) {
                this.iframes[i] += dat.g2() << 16;
            }
        } else if (code === 13) {
            const count = dat.g2();
            this.frameSoundSynth = new Int32Array(count).fill(-1);
            this.frameSoundLoops = new Int32Array(count).fill(-1);
            this.frameSoundVolume = new Int32Array(count).fill(-1);

            for (let i = 0; i < count; i++) {
                const len = dat.g1();
                if (len > 0) {
                    const packedVal = dat.g3();
                    this.frameSoundSynth[i] = packedVal >> 8;
                    this.frameSoundLoops[i] = (packedVal >> 4) & 0x7;
                    this.frameSoundVolume[i] = packedVal & 0xf;

                    if (len > 1) {
                        const alts: number[] = [];
                        for (let j = 1; j < len; j++) {
                            alts.push(dat.g2());
                        }
                        this.frameSoundAlts.set(i, alts);
                    }
                }
            }
        } else if (code === 14) {
            this.field1993 = true;
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized sequence config code: ${code}`);
        }
    }

    postDecode(): void {
        if (this.frameCount === 0) {
            this.frameCount = 1;
            this.frames = new Int32Array(1);
            this.frames[0] = -1;
            this.delays = new Uint16Array(1);
            this.delays[0] = 0;
        }

        if (this.preanim_move === -1) {
            this.preanim_move = this.walkmerge === null ? 0 : 2;
        }

        if (this.postanim_move === -1) {
            this.postanim_move = this.walkmerge === null ? 0 : 2;
        }
    }
}
