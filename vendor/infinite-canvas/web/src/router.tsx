import { createBrowserRouter, createHashRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import ImagePage from "@/pages/image";
import NotFound from "@/pages/not-found";
import PromptsPage from "@/pages/prompts";
import VideoPage from "@/pages/video";
import { PocketAssetsPage } from "@/integrations/picpocket/pocket-assets-page";

const isPicPocketExtension = import.meta.env.VITE_PICPOCKET_EXTENSION === "1";

const routes = [
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/image", element: <ImagePage /> },
            ...(!isPicPocketExtension ? [{ path: "/video", element: <VideoPage /> }] : []),
            { path: "/assets", element: isPicPocketExtension ? <PocketAssetsPage /> : <AssetsPage /> },
            { path: "/prompts", element: <PromptsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            ...(!isPicPocketExtension ? [{ path: "/config", element: <ConfigPage /> }] : []),
        ],
    },
    { path: "*", element: <NotFound /> },
];

export const router = isPicPocketExtension ? createHashRouter(routes) : createBrowserRouter(routes);
