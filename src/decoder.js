import axios from "axios";
import { BorshInstructionCoder } from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_MAPPINGS = {
  jupeiUmn818Jg1ekPURTpr4mFo29p46vygyykFJ3wZC: {
    name: "LIQUIDITY_PROGRAM",
    idlUrl:
      "https://raw.githubusercontent.com/jup-ag/jupiter-lend/refs/heads/main/target/idl/liquidity.json",
  },
  jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9: {
    name: "LENDING_PROGRAM",
    idlUrl:
      "https://raw.githubusercontent.com/jup-ag/jupiter-lend/refs/heads/main/target/idl/lending.json",
  },
  jup7TthsMgcR9Y3L277b8Eo9uboVSmu1utkuXHNUKar: {
    name: "LRRM_PROGRAM",
    idlUrl:
      "https://raw.githubusercontent.com/jup-ag/jupiter-lend/refs/heads/main/target/idl/lending_reward_rate_model.json",
  },
  jupnw4B6Eqs7ft6rxpzYLJZYSnrpRgPcr589n5Kv4oc: {
    name: "ORACLE_PROGRAM",
    idlUrl:
      "https://raw.githubusercontent.com/jup-ag/jupiter-lend/refs/heads/main/target/idl/oracle.json",
  },
  jupr81YtYssSyPt8jbnGuiWon5f6x9TcDEFxYe3Bdzi: {
    name: "VAULTS_PROGRAM",
    idlUrl:
      "https://raw.githubusercontent.com/jup-ag/jupiter-lend/refs/heads/main/target/idl/vaults.json",
  },
};

const idlCache = {};
const coderCache = {};

const connection = new Connection(
  "https://jupiter-solana-api.instantnodes.io/token-J3MdC4hrdzWlGnNLxSHfepC1yWZstdIW"
);

async function getLookupTableAccounts(lookupTableAddresses) {
  const lookupTableAccounts = [];
  const account = await connection.getAddressLookupTable(
    new PublicKey(lookupTableAddresses)
  );
  if (account && account.value) {
    lookupTableAccounts.push(account.value);
  } else {
    throw new Error(
      `Lookup table not found: ${new PublicKey(lookupTableAddresses).toBase58()}`
    );
  }
  return lookupTableAccounts;
}

async function fetchAddressTableAccounts(addressTableKey) {
  try {
    const lookupTablePubkey = new PublicKey(addressTableKey);
    const lookupTableAccounts = await getLookupTableAccounts(lookupTablePubkey);
    if (lookupTableAccounts.length > 0) {
      const addresses = lookupTableAccounts[0].state.addresses.map((pubkey) =>
        pubkey.toBase58()
      );
      return addresses;
    }
    return [];
  } catch (error) {
    return [];
  }
}

async function resolveAccountKeys(baseAccountKeys, addressTableLookups) {
  const resolvedKeys = [...baseAccountKeys];
  for (const lookup of addressTableLookups) {
    const tableAccounts = await fetchAddressTableAccounts(lookup.accountKey);
    for (const index of lookup.writableIndexes) {
      if (tableAccounts[index]) {
        resolvedKeys.push(tableAccounts[index]);
      }
    }
    for (const index of lookup.readonlyIndexes) {
      if (tableAccounts[index]) {
        resolvedKeys.push(tableAccounts[index]);
      }
    }
  }
  return resolvedKeys;
}

function getAccountNamesFromIDL(idl, instructionName) {
  try {
    const instruction = idl.instructions?.find((instr) => instr.name === instructionName);
    if (instruction && instruction.accounts) {
      return instruction.accounts.map((acc) => acc.name);
    }
    return [];
  } catch (error) {
    return [];
  }
}

function convertHexToDecimal(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof PublicKey) return obj.toString();
  if (
    obj instanceof BN ||
    (obj && typeof obj === "object" && obj.constructor && obj.constructor.name === "BN")
  ) {
    const maxSafeInteger = new BN("18446744073709551616");
    if (obj.gt(maxSafeInteger)) return obj.toString();
    return obj.toString(10);
  }
  if (obj && typeof obj === "object" && obj._bn && typeof obj._bn === "string") {
    try {
      const bnValue = new BN(obj._bn);
      const maxSafeInteger = new BN("18446744073709551616");
      if (bnValue.gt(maxSafeInteger)) return obj._bn;
      return obj._bn;
    } catch (e) {
      return obj._bn;
    }
  }
  if (typeof obj === "string" && obj.startsWith("0x")) {
    try {
      const decimal = parseInt(obj, 16);
      return decimal.toString();
    } catch (e) {
      return obj;
    }
  }
  if (Array.isArray(obj)) return obj.map((item) => convertHexToDecimal(item));
  if (typeof obj === "object") {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertHexToDecimal(value);
    }
    return converted;
  }
  if (typeof obj === "number") return obj.toString();
  return obj;
}

