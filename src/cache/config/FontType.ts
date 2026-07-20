import Js5Index from '#/js5/Js5Index.js';
import PixfontGeneric from '#/cache/graphics/PixFontGeneric.ts';

const FONT_NAMES = ['p11_full', 'p12_full', 'b12_full', 'q8_full'];

export class ServerFont extends PixfontGeneric {
    plotLetter(): void {}
    plotLetterScanline(): void {}
    plotLetterTransScanline(): void {}
    plotLetterTrans(): void {}

    split(text: string, maxWidth: number): string[] {
        const out: string[] = [];
        const count = this.splitString(text, [maxWidth], out);
        return out.slice(0, count);
    }
}

export default class FontType {
    static instances: ServerFont[] = [];

    static get(id: number): ServerFont {
        return FontType.instances[id];
    }

    static get count(): number {
        return FontType.instances.length;
    }

    static load(spriteIndex: Js5Index, metricsIndex: Js5Index): void {
        FontType.instances = new Array(FONT_NAMES.length);

        for (let i = 0; i < FONT_NAMES.length; i++) {
            const fontName = FONT_NAMES[i];

            const group = spriteIndex.getGroupId(fontName);
            if (group === -1) {
                console.error(`No sprite group named '${fontName}' — cannot resolve font.`);
                continue;
            }

            const fileNameHashTable = spriteIndex.fileNameHashTable?.[group];
            const file = fileNameHashTable?.get(0) ?? 0;

            if (!metricsIndex.packed[group] || Object.keys(metricsIndex.unpacked[group] ?? {}).length === 0) {
                if (!metricsIndex.unpackGroup(group)) {
                    console.error(`Failed to unpack fontmetrics group ${group} ('${fontName}').`);
                    continue;
                }
            }

            const metricsData = metricsIndex.unpacked[group]?.[file];
            if (!metricsData) {
                console.error(`No fontmetrics file ${file} in group ${group} ('${fontName}').`);
                continue;
            }

            FontType.instances[i] = new ServerFont(metricsData);
        }
    }
}
