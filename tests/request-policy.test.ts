import { test, expect } from 'bun:test';
import { makeRateLimiter, eligibleUnit } from '../request-policy';

test('limits repeated requests and resets after window', () => {
  let now = 1000;
  const allows = makeRateLimiter(() => now);
  expect(allows('vote:192.0.2.5', 2, 60000)).toBe(true);
  expect(allows('vote:192.0.2.5', 2, 60000)).toBe(true);
  expect(allows('vote:192.0.2.5', 2, 60000)).toBe(false);
  expect(allows('vote:192.0.2.6', 2, 60000)).toBe(true);
  now = 61000;
  expect(allows('vote:192.0.2.5', 2, 60000)).toBe(true);
});
test('votes require active eligible unit', () => {
  expect(eligibleUnit('101', true, ['101','102'])).toBe(true);
  expect(eligibleUnit('999', true, ['101','102'])).toBe(false);
  expect(eligibleUnit('101', false, ['101'])).toBe(false);
  expect(eligibleUnit('101', true, [])).toBe(true);
});
