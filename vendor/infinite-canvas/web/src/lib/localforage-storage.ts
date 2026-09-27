import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

localforage.config({
    name: "infinite-canvas",
    storeName: "app_state",
});

const inMemoryStorage = new Map<string, string>();

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            const value = await localforage.getItem<string>(name);
            if (value !== null) return value;
        } catch {}
        try {
            return window.localStorage.getItem(name) || inMemoryStorage.get(name) || null;
        } catch {
            return inMemoryStorage.get(name) || null;
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await localforage.setItem(name, value);
        } catch {
            try {
                window.localStorage.setItem(name, value);
            } catch {
                inMemoryStorage.set(name, value);
            }
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        try {
            await localforage.removeItem(name);
        } catch {
            try {
                window.localStorage.removeItem(name);
            } catch {
                inMemoryStorage.delete(name);
            }
        }
    },
};
