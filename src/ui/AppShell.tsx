import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { buttonVariants } from "#app/components/ui/button";
import { cn } from "#app/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
	{ to: "/" as const, label: "Home" },
	{ to: "/history" as const, label: "History" },
	{ to: "/games" as const, label: "Games" },
	{ to: "/settings" as const, label: "Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-muted/30">
			<header className="border-b bg-background">
				<div className="mx-auto flex min-h-12 max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
					<Link
						to="/"
						className="text-sm font-semibold tracking-tight no-underline"
					>
						RawSens
					</Link>
					<nav aria-label="Primary" className="flex items-center gap-1">
						{navigation.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								className={cn(
									buttonVariants({ variant: "ghost", size: "sm" }),
									"px-2 sm:px-3",
								)}
								activeProps={{ className: "bg-accent text-accent-foreground" }}
							>
								{item.label}
							</Link>
						))}
						<ThemeToggle />
					</nav>
				</div>
			</header>
			{children}
			<footer className="mx-auto flex max-w-5xl items-center gap-3 px-6 pb-8 text-xs text-muted-foreground">
				<span>No account</span>
				<span aria-hidden="true">·</span>
				<span>AGPL-3.0</span>
			</footer>
		</div>
	);
}
