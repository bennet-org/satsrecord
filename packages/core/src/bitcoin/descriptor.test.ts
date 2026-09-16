import { describe, expect, it } from "vitest";
import {
  deriveAddress,
  normaliseExtendedKey,
  normaliseInput,
  parseDescriptor,
} from "./index";

// BIP84 test vectors (mnemonic "abandon" x11 + "about")
const bip84 = {
  xpub: "xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V",
  zpub: "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs",
  addr0: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
  addr1: "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g",
};
// BIP86 test vectors (same mnemonic)
const bip86 = {
  xpub: "xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ",
  addr0: "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr",
  addr1: "bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh",
};
// BIP49 test vectors are testnet (same mnemonic)
const bip49 = {
  upub: "upub5EFU65HtV5TeiSHmZZm7FUffBGy8UKeqp7vw43jYbvZPpoVsgU93oac7Wk3u6moKegAEWtGNF8DehrnHtv21XXEMYRUocHqguyjknFHYfgY",
  addr0: "2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2",
};

describe("normaliseExtendedKey", () => {
  it("converts zpub to the account xpub and remembers what it implied", () => {
    expect(normaliseExtendedKey(bip84.zpub)).toEqual({
      xpub: bip84.xpub,
      network: "mainnet",
      implies: "wpkh",
    });
  });
  it("passes xpub through with no implication", () => {
    expect(normaliseExtendedKey(bip84.xpub)).toEqual({
      xpub: bip84.xpub,
      network: "mainnet",
    });
  });
  it("recognises testnet upub", () => {
    const r = normaliseExtendedKey(bip49.upub);
    expect(r.network).toBe("testnet");
    expect(r.implies).toBe("sh_wpkh");
    expect(r.xpub.startsWith("tpub")).toBe(true);
  });
  it("rejects garbage and private keys", () => {
    expect(() => normaliseExtendedKey("hello")).toThrow(/extended public key/);
    expect(() =>
      normaliseExtendedKey(
        "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
      ),
    ).toThrow(/private key/);
  });
});

describe("normaliseInput", () => {
  it("zpub becomes wpkh descriptor", () => {
    const r = normaliseInput(bip84.zpub);
    expect(r.descriptor?.canonical).toBe(`wpkh(${bip84.xpub}/0/*)`);
    expect(r.descriptor?.issuable).toBe(true);
  });
  it("bare xpub asks for a script type, then accepts one", () => {
    expect(normaliseInput(bip84.xpub).needsScriptType).toEqual({
      xpub: bip84.xpub,
      network: "mainnet",
    });
    expect(normaliseInput(bip84.xpub, "tr").descriptor?.canonical).toBe(
      `tr(${bip84.xpub}/0/*)`,
    );
  });
  it("accepts a full descriptor with origin, checksum and <0;1> multipath, keeping only the external chain", () => {
    const r = normaliseInput(
      `wpkh([73c5da0a/84h/0h/0h]${bip84.zpub}/<0;1>/*)#abcd1234`,
    );
    expect(r.descriptor?.canonical).toBe(
      `wpkh([73c5da0a/84h/0h/0h]${bip84.xpub}/0/*)`,
    );
  });
});

describe("parseDescriptor", () => {
  it("parses sortedmulti but marks it not issuable", () => {
    const p = parseDescriptor(
      `wsh(sortedmulti(2,${bip84.xpub}/0/*,${bip86.xpub}/0/*))`,
    );
    expect(p.scriptType).toBe("wsh_sortedmulti");
    expect(p.threshold).toBe(2);
    expect(p.keys).toHaveLength(2);
    expect(p.issuable).toBe(false);
  });
  it("rejects legacy and unknown forms with a clear message", () => {
    expect(() => parseDescriptor(`pkh(${bip84.xpub}/0/*)`)).toThrow(
      /Only wpkh/,
    );
    expect(() => parseDescriptor("nonsense")).toThrow(/not a descriptor/);
    expect(() => parseDescriptor(`wpkh(${bip84.xpub}/1/*)`)).toThrow(
      /followed by \/0\/\*/,
    );
    expect(() =>
      parseDescriptor(
        `wsh(sortedmulti(3,${bip84.xpub}/0/*,${bip86.xpub}/0/*))`,
      ),
    ).toThrow(/Threshold/);
  });
});

describe("deriveAddress", () => {
  it("BIP84 wpkh", () => {
    const p = normaliseInput(bip84.zpub).descriptor!;
    expect(deriveAddress(p, 0)).toBe(bip84.addr0);
    expect(deriveAddress(p, 1)).toBe(bip84.addr1);
  });
  it("BIP86 tr", () => {
    const p = normaliseInput(bip86.xpub, "tr").descriptor!;
    expect(deriveAddress(p, 0)).toBe(bip86.addr0);
    expect(deriveAddress(p, 1)).toBe(bip86.addr1);
  });
  it("BIP49 sh(wpkh) on testnet from upub", () => {
    const p = normaliseInput(bip49.upub).descriptor!;
    expect(p.network).toBe("testnet");
    expect(deriveAddress(p, 0)).toBe(bip49.addr0);
  });
  it("refuses multisig and bad indices", () => {
    const p = parseDescriptor(
      `wsh(sortedmulti(1,${bip84.xpub}/0/*,${bip86.xpub}/0/*))`,
    );
    expect(() => deriveAddress(p, 0)).toThrow(/not enabled/);
    expect(() =>
      deriveAddress(normaliseInput(bip84.zpub).descriptor!, -1),
    ).toThrow(/range/);
  });
});
