import { describe, expect, it } from "vitest";

import { releaseStuckBodyPointerEvents } from "./bodyPointerEvents";

function fakeDocument(modalMarkup: string): Document {
  const doc = document.implementation.createHTMLDocument("test");
  doc.body.innerHTML = modalMarkup;
  return doc;
}

describe("stuck body pointer events", () => {
  it("releases the body when a closed dialog left pointer events disabled", () => {
    const doc = fakeDocument("");
    doc.body.style.pointerEvents = "none";

    releaseStuckBodyPointerEvents(doc);

    expect(doc.body.style.pointerEvents).toBe("");
  });

  it("keeps pointer events disabled while another layer is still open", () => {
    const doc = fakeDocument("<div role='dialog'></div>");
    doc.body.style.pointerEvents = "none";

    releaseStuckBodyPointerEvents(doc);

    expect(doc.body.style.pointerEvents).toBe("none");
  });

  it("leaves a body that never lost pointer events untouched", () => {
    const doc = fakeDocument("");

    releaseStuckBodyPointerEvents(doc);

    expect(doc.body.style.pointerEvents).toBe("");
  });
});
