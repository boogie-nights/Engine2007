import Linkable from '#/util/Linkable.js';

export default class HashTable<T extends Linkable> {
    readonly bucketCount: number;
    readonly buckets: Linkable[];
    searchCursor: Linkable | null = null;
    iteratorCursor: Linkable | null = null;
    iteratorBucket = 0;
    field2985 = 0n;

    constructor(bucketCount: number) {
        this.bucketCount = bucketCount;
        this.buckets = new Array(bucketCount);
        for (let i = 0; i < bucketCount; i++) {
            const sentinel = (this.buckets[i] = new Linkable());
            sentinel.prev = sentinel;
            sentinel.next = sentinel;
        }
    }

    find(key: bigint): T | null {
        this.field2985 = key;
        const sentinel = this.buckets[Number(key & BigInt(this.bucketCount - 1))];
        for (this.searchCursor = sentinel.next; this.searchCursor !== sentinel; this.searchCursor = this.searchCursor!.next) {
            if (key === this.searchCursor!.key) {
                const var4 = this.searchCursor;
                this.searchCursor = this.searchCursor!.next;
                return var4 as T;
            }
        }
        this.searchCursor = null;
        return null;
    }

    put(key: bigint, node: T): void {
        if (node.prev !== null) {
            node.unlink();
        }
        const sentinel = this.buckets[Number(key & BigInt(this.bucketCount - 1))];
        node.key = key;
        node.prev = sentinel.prev;
        node.next = sentinel;
        node.prev!.next = node;
        node.next.prev = node;
    }

    search(): T | null {
        this.iteratorBucket = 0;
        return this.findnext();
    }

    findnext(): T | null {
        if (this.iteratorBucket > 0 && this.iteratorCursor !== this.buckets[this.iteratorBucket - 1]) {
            const node = this.iteratorCursor!;
            this.iteratorCursor = node.next;
            return node as T;
        }
        while (this.bucketCount > this.iteratorBucket) {
            const node = this.buckets[this.iteratorBucket++].next!;
            if (this.buckets[this.iteratorBucket - 1] !== node) {
                this.iteratorCursor = node.next;
                return node as T;
            }
        }
        return null;
    }

    method1054(): T | null {
        if (this.searchCursor === null) {
            return null;
        }
        const var2 = this.buckets[Number(this.field2985 & BigInt(this.bucketCount - 1))];
        while (this.searchCursor !== var2) {
            if (this.field2985 === this.searchCursor!.key) {
                const var3 = this.searchCursor;
                this.searchCursor = this.searchCursor!.next;
                return var3 as T;
            }
            this.searchCursor = this.searchCursor!.next;
        }
        this.searchCursor = null;
        return null;
    }
}
