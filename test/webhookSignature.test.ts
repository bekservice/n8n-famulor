import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { createWebhookSignature, verifyWebhookSignature } from '../nodes/Famulor/webhookSignature';

const SECRET = 'whsec_test_famulor_workspace';
const RAW_BODY = '{"event":"call.completed","data":{"id":"11111111-1111-4111-8111-111111111111"}}';

// Precomputed: HMAC-SHA256(raw body only, no timestamp) as lowercase hex.
const EXPECTED_HEX = createHmac('sha256', SECRET).update(RAW_BODY).digest('hex');
const EXPECTED_HEADER = `sha256=${EXPECTED_HEX}`;

describe('Famulor webhook HMAC', () => {
	it('creates sha256=<hex> over the raw body only', () => {
		assert.equal(createWebhookSignature(SECRET, RAW_BODY), EXPECTED_HEADER);
		assert.match(createWebhookSignature(SECRET, RAW_BODY), /^sha256=[0-9a-f]{64}$/);
	});

	it('matches a known secret + body → header vector', () => {
		const knownSecret = 'test-secret';
		const knownBody = '{"event":"call.completed"}';
		const knownHeader =
			'sha256=90c33d548fe338f3655514dee22323669af00679a98b9d9cbc8ac2ee9deafe04';

		assert.equal(createWebhookSignature(knownSecret, knownBody), knownHeader);
		assert.equal(
			verifyWebhookSignature({
				secret: knownSecret,
				rawBody: knownBody,
				headerValue: knownHeader,
			}),
			true,
		);
	});

	it('accepts a Buffer raw body with the same digest as the string', () => {
		const header = createWebhookSignature(SECRET, RAW_BODY);
		assert.equal(
			verifyWebhookSignature({
				secret: SECRET,
				rawBody: Buffer.from(RAW_BODY, 'utf8'),
				headerValue: header,
			}),
			true,
		);
	});

	it('rejects a missing, malformed, or wrong signature', () => {
		assert.equal(
			verifyWebhookSignature({ secret: SECRET, rawBody: RAW_BODY, headerValue: undefined }),
			false,
		);
		assert.equal(
			verifyWebhookSignature({ secret: SECRET, rawBody: RAW_BODY, headerValue: EXPECTED_HEX }),
			false,
		);
		assert.equal(
			verifyWebhookSignature({
				secret: SECRET,
				rawBody: RAW_BODY,
				headerValue: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
			}),
			false,
		);
		assert.equal(
			verifyWebhookSignature({
				secret: 'other-secret',
				rawBody: RAW_BODY,
				headerValue: EXPECTED_HEADER,
			}),
			false,
		);
		assert.equal(
			verifyWebhookSignature({
				secret: SECRET,
				rawBody: '{"event":"call.completed"}',
				headerValue: EXPECTED_HEADER,
			}),
			false,
		);
	});

	it('does not include a timestamp in the MAC', () => {
		const withTimestamp = createHmac('sha256', SECRET)
			.update(`timestamp.${RAW_BODY}`)
			.digest('hex');
		assert.notEqual(createWebhookSignature(SECRET, RAW_BODY), `sha256=${withTimestamp}`);
	});
});
