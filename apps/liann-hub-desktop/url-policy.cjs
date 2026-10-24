'use strict';

const HUB_URL = 'https://app.lwliann.com/';
const HUB_ORIGIN = new URL(HUB_URL).origin;

function parsedHttpUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function isHubUrl(raw) {
  const url = parsedHttpUrl(raw);
  return Boolean(url && url.origin === HUB_ORIGIN);
}

function isExternalUrl(raw) {
  const url = parsedHttpUrl(raw);
  return Boolean(url && url.protocol === 'https:' && url.origin !== HUB_ORIGIN);
}

module.exports = { HUB_URL, HUB_ORIGIN, isHubUrl, isExternalUrl };
