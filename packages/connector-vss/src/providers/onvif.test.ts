import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { probeOnvif } from "./onvif.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function baseConfig() {
  return {
    deviceServiceUrl: "http://onvif-device.local/onvif/device_service",
    mediaServiceUrl: "http://onvif-media.local/onvif/media_service",
    username: "admin",
    password: "pw",
    timeoutMs: 20,
    retries: 0,
    backoffMs: 1
  };
}

describe("probeOnvif", () => {
  it("is fail-soft when service urls are missing", async () => {
    const result = await probeOnvif({
      timeoutMs: 20,
      retries: 0,
      backoffMs: 1
    });

    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
    assert.match(result.detail, /missing service url/);
  });

  it("returns success when first endpoint is reachable", async () => {
    const called: string[] = [];
    globalThis.fetch = async (input) => {
      called.push(String(input));
      return new Response("<ok/>", { status: 200, headers: { "content-type": "application/soap+xml" } });
    };

    const result = await probeOnvif(baseConfig());
    assert.equal(result.success, true);
    assert.equal(result.offlineCameras, 0);
    assert.equal(called.length, 1);
  });

  it("falls back to next endpoint when first fails", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("device_service")) {
        return new Response("down", { status: 503 });
      }
      return new Response("<ok/>", { status: 200 });
    };

    const result = await probeOnvif(baseConfig());
    assert.equal(result.success, true);
    assert.equal(result.offlineCameras, 0);
  });

  it("handles timeout without throwing", async () => {
    globalThis.fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) {
          reject(new Error("missing abort signal"));
          return;
        }
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });

    const result = await probeOnvif({
      ...baseConfig(),
      timeoutMs: 5
    });
    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
  });
});
