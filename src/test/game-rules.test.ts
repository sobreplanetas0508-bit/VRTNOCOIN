import { describe, expect, it } from "vitest";
import { normalizeTimerSpeed, playerTags, ROOM_MAX_PLAYERS, ROOM_MIN_PLAYERS } from "@/game/rules";

describe("player tags", () => {
  it("shows INFLUENCER🔥 for influencers", () => {
    expect(playerTags({ influencer: true })).toEqual(["INFLUENCER🔥"]);
  });
  it("shows DONO DO JOGO🔥 for the owner", () => {
    expect(playerTags({ owner: true, influencer: true })).toEqual(["DONO DO JOGO🔥"]);
  });
  it("shows nothing for regular players", () => {
    expect(playerTags({})).toEqual([]);
  });
});

describe("rooms", () => {
  it("hold from 2 to 10 players", () => {
    expect(ROOM_MIN_PLAYERS).toBe(2);
    expect(ROOM_MAX_PLAYERS).toBe(10);
  });
});

describe("timer speed", () => {
  it("accepts 2x", () => {
    expect(normalizeTimerSpeed(2)).toBe(2);
  });
  it("accepts 3x, 4x and 5x", () => {
    expect(normalizeTimerSpeed(3)).toBe(3);
    expect(normalizeTimerSpeed(4)).toBe(4);
    expect(normalizeTimerSpeed(5)).toBe(5);
  });
  it("accepts 10x up to 50x", () => {
    for (const s of [10, 20, 30, 40, 50]) expect(normalizeTimerSpeed(s)).toBe(s);
  });
  it("falls back to 1x for unknown speeds", () => {
    expect(normalizeTimerSpeed(60)).toBe(1);
    expect(normalizeTimerSpeed(6)).toBe(1);
  });
});
