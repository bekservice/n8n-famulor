export const DEFAULT_BASE_URL = 'https://app.famulor.io';
export const API_PREFIX = '/api/v1';

const CLASSIC_HOST = 'app.famulor.de';

export function resolveBaseUrl(baseUrl?: string): string {
	const raw = (baseUrl ?? DEFAULT_BASE_URL).trim();
	if (!raw) {
		return DEFAULT_BASE_URL;
	}

	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		throw new Error('Famulor Base URL must be an absolute URL such as https://app.famulor.io');
	}

	if (parsed.hostname === CLASSIC_HOST) {
		throw new Error(
			'app.famulor.de is Famulor Classic 1.0 and has no /api/v1. Use https://app.famulor.io or a verified whitelabel domain.',
		);
	}

	const origin = `${parsed.protocol}//${parsed.host}`;
	const path = parsed.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
	return path && path !== '/' ? `${origin}${path}` : origin;
}

export function buildApiUrl(baseUrl: string | undefined, endpoint: string): string {
	const base = resolveBaseUrl(baseUrl);
	const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
	return `${base}${API_PREFIX}${path}`;
}

export type MakeCallInput = {
	assistantId: string;
	toNumber: string;
	phoneNumberId?: string;
	lead?: Record<string, unknown>;
};

export function isE164(phone: string): boolean {
	return /^\+\d{5,20}$/.test(phone);
}

export function parseLead(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}

	let parsed: unknown = value;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed || trimmed === '{}') {
			return undefined;
		}
		parsed = JSON.parse(trimmed);
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error('Lead must be a JSON object');
	}

	const object = parsed as Record<string, unknown>;
	return Object.keys(object).length > 0 ? object : undefined;
}

export function buildMakeCallBody(input: MakeCallInput): Record<string, unknown> {
	const body: Record<string, unknown> = {
		assistant_id: input.assistantId,
		to_number: input.toNumber,
	};

	if (input.phoneNumberId) {
		body.phone_number_id = input.phoneNumberId;
	}

	if (input.lead && Object.keys(input.lead).length > 0) {
		body.lead = input.lead;
	}

	return body;
}

export function extractListItems(response: unknown, keys: string[] = ['data', 'items']): unknown[] {
	if (Array.isArray(response)) {
		return response;
	}

	if (response && typeof response === 'object') {
		const record = response as Record<string, unknown>;
		for (const key of keys) {
			if (Array.isArray(record[key])) {
				return record[key] as unknown[];
			}
		}

		if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
			const nested = record.data as Record<string, unknown>;
			for (const key of keys) {
				if (Array.isArray(nested[key])) {
					return nested[key] as unknown[];
				}
			}
		}
	}

	throw new Error('Famulor API returned an unexpected list payload');
}

export function unwrapResource(response: unknown): Record<string, unknown> {
	if (response && typeof response === 'object' && !Array.isArray(response)) {
		const record = response as Record<string, unknown>;
		if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
			return record.data as Record<string, unknown>;
		}
		return record;
	}

	return { value: response };
}

export function extractAssistantId(payload: Record<string, unknown>): string | undefined {
	if (typeof payload.assistant_id === 'string' && payload.assistant_id) {
		return payload.assistant_id;
	}

	for (const key of ['data', 'call']) {
		const nested = payload[key];
		if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
			const assistantId = (nested as Record<string, unknown>).assistant_id;
			if (typeof assistantId === 'string' && assistantId) {
				return assistantId;
			}
		}
	}

	return undefined;
}

export function extractWebhookEvent(payload: Record<string, unknown>): string | undefined {
	if (typeof payload.event === 'string' && payload.event) {
		return payload.event;
	}
	if (typeof payload.type === 'string' && payload.type) {
		return payload.type;
	}
	return undefined;
}
