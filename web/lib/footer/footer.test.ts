import { expect, test } from "bun:test";
import { phoneStatus, terminalsTitle } from "./footer-rules.ts";

test("the phone chip says why it is off", () => {
  expect(phoneStatus({ tailscale: false }).text).toBe("Tailscale off");
  expect(phoneStatus({ tailscale: true, online: true })).toEqual({
    text: "Phone connected",
    on: true,
    tip: "A phone is online on your tailnet",
  });
  expect(phoneStatus({ tailscale: true, online: true, devices: [{ name: "iPhone 11", os: "iOS" }] })).toEqual({
    text: "iPhone 11 connected",
    on: true,
    tip: "iPhone 11 is online on your tailnet",
  });
  expect(phoneStatus({ tailscale: true, phones: 1 })).toMatchObject({
    text: "Phone offline",
    on: false,
    tip: "Your phone is not online on the tailnet",
  });
  expect(phoneStatus({ tailscale: true, phones: 0 }).tip).toBe("No phone on your tailnet");
});

test("the terminal count reads in the singular and the plural", () => {
  expect(terminalsTitle(1)).toBe("1 live terminal: show them all");
  expect(terminalsTitle(3)).toBe("3 live terminals: show them all");
});
