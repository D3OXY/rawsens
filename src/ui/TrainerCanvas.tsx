import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "#app/components/ui/badge";
import { Button } from "#app/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#app/components/ui/card";
import type { InputMode, ScoredTrial } from "../domain/calibration-types";
import { scoreTrial } from "../domain/score-trial";
import type { TrialSpec } from "../domain/session-types";
import type { InputSample } from "../shared/input-protocol";
import {
	distance,
	staticTarget,
	type Target,
	trackingTarget,
} from "../trainer/target-model";
import { TrialRecorder } from "../trainer/trial-recorder";
import { dimensionLabels } from "./dimension-labels";
import { inputClient } from "./input-client";

type TrainerPhase = "idle" | "running" | "complete" | "invalid";

type TrainerCanvasProps = {
	trial: TrialSpec;
	baselineCmPer360: number;
	inputMode: InputMode;
	seed: number;
	onComplete: (result: ScoredTrial) => void;
	onInvalid: (result: Extract<ScoredTrial, { accepted: false }>) => void;
};

export function TrainerCanvas({
	trial,
	baselineCmPer360,
	inputMode,
	seed,
	onComplete,
	onInvalid,
}: TrainerCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const phaseRef = useRef<TrainerPhase>("idle");
	const [phase, setPhase] = useState<TrainerPhase>("idle");
	const [secondsLeft, setSecondsLeft] = useState(trial.durationMs / 1_000);
	const pointerRef = useRef({ x: 0, y: 0 });
	const arenaRef = useRef({ width: 1, height: 1 });
	const targetRef = useRef<Target>({ x: 0, y: 0, radius: 20 });
	const targetIndexRef = useRef(0);
	const targetShownAtRef = useRef(0);
	const startedAtRef = useRef(0);
	const nativeStartedAtUsRef = useRef(0);
	const nativeCaptureIdRef = useRef<number | null>(null);
	const recorderRef = useRef(new TrialRecorder(trial, inputMode));
	const frameRef = useRef(0);
	const trialTimeoutRef = useRef(0);
	const lockedRef = useRef(false);
	const paletteRef = useRef({
		target: "#3b82f6",
		targetIdle: "#6b7280",
		targetInner: "#ffffff",
		cursor: "#333333",
		cursorHit: "#ffffff",
	});

	useEffect(() => {
		const updatePalette = () => {
			const styles = getComputedStyle(document.documentElement);
			paletteRef.current = {
				target: styles.getPropertyValue("--primary").trim(),
				targetIdle: styles.getPropertyValue("--muted-foreground").trim(),
				targetInner: styles.getPropertyValue("--background").trim(),
				cursor: styles.getPropertyValue("--foreground").trim(),
				cursorHit: styles.getPropertyValue("--primary-foreground").trim(),
			};
		};
		const observer = new MutationObserver(updatePalette);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		updatePalette();
		return () => observer.disconnect();
	}, []);

	const setPhaseValue = useCallback((next: TrainerPhase) => {
		phaseRef.current = next;
		setPhase(next);
	}, []);

	const stop = useCallback(() => {
		window.clearTimeout(trialTimeoutRef.current);
		if (inputMode === "compatibility-relative") {
			if (document.pointerLockElement) void document.exitPointerLock();
		} else {
			void inputClient.stopCapture();
			nativeCaptureIdRef.current = null;
		}
	}, [inputMode]);

	useEffect(() => () => window.clearTimeout(trialTimeoutRef.current), []);

	const invalidate = useCallback(
		(reason: string) => {
			if (phaseRef.current !== "running") return;
			setPhaseValue("invalid");
			stop();
			onInvalid({
				accepted: false,
				observation: recorderRef.current.finish(),
				issues: [reason],
			});
		},
		[onInvalid, setPhaseValue, stop],
	);

	const finish = useCallback(() => {
		if (phaseRef.current !== "running") return;
		setPhaseValue("complete");
		stop();
		onComplete(scoreTrial(recorderRef.current.finish()));
	}, [onComplete, setPhaseValue, stop]);

	const placeStaticTarget = useCallback(
		(atMs: number) => {
			if (trial.dimension === "tracking") return;
			targetRef.current = staticTarget(
				trial.dimension,
				seed,
				targetIndexRef.current,
				arenaRef.current,
				pointerRef.current,
			);
			targetShownAtRef.current = atMs;
		},
		[seed, trial.dimension],
	);

	const begin = useCallback(
		(nativeStartedAtUs = 0) => {
			if (phaseRef.current === "running") return;
			recorderRef.current = new TrialRecorder(trial, inputMode);
			startedAtRef.current = performance.now();
			nativeStartedAtUsRef.current = nativeStartedAtUs;
			targetShownAtRef.current = 0;
			targetIndexRef.current = 0;
			setSecondsLeft(trial.durationMs / 1_000);
			placeStaticTarget(0);
			setPhaseValue("running");
			trialTimeoutRef.current = window.setTimeout(finish, trial.durationMs);
		},
		[finish, inputMode, placeStaticTarget, setPhaseValue, trial],
	);

	const applyMove = useCallback(
		(deltaX: number, deltaY: number) => {
			const gain = baselineCmPer360 / trial.candidate.cmPer360;
			const delta = { x: deltaX * gain, y: deltaY * gain };
			const arena = arenaRef.current;
			pointerRef.current = {
				x: Math.min(arena.width, Math.max(0, pointerRef.current.x + delta.x)),
				y: Math.min(arena.height, Math.max(0, pointerRef.current.y + delta.y)),
			};
			recorderRef.current.recordMove(delta);
		},
		[baselineCmPer360, trial.candidate.cmPer360],
	);

	const recordPrimaryClick = useCallback(
		(atMs: number) => {
			if (trial.dimension === "tracking") return;
			recorderRef.current.recordClick({
				atMs,
				targetShownAtMs: targetShownAtRef.current,
				pointer: pointerRef.current,
				target: targetRef.current,
			});
			targetIndexRef.current += 1;
			placeStaticTarget(atMs);
		},
		[placeStaticTarget, trial.dimension],
	);

	useEffect(() => {
		if (inputMode === "compatibility-relative") return;
		const unsubscribeCapture = inputClient.subscribeCapture((capture) => {
			if (capture.mode !== inputMode) return;
			if (capture.state === "started") {
				nativeCaptureIdRef.current = capture.captureId;
				begin(capture.timestampUs);
				return;
			}
			if (
				capture.state === "lost" &&
				capture.captureId === nativeCaptureIdRef.current
			) {
				invalidate(`Native input was lost: ${capture.reason}`);
			}
		});
		const unsubscribePacket = inputClient.subscribePacket((packet) => {
			if (
				phaseRef.current !== "running" ||
				packet.captureId !== nativeCaptureIdRef.current
			)
				return;
			for (const sample of packet.samples) {
				applyNativeSample(
					sample,
					applyMove,
					recordPrimaryClick,
					nativeStartedAtUsRef.current,
				);
			}
		});
		return () => {
			unsubscribeCapture();
			unsubscribePacket();
			if (phaseRef.current === "running") void inputClient.stopCapture();
		};
	}, [applyMove, begin, inputMode, invalidate, recordPrimaryClick]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const resize = () => {
			const bounds = canvas.getBoundingClientRect();
			const scale = window.devicePixelRatio || 1;
			canvas.width = Math.round(bounds.width * scale);
			canvas.height = Math.round(bounds.height * scale);
			arenaRef.current = { width: bounds.width, height: bounds.height };
			if (pointerRef.current.x === 0 && pointerRef.current.y === 0) {
				pointerRef.current = { x: bounds.width / 2, y: bounds.height / 2 };
			}
			placeStaticTarget(performance.now());
		};

		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();
		return () => observer.disconnect();
	}, [placeStaticTarget]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const draw = (now: number) => {
			const context = canvas.getContext("2d");
			if (!context) return;
			const scale = window.devicePixelRatio || 1;
			context.setTransform(scale, 0, 0, scale, 0, 0);
			context.clearRect(0, 0, arenaRef.current.width, arenaRef.current.height);

			if (phaseRef.current === "running") {
				const elapsed = now - startedAtRef.current;
				if (trial.dimension === "tracking") {
					targetRef.current = trackingTarget(seed, elapsed, arenaRef.current);
					recorderRef.current.recordSample({
						atMs: elapsed,
						pointer: pointerRef.current,
						target: targetRef.current,
					});
				}
				setSecondsLeft(
					Math.max(0, Math.ceil((trial.durationMs - elapsed) / 1_000)),
				);
				if (elapsed >= trial.durationMs) {
					finish();
				}
			}

			drawArena(
				context,
				targetRef.current,
				pointerRef.current,
				phaseRef.current,
				paletteRef.current,
			);
			frameRef.current = requestAnimationFrame(draw);
		};

		frameRef.current = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(frameRef.current);
	}, [finish, seed, trial.dimension, trial.durationMs]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const onPointerLock = () => {
			if (document.pointerLockElement === canvas) {
				lockedRef.current = true;
				begin();
				return;
			}
			if (lockedRef.current) {
				lockedRef.current = false;
				invalidate("Pointer capture was lost");
			}
		};

		const onMouseMove = (event: MouseEvent) => {
			if (
				phaseRef.current !== "running" ||
				inputMode !== "compatibility-relative"
			)
				return;
			applyMove(event.movementX, event.movementY);
		};

		const onMouseDown = (event: MouseEvent) => {
			if (
				phaseRef.current !== "running" ||
				inputMode !== "compatibility-relative"
			)
				return;
			if (event.target !== canvas) return;
			recordPrimaryClick(performance.now() - startedAtRef.current);
		};

		const onBlur = () => invalidate("Window focus was lost");
		const onPointerLockError = () => {
			if (inputMode === "compatibility-relative") begin();
			else invalidate("Pointer capture was denied");
		};
		document.addEventListener("pointerlockchange", onPointerLock);
		document.addEventListener("pointerlockerror", onPointerLockError);
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mousedown", onMouseDown);
		window.addEventListener("blur", onBlur);
		return () => {
			document.removeEventListener("pointerlockchange", onPointerLock);
			document.removeEventListener("pointerlockerror", onPointerLockError);
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mousedown", onMouseDown);
			window.removeEventListener("blur", onBlur);
		};
	}, [applyMove, begin, inputMode, invalidate, recordPrimaryClick]);

	const start = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas || phaseRef.current === "running") return;
		setPhaseValue("idle");
		if (inputMode !== "compatibility-relative") {
			void inputClient.startCapture();
			return;
		}
		const request = canvas.requestPointerLock();
		void request.catch(() => {
			if (inputMode === "compatibility-relative") begin();
		});
	}, [begin, inputMode, setPhaseValue]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const interactive =
				event.target instanceof HTMLElement &&
				Boolean(
					event.target.closest(
						"button, a, input, select, textarea, [role=button]",
					),
				);
			if (
				event.code === "Space" &&
				phaseRef.current !== "running" &&
				!interactive
			) {
				event.preventDefault();
				start();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [start]);

	return (
		<Card
			className="relative min-h-[420px] flex-1 gap-0 overflow-hidden py-0 shadow-sm"
			data-phase={phase}
		>
			<canvas
				ref={canvasRef}
				className="trainer-canvas absolute inset-0 block size-full cursor-crosshair"
				aria-label={`${trial.dimension} aim trial`}
			/>
			<div
				className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between gap-2"
				aria-live="polite"
			>
				<Badge variant="secondary">
					{trial.blindLabel ?? `${trial.candidate.cmPer360} cm/360`}
				</Badge>
				<Badge>{secondsLeft}s</Badge>
				<Badge variant="outline">{inputMode.replaceAll("-", " ")}</Badge>
			</div>
			{phase !== "running" && (
				<Card className="absolute top-1/2 left-1/2 w-[min(90%,22rem)] -translate-x-1/2 -translate-y-1/2 bg-card/95 shadow-lg backdrop-blur">
					<CardHeader>
						<CardTitle>{phaseTitle(phase, trial.dimension)}</CardTitle>
						<CardDescription>
							Keep the pointer inside the arena and aim naturally for{" "}
							{trial.durationMs / 1_000} seconds.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button type="button" size="lg" className="w-full" onClick={start}>
							{phase === "idle" ? "Start trial" : "Run again"}
						</Button>
					</CardContent>
					<CardFooter className="justify-center border-t text-muted-foreground">
						Press{" "}
						<kbd className="mx-1 rounded border px-1 font-mono">Space</kbd> to
						start
					</CardFooter>
				</Card>
			)}
		</Card>
	);
}

