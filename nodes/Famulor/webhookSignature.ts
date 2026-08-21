import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_HEADER = 'x-famulor-signature';

export function createWebhookSignature(secret: string, rawBody: Buffer | string): string {
	const hmac = createHmac('sha256', secret);
	hmac.update(rawBody);
	return `sha256=${hmac.digest('hex')}`;
}

export function verifyWebhookSignature(options: {
	secret: string;
	rawBody: Buffer | string;
	headerValue: string | undefined;
}): boolean {
	const { secret, rawBody, headerValue } = options;

	if (!secret || !headerValue) {
		return false;
	}

	if (!headerValue.startsWith('sha256=')) {
		return false;
	}

	const expected = createWebhookSignature(secret, rawBody);
	const expectedBuffer = Buffer.from(expected, 'utf8');
	const actualBuffer = Buffer.from(headerValue, 'utf8');

	if (expectedBuffer.length !== actualBuffer.length) {
		return false;
	}

	return timingSafeEqual(expectedBuffer, actualBuffer);
}
