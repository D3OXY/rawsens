import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "#app/components/ui/button";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const nextTheme = theme === "light" ? "dark" : "light";

	return (
		<Button
			type="button"
			variant="ghost"
			onClick={() => setTheme(nextTheme)}
			aria-label={`Use ${nextTheme} mode`}
		>
			<HugeiconsIcon
				data-icon="inline-start"
				icon={theme === "light" ? Moon02Icon : Sun03Icon}
				strokeWidth={2}
			/>
			{nextTheme === "dark" ? "Dark" : "Light"}
		</Button>
	);
}
