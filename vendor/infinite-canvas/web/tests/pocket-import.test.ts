import { describe, expect, test } from "bun:test";

import { db } from "@picpocket/db";
import { importLocalImageToPocket } from "@/integrations/picpocket/pocket-adapter";

describe("importLocalImageToPocket", () => {
    test("stores a dropped file as a pending, untagged item without a fake AI prompt", async () => {
        const file = new File([new Uint8Array([137, 80, 78, 71])], "海边日落.final.png", { type: "image/png" });
        const id = await importLocalImageToPocket(file, 7);
        const item = await db.items.get(id);
        expect(item?.pageTitle).toBe("海边日落.final");
        expect(item?.status).toBe("pending");
        expect(item?.tags).toEqual([]);
        expect(item?.folderId).toBe(7);
        expect(item?.sourceUrl).toBeUndefined();
        expect(item?.originalBlob.type).toBe("image/png");
        expect(await db.prompts.where("itemId").equals(id).count()).toBe(0);
    });

    test("files dropped on the inbox view are stored without a folder", async () => {
        const id = await importLocalImageToPocket(new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }), null);
        expect((await db.items.get(id))?.folderId).toBeNull();
    });
});
