import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { afterEach, describe, it } from "node:test";
import net from "node:net";
import tls from "node:tls";
import { probeRtsp } from "./rtsp.js";

type Mode = "ok" | "unauthorized" | "timeout" | "error";

class FakeSocket extends EventEmitter {
  private timeoutHandler: (() => void) | undefined;

  setTimeout(_ms: number, callback?: () => void): this {
    this.timeoutHandler = callback;
    return this;
  }

  write(_data: string): boolean {
    return true;
  }

  destroy(): this {
    return this;
  }

  triggerTimeout(): void {
    this.timeoutHandler?.();
  }
}

const originalCreateConnection = net.createConnection;
const originalTlsConnect = tls.connect;

function installSocketMock(mode: Mode): void {
  const factory = () => {
    const socket = new FakeSocket();
    setImmediate(() => {
      if (mode === "error") {
        socket.emit("error", new Error("connect failed"));
        return;
      }
      socket.emit("connect");
      if (mode === "timeout") {
        socket.triggerTimeout();
        return;
      }
      if (mode === "unauthorized") {
        socket.emit("data", Buffer.from("RTSP/1.0 401 Unauthorized\r\nCSeq: 1\r\n\r\n", "utf8"));
        return;
      }
      socket.emit("data", Buffer.from("RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n", "utf8"));
    });
    return socket as unknown as net.Socket;
  };

  (net as unknown as { createConnection: typeof net.createConnection }).createConnection = factory as typeof net.createConnection;
  (tls as unknown as { connect: typeof tls.connect }).connect = factory as unknown as typeof tls.connect;
}

afterEach(() => {
  (net as unknown as { createConnection: typeof net.createConnection }).createConnection = originalCreateConnection;
  (tls as unknown as { connect: typeof tls.connect }).connect = originalTlsConnect;
});

describe("probeRtsp", () => {
  it("is fail-soft when url is missing", async () => {
    const result = await probeRtsp({ timeoutMs: 20 });
    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
    assert.match(result.detail, /missing url/);
  });

  it("is fail-soft for invalid url", async () => {
    const result = await probeRtsp({ rtspUrl: "::::", timeoutMs: 20 });
    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
    assert.match(result.detail, /invalid/);
  });

  it("returns success on RTSP 200", async () => {
    installSocketMock("ok");
    const result = await probeRtsp({ rtspUrl: "rtsp://camera.local:554/live", timeoutMs: 20 });
    assert.equal(result.success, true);
    assert.equal(result.offlineCameras, 0);
  });

  it("returns failure on RTSP 401", async () => {
    installSocketMock("unauthorized");
    const result = await probeRtsp({ rtspUrl: "rtsp://camera.local:554/live", timeoutMs: 20 });
    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
    assert.match(result.detail, /401/);
  });

  it("handles timeout without throwing", async () => {
    installSocketMock("timeout");
    const result = await probeRtsp({ rtspUrl: "rtsps://camera.local:322/live", timeoutMs: 10 });
    assert.equal(result.success, false);
    assert.equal(result.offlineCameras, 1);
  });
});
