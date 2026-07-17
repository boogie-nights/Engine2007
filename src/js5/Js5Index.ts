import Packet from '#/io/Packet.ts';
import GZip from '#/io/GZip.ts';
import BZip2 from '#/io/BZip2.ts';

export default class Js5Index {
    static hashName(name: string) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = (name.toLowerCase().charCodeAt(i) + ((hash << 5) - hash)) | 0;
        }
        return hash;
    }

    isGroupValid(group: number) {
        return group >= 0 && group < this.capacity && this.groupSize[group] > 0;
    }

    getGroupId(name: string) {
        const group = this.groupNameHashTable.get(Js5Index.hashName(name));
        return typeof group !== 'undefined' && this.isGroupValid(group) ? group : -1;
    }

    static decompress(src: Uint8Array) {
        const buf = new Packet(src);

        const ctype = buf.g1();
        const clen = buf.g4();
        if (clen < 0) {
            throw new Error();
        }

        if (ctype === 0) {
            const temp = new Uint8Array(clen);
            buf.gdata(temp);
            return temp;
        } else {
            const ulen = buf.g4();
            if (ulen < 0) {
                throw new Error();
            }

            const temp = new Uint8Array(ulen);
            if (ctype === 1) {
                temp.set(BZip2.decompress(buf, ulen), 0);
            } else {
                temp.set(GZip.decompress(buf), 0);
            }
            return temp;
        }
    }

    version = 0;
    size = 0;
    groupIds = new Int32Array();
    groupNameHash = new Int32Array();
    groupNameHashTable = new Map<number, number>();
    capacity = 0;
    groupChecksum = new Int32Array();
    groupVersion = new Int32Array();
    groupSize = new Int32Array();
    fileIds: (Int32Array | null)[] = [];
    fileNameHash: Int32Array[] = [];
    fileNameHashTable: Map<number, number>[] = [];
    groupCapacity = new Int32Array();

    packed: (Uint8Array | null)[] = [];
    unpacked: (Uint8Array | null)[][] = [];
    crc = 0;
    discardPacked = false;
    discardUnpacked = false;

    constructor(discardPacked: boolean, discardUnpacked: boolean) {
        this.discardPacked = discardPacked;
        this.discardUnpacked = discardUnpacked;
    }

    decode(src: Uint8Array) {
        this.crc = Packet.getcrc(src);

        const buf = new Packet(Js5Index.decompress(src));

        const protocol = buf.g1();
        if (protocol < 5 || protocol > 7) {
            throw new Error();
        }

        if (protocol >= 6) {
            this.version = buf.g4();
        }

        const info = buf.g1();
        const hasNames = (info & 0x1) !== 0;

        if (protocol >= 7) {
            // todo
        } else {
            this.size = buf.g2();
        }

        let prevGroupId = 0;
        let maxGroupId = -1;
        this.groupIds = new Int32Array(this.size);

        for (let i = 0; i < this.size; i++) {
            if (protocol >= 7) {
                // todo
            } else {
                this.groupIds[i] = prevGroupId += buf.g2();
            }

            if (this.groupIds[i] > maxGroupId) {
                maxGroupId = this.groupIds[i];
            }
        }

        this.capacity = maxGroupId + 1;
        this.groupSize = new Int32Array(this.capacity);
        this.groupChecksum = new Int32Array(this.capacity);
        this.groupVersion = new Int32Array(this.capacity);
        this.fileIds = new Array(this.capacity).fill(null);
        this.groupCapacity = new Int32Array(this.capacity);
        this.packed = new Array(this.capacity).fill(null);
        this.unpacked = new Array(this.capacity).fill([]);

        if (hasNames) {
            this.groupNameHash = new Int32Array(this.capacity);
            this.groupNameHashTable = new Map();

            for (let i = 0; i < this.capacity; i++) {
                this.groupNameHash[i] = -1;
            }

            for (let i = 0; i < this.size; i++) {
                this.groupNameHash[this.groupIds[i]] = buf.g4();
                this.groupNameHashTable.set(this.groupNameHash[this.groupIds[i]], this.groupIds[i]);
            }
        }

        for (let i = 0; i < this.size; i++) {
            this.groupChecksum[this.groupIds[i]] = buf.g4();
        }

        for (let i = 0; i < this.size; i++) {
            this.groupVersion[this.groupIds[i]] = buf.g4();
        }

        for (let i = 0; i < this.size; i++) {
            if (protocol >= 7) {
                // todo
            } else {
                this.groupSize[this.groupIds[i]] = buf.g2();
            }
        }

        for (let i = 0; i < this.size; i++) {
            let prevFileId = 0;
            let maxFileId = -1;

            const groupId = this.groupIds[i];
            const groupSize = this.groupSize[groupId];
            this.fileIds[groupId] = new Int32Array(groupSize);

            for (let j = 0; j < groupSize; j++) {
                let fileId = 0;
                if (protocol >= 7) {
                    // todo
                } else {
                    fileId = prevFileId += buf.g2();
                }
                this.fileIds[groupId][j] = prevFileId;

                if (fileId > maxFileId) {
                    maxFileId = fileId;
                }
            }

            this.groupCapacity[groupId] = maxFileId + 1;
            if (maxFileId + 1 === groupSize) {
                this.fileIds[groupId] = null;
            }
        }

        if (hasNames) {
            this.fileNameHash = new Array(this.capacity);
            this.fileNameHashTable = new Array(this.capacity);

            for (let i = 0; i < this.size; i++) {
                const groupId = this.groupIds[i];
                const groupSize = this.groupSize[groupId];

                this.fileNameHash[groupId] = new Int32Array(this.groupCapacity[groupId]);
                this.fileNameHashTable[groupId] = new Map();

                for (let fileId = 0; fileId < this.groupCapacity[groupId]; fileId++) {
                    this.fileNameHash[groupId][fileId] = -1;
                }

                for (let j = 0; j < groupSize; j++) {
                    let fileId = -1;
                    if (this.fileIds[groupId]) {
                        fileId = this.fileIds[groupId][j];
                    } else {
                        fileId = j;
                    }

                    this.fileNameHash[groupId][fileId] = buf.g4();
                    this.fileNameHashTable[groupId].set(this.fileNameHash[groupId][fileId], fileId);
                }
            }
        }
    }

    unpackGroup(group: number, key: number[] = []): boolean {
        if (!this.packed[group]) {
            return false;
        }

        const files = this.groupSize[group];
        const fileIds = this.fileIds[group];

        if (this.unpacked[group] && this.unpacked[group].length > 0) {
            let fullyUnpackedFiles = true;
            for (let i = 0; i < files; i++) {
                const fid = fileIds ? fileIds[i] : i;
                if (typeof this.unpacked[group][fid] === 'undefined' || this.unpacked[group][fid] === null) {
                    fullyUnpackedFiles = false;
                    break;
                }
            }

            if (fullyUnpackedFiles) {
                return true;
            }
        }

        let compressed = this.packed[group];

        if (key.length > 0 && !(key[0] === 0 && key[1] === 0 && key[2] === 0 && key[3] === 0)) {
            const buf = new Packet(compressed);
            buf.tinydec(key, 5, compressed.length - 2); // exclude the 2-byte OpenRS2 version trailer
        }

        let uncompressed = new Uint8Array();
        try {
            uncompressed = Js5Index.decompress(compressed);

            if (this.discardPacked) {
                this.packed[group] = null;
            }

            const capacity = this.groupCapacity[group];
            if (!this.unpacked[group] || this.unpacked[group].length === 0) {
                this.unpacked[group] = new Array(capacity).fill(null);
            }

            if (files > 1) {
                const stripeCount = uncompressed[uncompressed.length - 1] & 0xff;

                const tableOffset = uncompressed.length - 1 - files * stripeCount * 4;

                const fileSizes = new Int32Array(files);
                const view = new DataView(uncompressed.buffer, uncompressed.byteOffset);

                let tablePos = tableOffset;
                for (let stripe = 0; stripe < stripeCount; stripe++) {
                    let delta = 0;
                    for (let i = 0; i < files; i++) {
                        delta += view.getInt32(tablePos, false);
                        fileSizes[i] += delta;
                        tablePos += 4;
                    }
                }

                const fileBuffers: Uint8Array[] = new Array(files);
                for (let i = 0; i < files; i++) {
                    fileBuffers[i] = new Uint8Array(fileSizes[i]);
                    fileSizes[i] = 0;
                }

                tablePos = tableOffset;
                let readPos = 0;
                for (let stripe = 0; stripe < stripeCount; stripe++) {
                    let delta = 0;
                    for (let i = 0; i < files; i++) {
                        delta += view.getInt32(tablePos, false);
                        tablePos += 4;
                        fileBuffers[i].set(
                            uncompressed.subarray(readPos, readPos + delta),
                            fileSizes[i]
                        );
                        readPos += delta;
                        fileSizes[i] += delta;
                    }
                }

                for (let i = 0; i < files; i++) {
                    const fid = fileIds ? fileIds[i] : i;
                    this.unpacked[group][fid] = fileBuffers[i];
                }
            } else {
                const fid = fileIds ? fileIds[0] : 0;
                this.unpacked[group][fid] = uncompressed;
            }

            if (this.discardUnpacked) {
            }

            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    static growInt32(arr: Int32Array<ArrayBuffer>, size: number): Int32Array<ArrayBuffer> {
        if (size <= arr.length) return arr;
        const next = new Int32Array(size);
        next.set(arr);
        return next;
    }

    private ensureCapacity(minCapacity: number) {
        if (minCapacity <= this.capacity) return;

        this.groupSize = Js5Index.growInt32(this.groupSize, minCapacity);
        this.groupChecksum = Js5Index.growInt32(this.groupChecksum, minCapacity);
        this.groupVersion = Js5Index.growInt32(this.groupVersion, minCapacity);
        this.groupCapacity = Js5Index.growInt32(this.groupCapacity, minCapacity);

        while (this.fileIds.length < minCapacity) this.fileIds.push(null);
        while (this.packed.length < minCapacity) this.packed.push(null);
        while (this.unpacked.length < minCapacity) this.unpacked.push([]);

        if (this.groupNameHash.length > 0) {
            const nextNameHash = new Int32Array(minCapacity).fill(-1);
            nextNameHash.set(this.groupNameHash);
            this.groupNameHash = nextNameHash;
        }
        while (this.fileNameHash.length < minCapacity) this.fileNameHash.push(new Int32Array());
        while (this.fileNameHashTable.length < minCapacity) this.fileNameHashTable.push(new Map());

        this.capacity = minCapacity;
    }

    registerLocalGroup(group: number, fileCount: number, packed: Uint8Array, opts?: { name?: string, fileIds?: number[], fileNames?: string[] }) {
        this.ensureCapacity(group + 1);

        this.groupSize[group] = fileCount;
        this.packed[group] = packed;
        this.unpacked[group] = [];

        if (opts?.fileIds) {
            this.fileIds[group] = Int32Array.from(opts.fileIds);
            this.groupCapacity[group] = Math.max(...opts.fileIds) + 1;
        } else {
            this.fileIds[group] = null;
            this.groupCapacity[group] = fileCount;
        }

        if (opts?.name) {
            if (this.groupNameHash.length === 0) {
                this.groupNameHash = new Int32Array(this.capacity).fill(-1);
                this.groupNameHashTable = new Map();
            }
            const hash = Js5Index.hashName(opts.name);
            this.groupNameHash[group] = hash;
            this.groupNameHashTable.set(hash, group);
        }

        if (opts?.fileNames) {
            this.fileNameHash[group] = new Int32Array(this.groupCapacity[group]).fill(-1);
            this.fileNameHashTable[group] = new Map();
            opts.fileNames.forEach((name, i) => {
                const fid = opts.fileIds ? opts.fileIds[i] : i;
                const hash = Js5Index.hashName(name);
                this.fileNameHash[group][fid] = hash;
                this.fileNameHashTable[group].set(hash, fid);
            });
        }
    }
}
