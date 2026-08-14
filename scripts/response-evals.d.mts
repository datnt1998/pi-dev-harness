// Type surface for the untyped eval-harness core under test. The implementation is
// plain ESM with no type annotations; these tests exercise it against loose contracts.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const DIMENSIONS: string[];
export const WEIGHTS: Record<string, number>;
export const CONDITIONS: string[];
export const SPLIT_VALUES: string[];
export const CATEGORIES: string[];
export const PROVENANCE_FIELDS: string[];
export const FORBIDDEN_PROMPT_PHRASES: string[];
export const MANIFEST_VERSION: number;
export const JUDGE_PROVENANCE_FIELDS: string[];
export function parseJsonl(text: string, label?: string): any[];
export function responseSha256(response: any): string;
export function canonicalJson(value: any): string;
export function validateCases(cases: any, options?: { requireCoverage?: boolean }): any;
export function planMatrix(cases: any, trials: number): any[];
export function buildManifest(cases: any, trials: number, digests: { casesDigest?: string; rubricDigest?: string }): any;
export function verifyManifest(manifest: any): string[];
export function validateEvidence(evidence: any, oracle: any, label?: string): any;
export function blindResponses(responses: any[], options?: { manifest?: any; rng?: any }): any;
export function scoreEvaluation(input: {
  judgments?: any;
  key?: any;
  responses?: any;
  samples?: any;
  judge?: any;
  manifest?: any;
}): any;
export function verifyPackagedPin(manifest: any): string[];
export function verifyPackagedMatrix(manifest: any): string[];
export function main(argv: string[]): any;