async function fetchIDL(programId) {
  if (idlCache[programId]) return idlCache[programId];
  const mapping = PROGRAM_MAPPINGS[programId];
  if (!mapping) throw new Error(`Unknown program ID: ${programId}`);
  const response = await axios.get(mapping.idlUrl);
  const idl = response.data;
  idlCache[programId] = idl;
  return idl;
}

async function getCoder(programId) {
  if (coderCache[programId]) return coderCache[programId];
  const idl = await fetchIDL(programId);
  const coder = new BorshInstructionCoder(idl);
  coderCache[programId] = coder;
  return coder;
}

async function decodeInstruction(instruction, resolvedAccountKeys) {
  const programId = resolvedAccountKeys[instruction.programIdIndex];
  const mapping = PROGRAM_MAPPINGS[programId];
  if (!mapping) {
    return {
      programId,
      programName: "UNKNOWN_PROGRAM",
      instructionName: "unknown",
      accounts: instruction.accountIndexes.map((idx, i) => ({
        name: `account_${i}`,
        address: resolvedAccountKeys[idx] || `UNKNOWN_ACCOUNT_${idx}`,
        index: idx,
      })),
      decodedData: { error: "Unknown program ID" },
      rawData: instruction.data,
    };
  }

  try {
    const coder = await getCoder(programId);
    const idl = await fetchIDL(programId);
    const instructionData = Buffer.from(instruction.data);
    const decoded = coder.decode(instructionData, "base58");
    if (!decoded) {
      return {
        programId,
        programName: mapping.name,
        instructionName: "unknown",
        accounts: instruction.accountIndexes.map((idx, i) => ({
          name: `account_${i}`,
          address: resolvedAccountKeys[idx] || `UNKNOWN_ACCOUNT_${idx}`,
          index: idx,
        })),
        decodedData: { error: "Could not decode instruction with BorshInstructionCoder" },
        rawData: instruction.data,
      };
    }
    const accountNames = getAccountNamesFromIDL(idl, decoded.name);
    const accountsWithNames = instruction.accountIndexes.map((idx, i) => ({
      name: accountNames[i] || `account_${i}`,
      address: resolvedAccountKeys[idx] || `UNKNOWN_ACCOUNT_${idx}`,
      index: idx,
    }));
    const convertedDecodedData = convertHexToDecimal(decoded.data);
    return {
      programId,
      programName: mapping.name,
      instructionName: decoded.name,
      accounts: accountsWithNames,
      decodedData: convertedDecodedData,
      rawData: instruction.data,
    };
  } catch (error) {
    return {
      programId,
      programName: mapping.name,
      instructionName: "decode_error",
      accounts: instruction.accountIndexes.map((idx, i) => ({
        name: `account_${i}`,
        address: resolvedAccountKeys[idx] || `UNKNOWN_ACCOUNT_${idx}`,
        index: idx,
      })),
      decodedData: {
        error: `Decode failed: ${error}`,
        discriminator: instruction.data.slice(0, 8),
        note: "Raw instruction data available in rawData field",
      },
      rawData: instruction.data,
    };
  }
}

export async function decodeTransaction(txId) {
  const txResponse = await axios.get(`https://v4-api.squads.so/transactionV2/${txId}`);
  const txData = txResponse.data;
  const instructions = txData.transaction.account.message.instructions;
  const baseAccountKeys = txData.transaction.account.message.accountKeys;
  const addressTableLookups = txData.transaction.account.message.addressTableLookups || [];
  let memo = "";
  try {
    memo = JSON.parse(txData.transaction.metadata.info.memo).memo;
  } catch (e) {
    memo = String(txData.transaction.metadata?.info?.memo || "");
  }

  const resolvedAccountKeys = await resolveAccountKeys(baseAccountKeys, addressTableLookups);
  const decodedInstructions = [];
  for (let i = 0; i < instructions.length; i++) {
    const decoded = await decodeInstruction(instructions[i], resolvedAccountKeys);
    decodedInstructions.push(decoded);
  }
  return {
    transactionId: txId,
    memo,
    instructions: decodedInstructions,
  };
}


