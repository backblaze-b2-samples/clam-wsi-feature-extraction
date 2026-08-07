import { describe, expect, it } from "vitest";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config";

describe("app identity", () => {
  it("ships the app name and description", () => {
    expect(APP_NAME).toBe("CLAM WSI Feature Extraction");
    expect(APP_DESCRIPTION).toBe(
      "Whole-slide-image feature extraction on Backblaze B2 — tile, segment, and embed gigapixel pathology slides."
    );
  });
});
