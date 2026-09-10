import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS, parseDevFlags } from "../src/dev/flags";

describe("parseDevFlags", () => {
  it("defaults to a debate round and no tier override, with no flags set", () => {
    expect(parseDevFlags({})).toEqual(DEFAULT_FLAGS);
  });

  it("maps ?round= by number, SPEC §2.1", () => {
    expect(parseDevFlags({ round: "0" }).round).toBe("trigger");
    expect(parseDevFlags({ round: "3" }).round).toBe("fight");
  });

  it("falls back rather than throwing on nonsense", () => {
    expect(parseDevFlags({ round: "9" }).round).toBe(DEFAULT_FLAGS.round);
    expect(parseDevFlags({ tier: "uppercut" }).tier).toBe(DEFAULT_FLAGS.tier);
  });

  it("leaves ?tier unset unless it names a real tier — the deal is one of each", () => {
    expect(parseDevFlags({}).tier).toBeUndefined();
    expect(parseDevFlags({ tier: "haymaker" }).tier).toBe("haymaker");
  });

  it("treats a bare flag, =1 and =true as on", () => {
    expect(parseDevFlags({ bot: "" }).bot).toBe(true);
    expect(parseDevFlags({ bot: "1" }).bot).toBe(true);
    expect(parseDevFlags({ bot: "true" }).bot).toBe(true);
    expect(parseDevFlags({ bot: "0" }).bot).toBe(false);
    expect(parseDevFlags({ bot: "false" }).bot).toBe(false);
    // The ghost is the default since #7 — a bare URL plays the real game, and
    // an idle opponent has to be asked for.
    expect(parseDevFlags({}).bot).toBe(true);
  });

  it("takes the first value when a flag is repeated", () => {
    expect(parseDevFlags({ round: ["2", "3"] }).round).toBe("roast");
  });
});
