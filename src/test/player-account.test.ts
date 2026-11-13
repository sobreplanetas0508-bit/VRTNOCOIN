import { describe, expect, it } from "vitest";
import { usernameToEmail, validateRegistration } from "@/lib/player-account";
import { SKINS } from "@/game/skins";

describe("nickname accounts", () => {
  it("maps a nickname to the same sign-in address regardless of letter case", () => {
    expect(usernameToEmail("Corredor_99")).toBe(usernameToEmail("corredor_99"));
  });

  it("gives different nicknames different sign-in addresses", () => {
    expect(usernameToEmail("ana")).not.toBe(usernameToEmail("ana1"));
  });

  it("rejects nicknames shorter than 3 characters", () => {
    expect(validateRegistration("ab", "senha123")).not.toBeNull();
  });

  it("rejects nicknames longer than 16 characters", () => {
    expect(validateRegistration("a".repeat(17), "senha123")).not.toBeNull();
  });

  it("rejects passwords shorter than 6 characters", () => {
    expect(validateRegistration("corredor", "12345")).not.toBeNull();
  });

  it("accepts a valid nickname and password", () => {
    expect(validateRegistration("corredor_99", "senha123")).toBeNull();
  });
});

describe("character prices", () => {
  const price = (id: string) => SKINS.find((s) => s.id === id)?.price;
  it("keeps the original prices", () => {
    expect(price("palhaco")).toBe(0);
    expect(price("coringa")).toBe(150);
    expect(price("gato")).toBe(300);
    expect(price("cachorro")).toBe(500);
    expect(price("galaxia")).toBe(2000);
  });
  it("makes Superman code-only (not for sale)", () => {
    expect(price("superman")).toBeNull();
  });
});
