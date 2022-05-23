let activeDocument: Document;
/**
 * Sets the document in which new dom elements are created.
 * @param doc The document to make active.
 */
export const setActiveDocument = (doc: Document) => {
  activeDocument = doc;
};

export type AttribSet = Record<string, unknown>;
export type Child = Element | string;
export type Factory<IFace extends Element, Attrs extends AttribSet> = (attribs: Attrs, ...rest: Child[]) => IFace;

/**
 * Instantiates a dom element in the current active document.
 *
 * @param ns dom element namespace
 * @param elemName name of the dom element
 * @param attribs attributes to set on the new dom element
 * @param childs children to assing to the new dom element
 * @returns The new dom element.
 */
export const create = <IFace extends Element>(
  ns: string,
  elemName: string,
  attribs: AttribSet,
  ...childs: Child[]
): IFace => {
  const newElem = activeDocument.createElementNS(ns, elemName) as IFace;

  for (const [key, value] of Object.entries(attribs)) {
    newElem.setAttribute(key, (value as { toString(): string }).toString());
  }

  newElem.append(...childs);

  return newElem;
};

/**
 * Creates a factory that has certain attributes pre-set
 *
 * @param factory The factory to customize
 * @param setAttribs Attributes that are set
 * @returns The new factory
 */
export const customize =
  <IFace extends Element, Attrs extends AttribSet>(factory: Factory<IFace, Attrs>, setAttribs: Attrs) =>
  (attribs: Attrs, ...childs: Child[]) =>
    factory(Object.assign({}, setAttribs, attribs), ...childs);
