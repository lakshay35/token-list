import { AllowedException, ValidatedTokensData, ValidationError } from "../types/types";
import { allowedDuplicateSymbols, allowedNotCommunityValidated} from "./duplicate-symbols";
import { PublicKey } from "@solana/web3.js";

export function indexToLineNumber(index: number): number {
  return index + 2;
}

export function detectDuplicateMints(tokens: ValidatedTokensData[]): number {
  let errorCount = 0;
  const map = new Map();
  tokens.forEach((token, i) => {
    if (map.has(token.Mint)) {
      console.log(ValidationError.DUPLICATE_MINT)
      console.log("Existing", map.get(token.Mint), "Duplicate", `(line ${token.Line})`, token);
      errorCount++;
    } else {
      map.set(token.Mint, token);
    }
  });
  return errorCount;
}

export function detectDuplicateSymbol(tokensPreviously: ValidatedTokensData[], tokens: ValidatedTokensData[]): number {
  const tokensPrevBySymbol = new Map();
  const tokensPrevByMint = new Map();
  // If we put tokens into a map by symbol, only tokens with duplicate symbols will be leftover.
  const duplicateSymbolsPrev: ValidatedTokensData[] = [];
  tokensPreviously.forEach((token, i) => {
    if (!tokensPrevBySymbol.has(token.Symbol)) {
      tokensPrevBySymbol.set(token.Symbol, token);
      tokensPrevByMint.set(token.Mint, token);
    } else {
      duplicateSymbolsPrev.push(token);
    }
  });

  const tokensBySymbol = new Map();
  const tokensByMint = new Map();
  const duplicateSymbols: ValidatedTokensData[] = [];
  tokens.forEach((token, i) => {
    if (!tokensBySymbol.has(token.Symbol)) {
      tokensBySymbol.set(token.Symbol, token);
      tokensByMint.set(token.Mint, token);
    } else {
      duplicateSymbols.push(token);
    }
  });
  duplicateSymbols.sort((a, b) => a.Symbol.localeCompare(b.Symbol));

  // as of writing this code, we already have 18 tokens with duplicate symbols. the point is to make sure this number doesn't grow.
  if (duplicateSymbols.length > allowedDuplicateSymbols.length) {
    // we have a problem. we have more duplicate symbols than we did before.
    // but what exactly was duplicated?
    const sortedDuplicateSymbols: string[] = duplicateSymbols
      .map((token) => token.Symbol)
      .sort()

    const theNewDuplicateSymbol = xorTokens(duplicateSymbols, allowedDuplicateSymbols)
    console.log(ValidationError.DUPLICATE_SYMBOL, theNewDuplicateSymbol);
    console.log(`(the last version of the CSV file had ${duplicateSymbolsPrev.length} duplicates)`)
  }
  return duplicateSymbols.length - allowedDuplicateSymbols.length;
}

function xorTokens(tokens: ValidatedTokensData[], allowedDuplicates: AllowedException[]): ValidatedTokensData[] {
  const tokensSymbolMint = tokens.map((token) => `${token.Symbol}-${token.Mint}`).sort();
  const allowedDuplicatesSymbolMint = allowedDuplicates.map((token) => `${token.Symbol}-${token.Mint}`).sort();

  const set1 = new Set(tokensSymbolMint);
  const set2 = new Set(allowedDuplicatesSymbolMint);

  const setDifference = new Set([...set1, ...set2].filter(value => !set1.has(value) || !set2.has(value)));
  // [ 'ARB-9xzZzEHsKnwFL1A3DyFJwj36KnZj3gZ7g4srWp9YTEoh' ]

  const duplicateSymbolMints = Array.from(setDifference).map((x) => x.split("-"))
  // [['ARB', '9xzZzEHsKnwFL1A3DyFJwj36KnZj3gZ7g4srWp9YTEoh']...]

  const answer : ValidatedTokensData[] = [];
  for (const [symbol, mint] of duplicateSymbolMints) {
    const matchingElement = tokens.find((token) => token.Symbol === symbol && token.Mint === mint);
    if(matchingElement) {
      answer.push(matchingElement)
    }
  }
  return answer
};

export function canOnlyAddOneToken(prevTokens: ValidatedTokensData[], tokens: ValidatedTokensData[]): number {
  let errorCount = 0;
  const diffLength = tokens.length - prevTokens.length;

  if (diffLength > 1) {
    const offendingTokens: ValidatedTokensData[] = [];
    for (let i = prevTokens.length; i < tokens.length; i++) {
      offendingTokens.push(tokens[i]);
    }
    console.log(ValidationError.MULTIPLE_TOKENS, offendingTokens);
    errorCount++;
  }
  return errorCount;
}

export function validMintAddress(tokens: ValidatedTokensData[]): number {
  let errorCount = 0;

  tokens.forEach((token, i) => {
    try {
      // will fail if mint address is not valid base58
      // a mint doesn't have to be on the edd25519 curve though
      const _ = new PublicKey(token.Mint)
    } catch (error) {
      console.log(ValidationError.INVALID_MINT, `(line ${token.Line})`, token, error);
      errorCount++;
    }
  });
  return errorCount;
}

export function validDecimals(tokens: ValidatedTokensData[]): number {
  let errorCount = 0;
  tokens.forEach((token) => {
    if (isNaN(Number(token.Decimals)) || Number(token.Decimals) < 0 || Number(token.Decimals) > 9) {
      console.log(ValidationError.INVALID_DECIMALS, token);
      errorCount++;
    }
  });
  return errorCount;
}

export function areRecordsEqual(r1: ValidatedTokensData, r2: ValidatedTokensData): boolean {
  return (
    r1.Name === r2.Name &&
    r1.Symbol === r2.Symbol &&
    r1.Mint === r2.Mint &&
    r1.Decimals === r2.Decimals &&
    r1.LogoURI === r2.LogoURI &&
    r1["Community Validated"] === r2["Community Validated"]
  );
}

// this function only works properly if there are no duplicate mints
export function noEditsToPreviousLinesAllowed(prevTokens: ValidatedTokensData[], tokens: ValidatedTokensData[]): number {
  let errorCount = 0;
  const map = new Map();
  prevTokens.forEach((token) => {
    map.set(token.Mint, token)
  })

  tokens.forEach((token) => {
    const prevToken = map.get(token.Mint);
    if (prevToken !== undefined) {
      // if prevToken is undefined, this means that the new file has a token that
      // the older one didn't. that's completely normal
      if (!areRecordsEqual(prevToken, token)) {
        console.log(ValidationError.CHANGES_DISCOURAGED, prevToken, token)
        errorCount++;
      }
    }
  })
  return errorCount;
}

export function isCommunityValidated(tokens: ValidatedTokensData[]): number {
  let errorCount = 0;
  let allowedNotCommunityValidatedAsMap = new Map();
  allowedNotCommunityValidated.forEach((e) => {
    allowedNotCommunityValidatedAsMap.set(e.Mint, e)
  });

  tokens.forEach((token, i) => {
    if (token["Community Validated"] !== true && !allowedNotCommunityValidatedAsMap.has(token.Mint)) {
      console.log(ValidationError.INVALID_COMMUNITY_VALIDATED, `(line ${indexToLineNumber(i)})`, token);
      errorCount++;
    }
  });

  return errorCount;
}
