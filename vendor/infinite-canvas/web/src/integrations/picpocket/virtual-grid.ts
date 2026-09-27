import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** 与 CSS `repeat(auto-fill, minmax(minCell, 1fr))` + gap 的列数计算保持一致 */
export function computeGridColumns(containerWidth: number, minCellWidth: number, gap: number): number {
    if (containerWidth <= 0) return 1;
    return Math.max(1, Math.floor((containerWidth + gap) / (minCellWidth + gap)));
}

export type VirtualWindowInput = {
    itemCount: number;
    columns: number;
    /** 单行占用高度（卡片高度 + 行间距） */
    rowHeight: number;
    scrollTop: number;
    viewportHeight: number;
    overscanRows: number;
    /** 最后一行之后不存在的行间距，从总高度中扣除 */
    trailingGap?: number;
};

export type VirtualWindow = {
    startIndex: number;
    endIndex: number;
    offsetTop: number;
    totalHeight: number;
};

/** 按行计算需要渲染的条目区间（左闭右开）及其顶部偏移与总高度 */
export function computeVirtualWindow(input: VirtualWindowInput): VirtualWindow {
    const { itemCount, columns, rowHeight, scrollTop, viewportHeight, overscanRows, trailingGap = 0 } = input;
    if (itemCount <= 0 || columns <= 0 || rowHeight <= 0) {
        return { startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight: 0 };
    }
    const rowCount = Math.ceil(itemCount / columns);
    const firstVisibleRow = Math.floor(Math.max(0, scrollTop) / rowHeight);
    const lastVisibleRow = Math.floor((Math.max(0, scrollTop) + Math.max(0, viewportHeight - 1)) / rowHeight);
    const startRow = Math.min(rowCount - 1, Math.max(0, firstVisibleRow - overscanRows));
    const endRow = Math.min(rowCount - 1, lastVisibleRow + overscanRows);
    return {
        startIndex: startRow * columns,
        endIndex: Math.min(itemCount, (endRow + 1) * columns),
        offsetTop: startRow * rowHeight,
        totalHeight: Math.max(0, rowCount * rowHeight - trailingGap),
    };
}

type ScrollViewport = { width: number; height: number; scrollTop: number };

/** 跟踪滚动容器的内容宽度（扣除水平 padding）、可视高度与滚动位置，按帧合并更新 */
function useScrollViewport(scrollRef: RefObject<HTMLDivElement | null>): ScrollViewport {
    const [viewport, setViewport] = useState<ScrollViewport>({ width: 0, height: 0, scrollTop: 0 });

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let frame = 0;
        const sync = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const style = getComputedStyle(el);
                const paddingX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
                const next = { width: el.clientWidth - paddingX, height: el.clientHeight, scrollTop: el.scrollTop };
                setViewport((prev) => (prev.width === next.width && prev.height === next.height && prev.scrollTop === next.scrollTop ? prev : next));
            });
        };
        sync();
        const observer = new ResizeObserver(sync);
        observer.observe(el);
        el.addEventListener("scroll", sync, { passive: true });
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            el.removeEventListener("scroll", sync);
        };
    }, [scrollRef]);

    return viewport;
}

/**
 * 以 ResizeObserver 持续测量样本卡片的真实高度（字体加载、列宽变化后都会刷新）。
 * 尚未测得有效高度（0 或未挂载）时返回 null，由调用方回退到估算值。
 */
function useMeasuredHeight(): [number | null, (node: HTMLElement | null) => void] {
    const [height, setHeight] = useState<number | null>(null);
    const observerRef = useRef<ResizeObserver | null>(null);

    const measureRef = useCallback((node: HTMLElement | null) => {
        observerRef.current?.disconnect();
        observerRef.current = null;
        if (!node) return;
        const update = () => {
            const next = node.offsetHeight;
            if (next > 0) setHeight((prev) => (prev !== null && Math.abs(prev - next) < 0.5 ? prev : next));
        };
        update();
        observerRef.current = new ResizeObserver(update);
        observerRef.current.observe(node);
    }, []);

    useEffect(() => () => observerRef.current?.disconnect(), []);

    return [height, measureRef];
}

export type VirtualGridOptions = {
    minCellWidth: number;
    gap: number;
    overscanRows: number;
    /** 卡片中除正方形图片外的固定高度（标题栏 + 边框），仅用于首帧估算 */
    extraCardHeight: number;
};

/**
 * 资产网格行级虚拟化：仅渲染可视区（含缓冲行）内的卡片，
 * 避免资产数量大时一次性挂载成百上千个 Dropdown / img 节点。
 */
export function useVirtualGrid(scrollRef: RefObject<HTMLDivElement | null>, itemCount: number, options: VirtualGridOptions) {
    const { minCellWidth, gap, overscanRows, extraCardHeight } = options;
    const viewport = useScrollViewport(scrollRef);
    const [measuredHeight, measureCardRef] = useMeasuredHeight();

    const columns = computeGridColumns(viewport.width, minCellWidth, gap);
    const cellWidth = viewport.width > 0 ? (viewport.width - gap * (columns - 1)) / columns : minCellWidth;
    const cardHeight = measuredHeight ?? cellWidth + extraCardHeight;

    const range = computeVirtualWindow({
        itemCount,
        columns,
        rowHeight: cardHeight + gap,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
        overscanRows,
        trailingGap: gap,
    });

    return { columns, range, measureCardRef };
}
