// Output descriptors are the storage format. Users paste xpub/ypub/zpub or a descriptor; we normalise.
// Scope: wpkh, sh(wpkh), tr for issuance; wsh(sortedmulti) parses and validates but does not issue yet.
import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';

export type ScriptType = 'wpkh' | 'sh_wpkh' | 'tr' | 'wsh_sortedmulti';
export type Network = 'mainnet' | 'testnet';

export interface DescriptorKey {
  /** Key origin as pasted, e.g. "[d34db33f/84h/0h/0h]". Kept verbatim for the manifest. */
  origin?: string;
  /** Always a BIP32 xpub (mainnet) or tpub (testnet). SLIP-132 prefixes are converted on the way in. */
  xpub: string;
}

export interface ParsedDescriptor {
  scriptType: ScriptType;
  network: Network;
  keys: DescriptorKey[];
  /** Multisig threshold. Undefined for single-sig. */
  threshold?: number;
  /** Canonical form, external chain only, no checksum. */
  canonical: string;
  /** True when issuance is supported by the current deriver. */
  issuable: boolean;
}

const b58 = base58check(sha256);

// SLIP-0132 version bytes. Value: [network, script type the prefix implies].
const VERSIONS: Record<string, { network: Network; implies?: ScriptType }> = {
  '0488b21e': { network: 'mainnet' }, // xpub
  '049d7cb2': { network: 'mainnet', implies: 'sh_wpkh' }, // ypub
  '04b24746': { network: 'mainnet', implies: 'wpkh' }, // zpub
  '043587cf': { network: 'testnet' }, // tpub
  '044a5262': { network: 'testnet', implies: 'sh_wpkh' }, // upub
  '045f1cf6': { network: 'testnet', implies: 'wpkh' }, // vpub
};
const CANONICAL_VERSION: Record<Network, string> = { mainnet: '0488b21e', testnet: '043587cf' };
// xprv, yprv, zprv, tprv, uprv, vprv. Rejected before anything else so the message is unambiguous.
const PRIVATE_VERSIONS = new Set(['0488ade4', '049d7878', '04b2430c', '04358394', '044a4e28', '045f18bc']);

