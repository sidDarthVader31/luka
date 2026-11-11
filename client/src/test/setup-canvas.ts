// jsdom has no 2D canvas. Excalidraw only needs text measurement and a few no-op calls
// when converting element skeletons, so a small stub is enough for unit tests.
const context = new Proxy(
  {
    measureText: (text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 4,
    }),
    filter: "none",
    font: "",
  },
  {
    get(target, key) {
      if (key in target) {
        return target[key as keyof typeof target];
      }
      return () => undefined;
    },
    set(target, key, value) {
      (target as Record<string | symbol, unknown>)[key] = value;
      return true;
    },
  },
);

HTMLCanvasElement.prototype.getContext = (() => context) as never;

// jsdom also lacks the CSS Font Loading API, which Excalidraw registers its fonts with.
class FontFaceStub {
  family: string;
  status = "loaded";
  constructor(family: string) {
    this.family = family;
  }
  load() {
    return Promise.resolve(this);
  }
}
globalThis.FontFace = FontFaceStub as never;
Object.defineProperty(document, "fonts", {
  value: {
    add: () => undefined,
    load: () => Promise.resolve([]),
    check: () => true,
    ready: Promise.resolve(),
  },
});
