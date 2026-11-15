import test from 'node:test';
import assert from 'node:assert/strict';
import { readSessionToken } from '../src/server/supabase-app.js';

test('reads the complete SubnetLab session token without its cookie separator', () => {
  assert.equal(readSessionToken('subnetlab=header.payload.signature'), 'header.payload.signature');
});

test('finds the SubnetLab cookie when other cookies are present', () => {
  assert.equal(
    readSessionToken('theme=dark; other=value; subnetlab=header.payload.signature'),
    'header.payload.signature'
  );
});

test('decodes a URL-encoded session cookie', () => {
  assert.equal(readSessionToken('subnetlab=header.payload%2Bsignature'), 'header.payload+signature');
});

test('returns null when no SubnetLab session cookie exists', () => {
  assert.equal(readSessionToken('theme=dark; other=value'), null);
});
