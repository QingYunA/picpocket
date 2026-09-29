import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";

import { openOptionsPage } from "@picpocket/utils/navigation";
import { isInsufficientCreditsMessage } from "@picpocket/utils/errorMessage";
import { useHostedCredits } from "@picpocket/hooks/useHostedCredits";
import { imageCreditCost, scaleCreditCost, visionCreditCost, type CreditCost } from "@picpocket/services/creditPricing";
import { hostedCanvasSelection } from "@/integrations/picpocket/hosted-credits";
import type { AiConfig } from "@/stores/use-config-store";

const openAccountPage = () => {
    void openOptionsPage({ route: "/account" });
};

/** 当前节点选中的模型走 PicPocket 官方托管时的积分余额与单次预计消耗；自带 Key 的渠道返回 null，界面不展示 */
export function useCanvasCredits(mode: string, config: Pick<AiConfig, "model" | "channels" | "count">): { balance: number; cost: CreditCost | null } | null {
    const selection = hostedCanvasSelection(mode, config.model, config.channels);
    const { balance, pricing } = useHostedCredits(selection !== null);
    if (!selection || balance === null) return null;
    const perImage = selection.kind === "image" ? imageCreditCost(pricing, selection.model) : null;
    const cost = selection.kind === "image" ? (perImage && scaleCreditCost(perImage, Number(config.count))) : visionCreditCost(pricing, selection.model);
    return { balance, cost };
}

/** 生成按钮旁的积分余额，点击跳转设置页的账号与套餐；余额低于最低消耗时标红 */
export function CanvasCreditBalance({ balance, insufficient }: { balance: number; insufficient: boolean }) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            onClick={openAccountPage}
            title={t("canvas.credits.manage")}
            className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold tabular-nums transition-colors ${
                insufficient
                    ? "border-red-300/70 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400"
                    : "border-amber-300/70 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
            }`}
        >
            <Coins className="size-3.5" />
            {t("canvas.credits.balance", { balance })}
        </button>
    );
}

/** 积分不足的报错旁边的「去升级」入口；其他报错不渲染 */
export function CanvasUpgradeButton({ message }: { message: unknown }) {
    const { t } = useTranslation();
    if (!isInsufficientCreditsMessage(message)) return null;
    return (
        <button
            type="button"
            onClick={openAccountPage}
            className="mt-1 inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-md border border-current px-2 py-0.5 text-[11px] font-medium hover:bg-white/10"
        >
            {t("canvas.credits.upgrade")}
        </button>
    );
}
