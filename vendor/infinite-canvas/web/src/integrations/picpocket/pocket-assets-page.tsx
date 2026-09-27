import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PocketAssetPicker } from "./pocket-asset-picker";
import { queuePocketAssetHandoff } from "./canvas-handoff";

export function PocketAssetsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <main className="h-full overflow-auto bg-background px-6 py-8 text-stone-950 dark:text-stone-100">
            <div className="mx-auto max-w-7xl">
                <header className="mb-6">
                    <h1 className="text-2xl font-semibold">{t("navigation.assets")}</h1>
                </header>
                <PocketAssetPicker
                    onInsert={(_payload, assetId) => {
                        void queuePocketAssetHandoff(assetId).then(() => navigate("/canvas?mode=recent"));
                    }}
                />
            </div>
        </main>
    );
}
