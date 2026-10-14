const OPEN_MODAL_SELECTOR =
  "[data-radix-popper-content-wrapper],[role='dialog'],[role='alertdialog'],[role='menu']";

export function releaseStuckBodyPointerEvents(doc: Document = document): void {
  if (doc.body.style.pointerEvents !== "none") return;
  if (doc.querySelector(OPEN_MODAL_SELECTOR)) return;
  doc.body.style.pointerEvents = "";
}
