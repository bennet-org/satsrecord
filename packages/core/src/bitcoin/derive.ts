import { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";
import type { Deriver } from "../domain";
import {
  DescriptorError,
  parseDescriptor,
  type ParsedDescriptor,
} from "./descriptor";

function net(p: ParsedDescriptor) {
  return p.network === "mainnet" ? btc.NETWORK : btc.TEST_NETWORK;
}

/** Address at external-chain `index` for a parsed single-sig descriptor. */
export function deriveAddress(parsed: ParsedDescriptor, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000)
    throw new DescriptorError("bad_index", "Index out of range.");
  if (!parsed.issuable)
    throw new DescriptorError(
      "not_issuable",
      "Multisig issuance is not enabled yet.",
    );
  const key = parsed.keys[0]!;
  const pub = HDKey.fromExtendedKey(
    key.xpub,
    parsed.network === "mainnet"
      ? undefined
      : { private: 0x04358394, public: 0x043587cf },
  )
    .deriveChild(0)
    .deriveChild(index).publicKey!;
  const n = net(parsed);
  switch (parsed.scriptType) {
    case "wpkh":
      return btc.p2wpkh(pub, n).address!;
    case "sh_wpkh":
      return btc.p2sh(btc.p2wpkh(pub, n), n).address!;
    case "tr":
      return btc.p2tr(pub.slice(1), undefined, n).address!;
    default:
      throw new DescriptorError("not_issuable", "Unsupported script type.");
  }
}

/** Deriver backed by @scure. Multisig will route to Bitcoin Core behind the same interface. */
export class SingleSigDeriver implements Deriver {
  async derive(descriptor: string, index: number) {
    return deriveAddress(parseDescriptor(descriptor), index);
  }
}
