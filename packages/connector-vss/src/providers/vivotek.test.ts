import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { probeVivotek } from "./vivotek.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function baseConfig() {
  return {
    nvrBaseUrl: "https://nvr.local:3443",
    ipcamBaseUrl: "http://cam.local:80",
    username: "admin",
    password: "pw",
    cameraId: "C_1",
    timeoutMs: 20,
    retries: 0,
    backoffMs: 1
  };
}

describe("probeVivotek", () => {
  it("is fail-soft when base urls are missing", async () => {
    const result = await probeVivotek({
      timeoutMs: 20,
      retries: 0,
      backoffMs: 1
    });

    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
    assert.match(result.detail, /missing base url/);
  });

  it("returns offline result when nvr/ipcam endpoints fail", async () => {
    globalThis.fetch = async () => new Response("down", { status: 503 });

    const result = await probeVivotek(baseConfig());
    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
    assert.match(result.detail, /failed/);
  });

  it("handles timeout without throwing", async () => {
    globalThis.fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) {
          reject(new Error("missing abort signal"));
          return;
        }
        if (signal.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });

    const result = await probeVivotek({
      ...baseConfig(),
      timeoutMs: 5
    });

    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
  });

  it("tolerates non-json successful response", async () => {
    const called: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      called.push(url);
      if (url.endsWith("/api/serverInfo")) {
        return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
      }
      if (url.includes("/cgi-bin/viewer/video.jpg")) {
        return new Response("jpeg-bytes", { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return new Response("not-found", { status: 404 });
    };

    const result = await probeVivotek(baseConfig());
    assert.equal(result.success, true);
    assert.equal(result.offlineCameras, 0);
    assert.ok(called.some((url) => url.includes("/CamConfig/C_1/cgi-bin/viewer/video.jpg")));
  });
});
