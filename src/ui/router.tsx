import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
} from "@tanstack/react-router";
import { App } from "./App";
import { CalibrationSession } from "./CalibrationSession";
import { GameConversions } from "./GameConversions";
import { History } from "./History";
import { SessionResult } from "./SessionResult";
import { Settings } from "./Settings";
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

const gamesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/games",
	validateSearch: (search: Record<string, unknown>) => ({
		cm:
			typeof search.cm === "number"
				? search.cm
				: Number(search.cm) || undefined,
		dpi:
			typeof search.dpi === "number"
				? search.dpi
				: Number(search.dpi) || undefined,
	}),
	component: GameConversions,
});

const sessionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/session/$sessionId",
	component: CalibrationSession,
});

const resultRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/results/$sessionId",
	component: SessionResult,
});

const historyRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/history",
	component: History,
});

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	component: Settings,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	trainerRoute,
	gamesRoute,
	sessionRoute,
	resultRoute,
	historyRoute,
	settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
