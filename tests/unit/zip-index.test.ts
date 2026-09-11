import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mimeFromFilename, zipEntryNames } from "../../lib/claw/zip-index.ts";

function crc32(buf: Buffer): number {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function storedZip(name: string, body: string): Buffer {
  const fileName = Buffer.from(name);
  const data = Buffer.from(body);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  const localOff = 0;
  central.writeUInt32LE(localOff, 42);
  const localBlob = Buffer.concat([local, fileName, data]);
  const cd = Buffer.concat([central, fileName]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(localBlob.length, 16);
  return Buffer.concat([localBlob, cd, eocd]);
}

describe("zip index", () => {
  it("lists stored zip entries", () => {
    const buf = storedZip("hello.txt", "hi");
    assert.deepEqual(zipEntryNames(buf), ["hello.txt"]);
  });

  it("maps zip mime from filename", () => {
    assert.equal(mimeFromFilename("pack.zip", ""), "application/zip");
    assert.equal(mimeFromFilename("note.txt", "text/plain"), "text/plain");
  });
});
