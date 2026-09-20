import { renderSVG } from "uqr";
import bitcoinMark from "./bitcoin-mark.svg?raw";

/** High correction, four clear border modules and a small, self-contained centre mark. */
export function bitcoinQR(uri: string) {
  let size = 0;
  const svg = renderSVG(uri, {
    ecc: "H",
    border: 4,
    pixelSize: 1,
    onEncoded: (qr) => {
      size = qr.size;
    },
  });
  const logoSize = size * 0.16;
  const inset = (size - logoSize) / 2;
  const logo = bitcoinMark.replace(
    "<svg ",
    `<svg x="${inset}" y="${inset}" width="${logoSize}" height="${logoSize}" `,
  );
  return svg.replace(
    "</svg>",
    `<circle cx="${size / 2}" cy="${size / 2}" r="${logoSize / 2 + size * 0.01}" fill="white"/>${logo}</svg>`,
  );
}
