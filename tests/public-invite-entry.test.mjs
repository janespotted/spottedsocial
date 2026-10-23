import test from 'node:test';
import assert from 'node:assert/strict';
import { installationLink, getInstallation } from '../public/invitation-assets/entry.js';

test('public download only accepts Apple destinations and distinguishes TestFlight', () => {
  assert.equal(installationLink('https://apps.apple.com/us/app/spotted/id6760576197').label, 'Download on the App Store');
  assert.equal(installationLink('https://testflight.apple.com/j/Sample12').label, 'Get Spotted on TestFlight');
  for (const value of [null, '', 'javascript:alert(1)', 'https://apps.apple.com.evil.test/x', 'https://user@apps.apple.com/x', 'https://apps.apple.com:444/x', 'http://apps.apple.com/x', 'https://testflight.apple.com/nope']) assert.equal(installationLink(value), null);
});

test('public fetch recovers on retry, sends no visitor identity, and preserves honest unconfigured state', async () => {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({url, options});
    if (calls.length === 1) return new Response('unavailable', {status:503});
    return new Response(JSON.stringify({installUrl:null}), {status:200});
  };
  await assert.rejects(getInstallation(transport), /unavailable/);
  assert.equal(await getInstallation(transport), null);
  assert.equal(calls[1].options.body, '{}');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(new URL(calls[1].url).pathname, '/rest/v1/rpc/get_launch_installation');
});
