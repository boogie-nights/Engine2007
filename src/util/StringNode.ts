import Linkable from '#/util/Linkable.js';
import type JagString from '#/util/JagString.js';

export default class StringNode extends Linkable {
    value: JagString | string | null;

    constructor(value: JagString | string | null = null) {
        super();
        this.value = value;
    }
}
