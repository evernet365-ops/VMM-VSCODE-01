import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { probeGenericCgi } from "./generic-cgi.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function baseConfig() {
  return {
    providerName: "sampo",
    nvrBaseUrl: "http://nvr.local",
    cameraBaseUrl: "http://cam.local",
    username: "admin",
    password: "pw",
    nvrPaths: ["/cgi-bin/magicBox.cgi?action=getSystemInfo"],
    cameraPaths: ["/cgi-bin/viewer/video.jpg"],
    timeoutMs: 20,
    retries: 0,
    backoffMs: 1
  };
}

describe("probeGenericCgi", () => {
  it("is fail-soft when both base urls are missing", async () => {
    const result = await probeGenericCgi({
      ...baseConfig(),
      nvrBaseUrl: undefined,
      cameraBaseUrl: undefined
    });

    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
    assert.match(result.detail, /missing base url/);
  });

  it("returns success when nvr endpoint is reachable", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/cgi-bin/magicBox.cgi")) {
        return new Response("ok", { status: 200 });
      }
      return new Response("down", { status: 503 });
    };

    const result = await probeGenericCgi(baseConfig());
    assert.equal(result.success, true);
    assert.equal(result.offlineCameras, 1);
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

    const result = await probeGenericCgi({
      ...baseConfig(),
      timeoutMs: 5
    });
    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
  });
});
