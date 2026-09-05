import prompts from "./prompts.json";

/** The Hinge prompts a profile may be built from. Both the generator
 *  (scripts/generate-profiles.mjs) and the write-a-profile form read this
 *  same list, so a written profile and a generated one are interchangeable. */
export const PROMPT_BANK: string[] = prompts;
