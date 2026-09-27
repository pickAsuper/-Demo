import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

// 各平台图标都从同一份矢量图生成，避免手工维护多个设计稿。
const svg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="62" y="62" width="900" height="900" rx="212" fill="#465acb"/><path d="M285 377h454l34 382q2 41-42 41H293q-43 0-40-41z" fill="#fff"/><path d="M386 406V329a126 126 0 0 1 252 0v77" fill="none" stroke="#fff" stroke-width="40" stroke-linecap="round"/><path d="M430 577l56 57 119-131" fill="none" stroke="#465acb" stroke-width="39" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
);
await mkdir("build", { recursive: true });
await writeFile("build/icon.svg", svg);
await sharp(svg).png().toFile("build/icon.png");
const png256 = await sharp(svg).resize(256).png().toBuffer();
// ICO 文件包含一张 PNG 图像；0 宽高字段表示 256 像素。
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png256.length, 14);
ico.writeUInt32LE(22, 18);
await writeFile("build/icon.ico", Buffer.concat([ico, png256]));
const chunks = [];
for (const [type, size] of [
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
]) {
  const png = await sharp(svg).resize(size).png().toBuffer();
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(png.length + 8, 4);
  chunks.push(header, png);
}
const header = Buffer.alloc(8);
header.write("icns");
header.writeUInt32BE(8 + chunks.reduce((sum, b) => sum + b.length, 0), 4);
await writeFile("build/icon.icns", Buffer.concat([header, ...chunks]));
console.log("macOS / Windows / Linux 图标已生成");
