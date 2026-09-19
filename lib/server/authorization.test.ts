import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyIdToken = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({ adminAuth: () => ({ verifyIdToken }) }));
import { requireRole } from "./authorization";

describe("server-side role authorization", () => {
  beforeEach(() => verifyIdToken.mockReset());
  it("rejects a request without a Firebase bearer token", async () => {
    await expect(requireRole(new Request("http://localhost") as never, ["receptionist"])).rejects.toThrow("Unauthenticated");
  });
  it("rejects a valid user whose server claim lacks the permitted role", async () => {
    verifyIdToken.mockResolvedValue({ uid: "p1", role: "pharmacist" });
    await expect(requireRole(new Request("http://localhost", { headers: { Authorization: "Bearer token" } }) as never, ["doctor"])).rejects.toThrow("Permission denied");
  });
  it("returns the trusted doctor assignment from verified claims", async () => {
    verifyIdToken.mockResolvedValue({ uid: "d1", role: "doctor", doctorId: "d-mehta" });
    await expect(requireRole(new Request("http://localhost", { headers: { Authorization: "Bearer token" } }) as never, ["doctor"])).resolves.toEqual({ uid: "d1", role: "doctor", doctorId: "d-mehta" });
  });
});
