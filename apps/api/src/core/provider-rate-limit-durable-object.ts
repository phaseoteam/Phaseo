// Purpose: Coordinate fixed-window provider quota counters globally.
// Why: Native Workers rate-limit counters are location-local and cannot account for completed token usage.
// How: Stores one durable counter row per managed provider credential scope.

import { DurableObject } from "cloudflare:workers";
import type { GatewayBindings } from "@/runtime/env.types";
import { BATCH_DOWNLOAD_LIMIT, BATCH_DOWNLOAD_WINDOW_MS, type BatchDownloadAdmission } from "@core/batch-download-limits";
import {
	resolveProviderRateLimitDenial,
	type ProviderRateLimitAdmission,
	type ProviderRateLimitConfig,
	type ProviderTokenReservation,
} from "@core/provider-rate-limits";

type CounterRow = {
	id: number;
	minute_window: number;
	day_window: number;
	minute_requests: number;
	day_requests: number;
	minute_tokens: number;
	day_tokens: number;
};

const DAY_MS = 86_400_000;

export class ProviderRateLimitDurableObject extends DurableObject<GatewayBindings> {
	constructor(ctx: DurableObjectState, env: GatewayBindings) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS counters (
					id INTEGER PRIMARY KEY CHECK (id = 1),
					minute_window INTEGER NOT NULL,
					day_window INTEGER NOT NULL,
					minute_requests INTEGER NOT NULL,
					day_requests INTEGER NOT NULL,
					minute_tokens INTEGER NOT NULL,
					day_tokens INTEGER NOT NULL
				)
			`);
		});
	}

	async admitBatchDownload(): Promise<BatchDownloadAdmission> {
		// Synchronous SQL admission cannot interleave with another request. At most ten rows
		// are retained, in a separate object per workspace/batch from provider quotas.
		const now = Date.now();
		const sql = this.ctx.storage.sql;
		sql.exec("CREATE TABLE IF NOT EXISTS batch_downloads (started_at INTEGER NOT NULL)");
		sql.exec("DELETE FROM batch_downloads WHERE started_at <= ?", now - BATCH_DOWNLOAD_WINDOW_MS);
		const rows = sql.exec<{ started_at: number }>("SELECT started_at FROM batch_downloads ORDER BY started_at").toArray();
		if (rows.length >= BATCH_DOWNLOAD_LIMIT) {
			return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((rows[0].started_at + BATCH_DOWNLOAD_WINDOW_MS - now) / 1000)) };
		}
		sql.exec("INSERT INTO batch_downloads (started_at) VALUES (?)", now);
		await this.ctx.storage.setAlarm(now + BATCH_DOWNLOAD_WINDOW_MS);
		return { allowed: true, retryAfterSeconds: 0 };
	}

	async alarm(): Promise<void> {
		await this.ctx.blockConcurrencyWhile(async () => {
			const sql = this.ctx.storage.sql;
			const table = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'batch_downloads'").toArray();
			if (!table.length) return;
			const latest = sql.exec<{ latest: number | null }>("SELECT MAX(started_at) AS latest FROM batch_downloads").toArray()[0]?.latest;
			if (latest != null && latest + BATCH_DOWNLOAD_WINDOW_MS > Date.now()) {
				await this.ctx.storage.setAlarm(latest + BATCH_DOWNLOAD_WINDOW_MS);
			} else {
				await this.ctx.storage.deleteAll();
			}
		});
	}

	private current(nowMs: number): CounterRow {
		const minuteWindow = Math.floor(nowMs / 60_000);
		const dayWindow = Math.floor(nowMs / DAY_MS);
		let row = this.ctx.storage.sql.exec<CounterRow>("SELECT * FROM counters WHERE id = 1").toArray()[0];
		if (!row) {
			this.ctx.storage.sql.exec(
				"INSERT INTO counters VALUES (1, ?, ?, 0, 0, 0, 0)",
				minuteWindow,
				dayWindow,
			);
			row = { id: 1, minute_window: minuteWindow, day_window: dayWindow, minute_requests: 0, day_requests: 0, minute_tokens: 0, day_tokens: 0 };
		}
		if (row.minute_window !== minuteWindow) {
			row.minute_window = minuteWindow;
			row.minute_requests = 0;
			row.minute_tokens = 0;
		}
		if (row.day_window !== dayWindow) {
			row.day_window = dayWindow;
			row.day_requests = 0;
			row.day_tokens = 0;
		}
		return row;
	}

	private persist(row: CounterRow): void {
		this.ctx.storage.sql.exec(
			`UPDATE counters SET minute_window = ?, day_window = ?, minute_requests = ?,
			 day_requests = ?, minute_tokens = ?, day_tokens = ? WHERE id = 1`,
			row.minute_window,
			row.day_window,
			row.minute_requests,
			row.day_requests,
			row.minute_tokens,
			row.day_tokens,
		);
	}

	async admit(
		config: ProviderRateLimitConfig,
		reservationTokens: number | null,
		reservationId: string,
		nowMs = Date.now(),
	): Promise<ProviderRateLimitAdmission> {
		const row = this.current(nowMs);
		const hasTokenLimit = config.tokensPerMinute != null || config.tokensPerDay != null;
		const requestedTokens = hasTokenLimit
			? (Number.isSafeInteger(reservationTokens) && Number(reservationTokens) > 0
				? Number(reservationTokens)
				: Number.MAX_SAFE_INTEGER)
			: 0;
		const denial = resolveProviderRateLimitDenial(config, {
			minuteWindow: row.minute_window,
			dayWindow: row.day_window,
			minuteRequests: row.minute_requests,
			dayRequests: row.day_requests,
			minuteTokens: row.minute_tokens,
			dayTokens: row.day_tokens,
		}, nowMs, requestedTokens);
		if (denial) return denial;

		row.minute_requests += 1;
		row.day_requests += 1;
		row.minute_tokens += requestedTokens;
		row.day_tokens += requestedTokens;
		this.persist(row);
		return {
			allowed: true,
			reason: null,
			retryAfterSeconds: null,
			reservation: requestedTokens > 0
				? {
					id: reservationId,
					providerId: config.providerId,
					tokens: requestedTokens,
					minuteWindow: row.minute_window,
					dayWindow: row.day_window,
				}
				: null,
		};
	}

	async recordTokens(tokens: number, nowMs = Date.now()): Promise<void> {
		if (!Number.isSafeInteger(tokens) || tokens <= 0) return;
		const row = this.current(nowMs);
		row.minute_tokens += tokens;
		row.day_tokens += tokens;
		this.persist(row);
	}

	async reconcileTokens(
		reservation: ProviderTokenReservation,
		actualTokens: number,
		nowMs = Date.now(),
	): Promise<void> {
		if (!Number.isSafeInteger(reservation.tokens) || reservation.tokens <= 0) return;
		if (!Number.isSafeInteger(actualTokens) || actualTokens < 0) return;
		const row = this.current(nowMs);
		const delta = actualTokens - reservation.tokens;
		if (row.minute_window === reservation.minuteWindow) {
			row.minute_tokens = Math.max(0, row.minute_tokens + delta);
		}
		if (row.day_window === reservation.dayWindow) {
			row.day_tokens = Math.max(0, row.day_tokens + delta);
		}
		this.persist(row);
	}
}
