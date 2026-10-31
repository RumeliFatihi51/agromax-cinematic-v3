import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
const input = readFileSync(
  new URL("../public/brand/agromax-mark-v1.svg", import.meta.url),
  "utf8",
);
for (const size of [32, 180, 192, 512]) {
  const png = new Resvg(input, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  writeFileSync(
    new URL(`../public/brand/agromax-icon-${size}.png`, import.meta.url),
    png,
  );
}
console.log("Brand icons generated: 32, 180, 192, 512 px");
for (const variant of ["", "-light"]) {
  const svg = readFileSync(
    new URL(`../public/brand/agromax-logo${variant}-v1.svg`, import.meta.url),
    "utf8",
  );
  const png = new Resvg(svg, { fitTo: { mode: "height", value: 256 } })
    .render()
    .asPng();
  writeFileSync(
    new URL(`../public/brand/agromax-logo${variant}-v1.png`, import.meta.url),
    png,
  );
}
console.log("Outlined wordmark logos generated at 256 px height");
