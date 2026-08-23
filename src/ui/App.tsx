import { useEffect, useSyncExternalStore } from "react";
import { type UpdatePolicy, updatePolicies } from "../shared/rpc";
import { updateClient } from "./update-client";

const policyLabels: Record<UpdatePolicy, string> = {
	manual: "Manual",
	notify: "Notify",
	download: "Download",
	automatic: "Automatic",
};

export function App() {
	const update = useSyncExternalStore(
		updateClient.subscribe,
		updateClient.getSnapshot,
		updateClient.getSnapshot,
	);

	useEffect(() => {
		void updateClient.initialize();
	}, []);

	const busy = update.phase === "checking" || update.phase === "downloading";

	return (
		<main className="shell">
			<header className="masthead">
				<div>
					<p className="eyebrow">OPEN AIM CALIBRATION / WINDOWS</p>
					<h1>RAWSENS</h1>
				</div>
				<span className="build">BUILD {update.currentVersion}</span>
			</header>

			<section className="instrument" aria-labelledby="status-title">
				<div className="reticle" aria-hidden="true">
					<span />
				</div>
				<div className="status-copy">
					<p className="index">01 / SYSTEM</p>
					<h2 id="status-title">Calibration core pending</h2>
					<p>
						The desktop, release, and update rails are live. Calibration trials
						come next.
					</p>
				</div>
				<div className="readout">
					<span>INPUT</span>
					<strong>RAW</strong>
					<span>STATE</span>
					<strong>STANDBY</strong>
				</div>
			</section>

			<section className="updates" aria-labelledby="updates-title">
				<div>
					<p className="index">02 / DELIVERY</p>
					<h2 id="updates-title">Update control</h2>
					<p className={`update-status phase-${update.phase}`}>
						<span aria-hidden="true" />
						{update.message}
					</p>
				</div>

				<label className="policy">
					<span>POLICY</span>
					<select
						value={update.policy}
						onChange={(event) =>
							void updateClient.setPolicy(
								event.currentTarget.value as UpdatePolicy,
							)
						}
					>
						{updatePolicies.map((policy) => (
							<option key={policy} value={policy}>
								{policyLabels[policy]}
							</option>
						))}
					</select>
				</label>

				<div className="actions">
					<button
						type="button"
						disabled={busy}
						onClick={() => void updateClient.check()}
					>
						Check now
					</button>
					{update.phase === "available" && (
						<button type="button" onClick={() => void updateClient.download()}>
							Download {update.latestVersion}
						</button>
					)}
					{update.phase === "ready" && (
						<button
							className="primary"
							type="button"
							onClick={() => void updateClient.apply()}
						>
							Restart + install
						</button>
					)}
				</div>
			</section>

			<footer>
				<span>LOCAL-FIRST</span>
				<span>NO ACCOUNT</span>
				<span>AGPL-3.0</span>
			</footer>
		</main>
	);
}
