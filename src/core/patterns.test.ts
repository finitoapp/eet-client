import assert from "node:assert/strict";
import { describe } from "node:test";
import { each } from "../../test/helpers.ts";
import { isValidEetDateTime } from "./patterns.ts";

describe("isValidEetDateTime", () => {
  each([
    ["2027-01-07T22:01:00+01:00", "ordinary positive offset"],
    ["2027-01-07T22:01:00Z", "Z offset"],
    ["2027-01-07T22:01:00-05:00", "ordinary negative offset"],
    ["2027-01-07T00:00:00+00:00", "zero offset written as +00:00, not Z"],
    ["2024-02-29T12:00:00Z", "leap year Feb 29"],
    ["2000-02-29T12:00:00Z", "century leap year, divisible by 400"],
    ["2027-12-31T23:59:59Z", "last second of the year"],
    ["2027-01-01T12:00:00+14:00", "offset at the +14:00 bound"],
    ["2027-01-01T12:00:00-14:00", "offset at the -14:00 bound"],
  ])("accepts %s (%s)", (value) => {
    assert.strictEqual(isValidEetDateTime(value), true);
  });

  each([
    ["2024-02-30T25:61:61+99:00", "the exact nonsense example from the bug report"],
    ["2027-02-30T12:00:00Z", "February 30th does not exist"],
    ["2027-02-29T12:00:00Z", "Feb 29 in a non-leap year"],
    ["1900-02-29T12:00:00Z", "century non-leap year, divisible by 100 but not 400"],
    ["2027-00-01T12:00:00Z", "month 00"],
    ["2027-13-01T12:00:00Z", "month 13"],
    ["2027-01-00T12:00:00Z", "day 00"],
    ["2027-01-32T12:00:00Z", "day 32"],
    ["2027-04-31T12:00:00Z", "April has only 30 days"],
    ["2027-01-01T24:00:00Z", "hour 24"],
    ["2027-01-01T12:60:00Z", "minute 60"],
    ["2027-01-01T12:00:60Z", "second 60"],
    ["2027-01-01T12:00:00+14:01", "one minute past the +14:00 bound"],
    ["2027-01-01T12:00:00-14:01", "one minute past the -14:00 bound"],
    ["2027-01-01T12:00:00+15:00", "offset hour past 14"],
    ["not-a-date", "garbage, does not even match the shape"],
    ["2027-01-01T12:00:00", "missing offset"],
  ])("rejects %s (%s)", (value) => {
    assert.strictEqual(isValidEetDateTime(value), false);
  });
});
