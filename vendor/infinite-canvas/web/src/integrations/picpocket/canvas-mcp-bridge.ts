import type { CanvasNodeData, CanvasConnection, ViewportTransform } from "@/types/canvas";

export const CANVAS_MCP_SNAPSHOT_KEY = "picpocket_canvas_mcp_snapshot_v1";
export const CANVAS_MCP_COMMAND_KEY = "picpocket_canvas_mcp_command_v1";
export const CANVAS_MCP_ACK_KEY = "picpocket_canvas_mcp_ack_v1";
export const CANVAS_MCP_PRESENCE_KEY = "picpocket_canvas_mcp_presence_v1";

export type CanvasMcpCommand = {
    commandId: string;
    type: "image" | "text";
    prompt?: string;
    imageUrl?: string;
    text?: string;
    title?: string;
    createdAt: number;
};

export function compactCanvasSnapshot(input: {
    projectId: string;
    title: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    viewport: ViewportTransform;
}) {
    return {
        projectId: input.projectId,
        title: input.title,
        updatedAt: Date.now(),
        viewport: input.viewport,
        connections: input.connections,
        nodes: input.nodes.map((node) => ({
            id: node.id,
            type: node.type,
            title: node.title,
            position: node.position,
            width: node.width,
            height: node.height,
            status: node.metadata?.status,
            prompt: node.metadata?.prompt,
            text: node.type === "text" ? node.metadata?.content : undefined,
        })),
    };
}