function hex(u8: Uint8Array) {
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(h: string) {
  return Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
}

export interface ExtendedKeyInfo { xpub: string; network: Network; implies?: ScriptType }

/** Decode any SLIP-132 extended public key and return the canonical xpub/tpub plus what its prefix implied. */
export function normaliseExtendedKey(input: string): ExtendedKeyInfo {
  let raw: Uint8Array;
  try {
    raw = b58.decode(input.trim());
  } catch {
    throw new DescriptorError('not_extended_key', 'That does not look like an extended public key.');
  }
  if (raw.length !== 78) throw new DescriptorError('not_extended_key', 'Extended key has the wrong length.');
  const version = hex(raw.slice(0, 4));
  if (PRIVATE_VERSIONS.has(version) || raw[45] === 0x00) throw new DescriptorError('private_key', 'That is a private key. Only ever paste the public key.');
  const v = VERSIONS[version];
  if (!v) throw new DescriptorError('unknown_prefix', 'Unrecognised extended key prefix.');
  const canonical = new Uint8Array(raw);
  canonical.set(fromHex(CANONICAL_VERSION[v.network]), 0);
  return { xpub: b58.encode(canonical), network: v.network, ...(v.implies ? { implies: v.implies } : {}) };
}

export class DescriptorError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const KEY_RE = /^(\[[0-9a-fA-F]{8}(?:\/\d+['h]?)*\])?([xyztuv]pub[1-9A-HJ-NP-Za-km-z]+)(\/(?:0|<0;1>)\/\*)$/;

function parseKey(s: string): { key: DescriptorKey; network: Network } {
  const m = KEY_RE.exec(s.trim());
  if (!m) throw new DescriptorError('bad_key', `Key expression must be an extended public key followed by /0/* (got "${s.trim().slice(0, 24)}…").`);
  const info = normaliseExtendedKey(m[2]!);
  return { key: { ...(m[1] ? { origin: m[1] } : {}), xpub: info.xpub }, network: info.network };
}

function stripChecksum(s: string) {
  const i = s.indexOf('#');
  return (i === -1 ? s : s.slice(0, i)).trim();
}

/** Parse a descriptor string. Throws DescriptorError with a user-facing message. */
export function parseDescriptor(input: string): ParsedDescriptor {
  const s = stripChecksum(input);
  let m: RegExpExecArray | null;

  if ((m = /^wpkh\((.+)\)$/.exec(s))) return single('wpkh', m[1]!);
  if ((m = /^sh\(wpkh\((.+)\)\)$/.exec(s))) return single('sh_wpkh', m[1]!);
  if ((m = /^tr\((.+)\)$/.exec(s))) return single('tr', m[1]!);
  if ((m = /^wsh\(sortedmulti\((\d+),(.+)\)\)$/.exec(s))) {
    const threshold = Number(m[1]);
    const parts = m[2]!.split(',');
    if (parts.length < 2) throw new DescriptorError('multisig_keys', 'Multisig needs at least two keys.');
    if (threshold < 1 || threshold > parts.length) throw new DescriptorError('multisig_threshold', `Threshold must be between 1 and ${parts.length}.`);
    const parsed = parts.map(parseKey);
    const network = sameNetwork(parsed.map((p) => p.network));
    const keys = parsed.map((p) => p.key);
    return {
      scriptType: 'wsh_sortedmulti',
      network,
      keys,
      threshold,
      canonical: `wsh(sortedmulti(${threshold},${keys.map(keyExpr).join(',')}))`,
      issuable: false,
    };
  }
  if (/^(pkh|sh\(pkh|combo|addr|raw|multi\(|wsh\(multi\()/.test(s)) {
    throw new DescriptorError('unsupported_script', 'Only wpkh, sh(wpkh), tr and wsh(sortedmulti(...)) descriptors are supported.');
  }
  throw new DescriptorError('not_descriptor', 'That is not a descriptor we recognise.');
}

function single(scriptType: Exclude<ScriptType, 'wsh_sortedmulti'>, keyExprIn: string): ParsedDescriptor {
  const { key, network } = parseKey(keyExprIn);
  const canonical =
    scriptType === 'wpkh' ? `wpkh(${keyExpr(key)})` : scriptType === 'sh_wpkh' ? `sh(wpkh(${keyExpr(key)}))` : `tr(${keyExpr(key)})`;
  return { scriptType, network, keys: [key], canonical, issuable: true };
}

function keyExpr(k: DescriptorKey) {
  return `${k.origin ?? ''}${k.xpub}/0/*`;
}

function sameNetwork(ns: Network[]): Network {
  const first = ns[0]!;
  if (ns.some((n) => n !== first)) throw new DescriptorError('mixed_networks', 'All keys must be for the same network.');
  return first;
}

export interface NormaliseResult {
  descriptor?: ParsedDescriptor;
  /** Set when a bare xpub/tpub was pasted and the script type cannot be inferred. */
  needsScriptType?: { xpub: string; network: Network };
}

/**
 * Turn whatever the charity pasted into a descriptor. ypub/zpub carry their script type; a bare xpub does not,
 * so the caller asks (default wpkh) and calls again with `scriptType`.
 */
export function normaliseInput(input: string, scriptType?: Exclude<ScriptType, 'wsh_sortedmulti'>): NormaliseResult {
  const s = input.trim();
  if (/^[xyztuv]pub[1-9A-HJ-NP-Za-km-z]+$/.test(s)) {
    const info = normaliseExtendedKey(s);
    const st = scriptType ?? info.implies;
    if (!st) return { needsScriptType: { xpub: info.xpub, network: info.network } };
    const wrapped = st === 'wpkh' ? `wpkh(${info.xpub}/0/*)` : st === 'sh_wpkh' ? `sh(wpkh(${info.xpub}/0/*))` : `tr(${info.xpub}/0/*)`;
    return { descriptor: parseDescriptor(wrapped) };
  }
  return { descriptor: parseDescriptor(s) };
}
