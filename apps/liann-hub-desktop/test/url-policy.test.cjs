'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HUB_URL, isHubUrl, isExternalUrl } = require('../url-policy.cjs');

test('desktop wrapper loads the confirmed HUB address', () => {
  assert.equal(HUB_URL, 'https://app.lwliann.com/');
});

test('only the HUB origin stays inside the desktop app', () => {
  assert.equal(isHubUrl('https://app.lwliann.com/#read/ep1a'), true);
  assert.equal(isHubUrl('https://app.lwliann.com.evil.example/'), false);
  assert.equal(isHubUrl('http://app.lwliann.com/'), false);
  assert.equal(isHubUrl('https://www.lwliann.com/'), false);
  assert.equal(isHubUrl('javascript:alert(1)'), false);
});

test('only external HTTPS links may reach the system browser', () => {
  assert.equal(isExternalUrl('https://lwl-backend-mhgo.onrender.com/'), true);
  assert.equal(isExternalUrl('https://app.lwliann.com/'), false);
  assert.equal(isExternalUrl('http://example.com/'), false);
  assert.equal(isExternalUrl('file:///C:/secrets'), false);
  assert.equal(isExternalUrl('mailto:someone@example.com'), false);
});
