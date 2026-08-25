import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS, parseDevFlags } from "../src/dev/flags";

describe("parseDevFlags", () => {
  it("defaults to a debate haymaker with no flags set", () => {
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

  it("treats a bare flag, =1 and =true as on", () => {
    expect(parseDevFlags({ bot: "" }).bot).toBe(true);
    expect(parseDevFlags({ bot: "1" }).bot).toBe(true);
    expect(parseDevFlags({ bot: "true" }).bot).toBe(true);
    expect(parseDevFlags({ bot: "0" }).bot).toBe(false);
  });

  it("takes the first value when a flag is repeated", () => {
    expect(parseDevFlags({ round: ["2", "3"] }).round).toBe("roast");
  });
});
