import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
} from "@tanstack/react-router";
import { App } from "./App";
import { TrainerPreview } from "./TrainerPreview";

const rootRoute = createRootRoute({
	component: Outlet,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: App,
});

const trainerRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/trainer",
	component: TrainerPreview,
});

const routeTree = rootRoute.addChildren([indexRoute, trainerRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