function applyNativeSample(
	sample: InputSample,
	applyMove: (deltaX: number, deltaY: number) => void,
	recordPrimaryClick: (atMs: number) => void,
	startedAtUs: number,
): void {
	if (sample.type === "move") {
		applyMove(sample.deltaX, sample.deltaY);
		return;
	}
	if (sample.button === "primary" && sample.pressed) {
		recordPrimaryClick(Math.max(0, (sample.timestampUs - startedAtUs) / 1_000));
	}
}

type CanvasPalette = {
	target: string;
	targetIdle: string;
	targetInner: string;
	cursor: string;
	cursorHit: string;
};

function phaseTitle(phase: TrainerPhase, dimension: TrialSpec["dimension"]) {
	if (phase === "idle") return `${dimensionLabels[dimension]} trial`;
	return phase === "complete" ? "Trial complete" : "Trial invalid";
}

function drawArena(
	context: CanvasRenderingContext2D,
	target: Target,
	pointer: { x: number; y: number },
	phase: TrainerPhase,
	palette: CanvasPalette,
): void {
	context.fillStyle = phase === "running" ? palette.target : palette.targetIdle;
	context.beginPath();
	context.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
	context.fill();
	context.strokeStyle = palette.targetInner;
	context.lineWidth = 2;
	context.beginPath();
	context.arc(target.x, target.y, target.radius * 0.42, 0, Math.PI * 2);
	context.stroke();

	const overTarget = distance(pointer, target) <= target.radius;
	context.strokeStyle = overTarget ? palette.cursorHit : palette.cursor;
	context.lineWidth = 1.5;
	context.beginPath();
	context.moveTo(pointer.x - 9, pointer.y);
	context.lineTo(pointer.x + 9, pointer.y);
	context.moveTo(pointer.x, pointer.y - 9);
	context.lineTo(pointer.x, pointer.y + 9);
	context.stroke();
}
