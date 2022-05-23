import * as dom from '../src'
import * as html from '../src/html'

beforeEach(() => {
  dom.setActiveDocument(document);
});

afterEach(() => {
  dom.setActiveDocument(null);
});

test('Instantiates expected interface', () => {
  const div = html.div({});
  expect(div instanceof HTMLDivElement).toBeTruthy();
});

test('Assigns attributes', () => {
  const anchor = html.a({
    href: "http://example.com/",
    "class": "bozo"
  });
  expect(anchor.href).toBe("http://example.com/");
  expect(anchor.className).toBe("bozo");
});

test('Populates children', () => {
  const tree = html.div({},
    html.p({}, "hello"),
    html.a({}, "a link"),
  );
  expect(tree.childElementCount).toBe(2);
  expect(tree.children[0] instanceof HTMLParagraphElement).toBeTruthy();
  expect(tree.children[0].textContent).toBe("hello");

  expect(tree.children[1] instanceof HTMLAnchorElement).toBeTruthy();
  expect(tree.children[1].textContent).toBe("a link");
});



export {}