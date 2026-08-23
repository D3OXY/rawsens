import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { localDataClient } from "./local-data-client";

export type Theme = "light" | "dark";

type ThemeContextValue = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function currentTheme(): Theme {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>(currentTheme);
	const hydratedRef = useRef(false);
	const applyingSavedThemeRef = useRef<Theme | null>(null);
	const localData = useSyncExternalStore(
		localDataClient.subscribe,
		localDataClient.getSnapshot,
		localDataClient.getSnapshot,
	);

	useEffect(() => {
		void localDataClient.initialize();
	}, []);

	useEffect(() => {
		if (localData.phase !== "ready" || hydratedRef.current) return;
		hydratedRef.current = true;
		const savedTheme = localData.data.settings.theme;
		if (savedTheme !== "system" && savedTheme !== theme) {
			applyingSavedThemeRef.current = savedTheme;
			setTheme(savedTheme);
		}
	}, [localData.data.settings.theme, localData.phase, theme]);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", theme === "dark");
		document.documentElement.style.colorScheme = theme;
		localStorage.setItem("rawsens-theme", theme);
		if (applyingSavedThemeRef.current) {
			if (applyingSavedThemeRef.current === theme) {
				applyingSavedThemeRef.current = null;
			}
			return;
		}
		if (
			hydratedRef.current &&
			localData.available &&
			localData.phase === "ready" &&
			localData.data.settings.theme !== theme
		) {
			void localDataClient.updateSettings({
				...localData.data.settings,
				theme,
			});
		}
	}, [localData, theme]);

	return (
		<ThemeContext.Provider value={{ theme, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme must be used inside ThemeProvider");
	return value;
}
