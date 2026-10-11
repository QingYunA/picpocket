/**
 * 画布节点落位的纯几何计算（世界坐标，未经视口变换）。
 * 从侧边栏接力、MCP 指令、资产面板插入节点时用：避开已有节点、批量排版不重叠、
 * 并把「节点 + 下方提示词面板」整体平移进可视区，避免生成按钮落在窗口外。
 */

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Box = Point & Size;
export type Viewport = { x: number; y: number; k: number };

/** 节点下方提示词面板的大小（世界坐标）：宽度对应 canvas-node.tsx 里的 w-[600px]，高度是含参考图行与底栏的实测值 */
export const NODE_PANEL_SIZE: Size = { width: 600, height: 340 };

function boxesOverlap(a: Box, b: Box, gap: number): boolean {
    return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/**
 * 以 center 为中心放置 size 大小的节点；与已有节点重叠时，沿环形网格向外找最近的空位。
 * 返回节点中心点；maxRings 范围内都没有空位时退回原中心。
 */
export function findFreeNodeCenter(center: Point, size: Size, existing: readonly Box[], gap = 32, maxRings = 6): Point {
    const stepX = size.width + gap;
    const stepY = size.height + gap;
    const isFree = (point: Point) => {
        const box = { x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height };
        return !existing.some((other) => boxesOverlap(box, other, gap / 2));
    };
    if (isFree(center)) return center;
    for (let ring = 1; ring <= maxRings; ring++) {
        const offsets: Array<[number, number]> = [];
        for (let dx = -ring; dx <= ring; dx++) {
            for (let dy = -ring; dy <= ring; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) offsets.push([dx, dy]);
            }
        }
        // 先近后远；同距离时优先右侧、下方，与阅读方向一致
        offsets.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])) || b[0] - a[0] || b[1] - a[1]);
        for (const [dx, dy] of offsets) {
            const candidate = { x: center.x + dx * stepX, y: center.y + dy * stepY };
            if (isFree(candidate)) return candidate;
        }
    }
    return center;
}

/**
 * 按行流式排版一组节点：每行最多 columns 个，行内按各自宽度从左到右、顶部对齐，行高取该行最高节点，节点之间留 gap。
 * 每一行只取决于自己和之前的行，所以逐个追加节点时已排好的位置不会变。
 * centers 是各节点中心相对排版左上角的位置，width/height 是整体外框。
 */
export function layoutNodeRows(sizes: readonly Size[], columns: number, gap: number): { centers: Point[]; width: number; height: number } {
    const cols = Math.max(1, Math.floor(columns));
    const centers: Point[] = [];
    let top = 0;
    let width = 0;
    for (let start = 0; start < sizes.length; start += cols) {
        const row = sizes.slice(start, start + cols);
        const rowHeight = Math.max(...row.map((size) => size.height));
        let left = 0;
        for (const size of row) {
            centers.push({ x: left + size.width / 2, y: top + size.height / 2 });
            left += size.width + gap;
        }
        width = Math.max(width, left - gap);
        top += rowHeight + gap;
    }
    return { centers, width, height: sizes.length ? top - gap : 0 };
}

export type RevealInput = {
    viewport: Viewport;
    /** 画布容器的可视尺寸（屏幕像素） */
    container: Size;
    /** 节点外框（世界坐标） */
    node: Box;
    /** 节点下方提示词面板的高度与宽度（世界坐标，随缩放一起变化） */
    panel: Size;
    /** 面板与节点之间的间距（世界坐标） */
    panelGap?: number;
    /** 被顶栏、底部工具条遮挡的屏幕像素 */
    insets?: { top: number; bottom: number; left: number; right: number };
};

const DEFAULT_INSETS = { top: 64, bottom: 96, left: 16, right: 16 };

/** 为让生成按钮可见而缩小视图时，最多缩到的比例；再小节点就看不清了，改为只保证节点顶部可见 */
const MIN_REVEAL_SCALE = 0.5;

/**
 * 计算让「节点 + 提示词面板」完整落入可视区所需的视口；已经完整可见则返回 null。
 * 优先只平移；整体比可视区还高时，把视图缩小（不低于 MIN_REVEAL_SCALE）并居中，
 * 这样底部的模型选择与「生成」按钮不会落到窗口外。
 */
export function computeRevealViewport(input: RevealInput): Viewport | null {
    const { viewport, container, node, panel, panelGap = 16, insets = DEFAULT_INSETS } = input;
    const centerX = node.x + node.width / 2;
    const worldLeft = Math.min(node.x, centerX - panel.width / 2);
    const worldRight = Math.max(node.x + node.width, centerX + panel.width / 2);
    const worldBottom = node.y + node.height + panelGap + panel.height;

    const minTop = insets.top;
    const maxBottom = container.height - insets.bottom;
    const minLeft = insets.left;
    const maxRight = container.width - insets.right;
    const availableHeight = maxBottom - minTop;
    const stackHeight = worldBottom - node.y;

    let k = viewport.k;
    if (stackHeight * k > availableHeight) k = Math.min(k, Math.max(MIN_REVEAL_SCALE, availableHeight / stackHeight));
    if (k !== viewport.k) {
        const x = (minLeft + maxRight) / 2 - ((worldLeft + worldRight) / 2) * k;
        const y = minTop + Math.max(0, (availableHeight - stackHeight * k) / 2) - node.y * k;
        return { x, y, k };
    }

    const left = viewport.x + worldLeft * k;
    const right = viewport.x + worldRight * k;
    const top = viewport.y + node.y * k;
    const bottom = viewport.y + worldBottom * k;

    let dy = 0;
    if (bottom - top > availableHeight) dy = minTop - top;
    else if (bottom > maxBottom) dy = maxBottom - bottom;
    else if (top < minTop) dy = minTop - top;

    let dx = 0;
    if (right - left > maxRight - minLeft) dx = (minLeft + maxRight) / 2 - (left + right) / 2;
    else if (right > maxRight) dx = maxRight - right;
    else if (left < minLeft) dx = minLeft - left;

    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
    return { x: viewport.x + dx, y: viewport.y + dy, k };
}
