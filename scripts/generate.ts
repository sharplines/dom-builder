import * as fs from 'fs';
import * as yaml from 'js-yaml';
import prettier from 'prettier';

type StringTypeDef = {
  type: 'string';
};

type BooleanTypeDef = {
  type: 'boolean';
};

type IntegerTypeDef = {
  type: 'integer';
  signed: boolean;
};

type RealTypeDef = {
  type: 'real';
};

type ListTypeDef = {
  type: 'list';
  separator: string;
  ordered: boolean;
  unique: boolean;
  'member-values': ValSpec;
};

type ValDef = string | StringTypeDef | BooleanTypeDef | IntegerTypeDef | RealTypeDef | ListTypeDef;
type ValSpec = ValDef | ValDef[];

interface EntityDetails {
  description: string;
  ref: string;
}

interface AttributeDetails extends EntityDetails {
  values: ValSpec;
}

interface EventDetails extends EntityDetails {
  interface: string;
}

interface ElemDetails extends EntityDetails {
  description: string;
  ref: string;
  interface: string;
  attributes: Record<string, AttributeDetails>;
  events: Record<string, EventDetails>;
}

interface DomDef {
  namespace: string;
  version: {
    ref: string;
    pubdate: string;
  };

  elements: Record<string, ElemDetails>;
}

const htmlSpecFile = 'machine-standards/dom/html.yaml';
const htmlCodeFile = 'src/html.ts';

const loadSpec = async (specFile: string) => {
  return yaml.load(await fs.promises.readFile(specFile, 'utf-8')) as DomDef;
};

const isReserved = (name: string) => {
  return ['var', 'class'].includes(name);
};

const dereserveName = (name: string) => {
  return isReserved(name) ? `${name}_` : name;
};

const bakeValueSpec = (_: ValSpec): string => {
  return 'string';
};

const bakeAttribsType = (elemDetails: ElemDetails): string => {
  let result = '';
  result += '{\n';
  for (const [name, details] of Object.entries(elemDetails.attributes)) {
    if(name.startsWith('on')) {
      throw new Error(`We currently assume that no attribute starts with "on", ${name} breaks this assumption`);
    }
    result += `  /** ${details.description}\n`;
    result += `  *\n`;
    result += `  * @see ${details.ref}\n`;
    result += `  */\n`;
    result += `  "${name}"?: ` + bakeValueSpec(details.values) + ';\n\n';
  }

  for (const [name, details] of Object.entries(elemDetails.events)) {
    result += `  /** ${details.description}\n`;
    result += `  *\n`;
    result += `  * @see ${details.ref}\n`;
    result += `  */\n`;
    result += `  "on${name}"?: EventHandler<${elemDetails.interface}, ${details.interface}>;\n\n`;
  }
  result += '}';
  return result;
};

const attribTypeName = (elemName: string) => `${elemName}Attribs`;

const produceMainFile = (spec: DomDef): string => {
  let result = '';
  const attribTypes: Record<string, string> = {};
  const factories: Record<string, string> = {};

  for (const [elemName, elemDetails] of Object.entries(spec.elements)) {
    attribTypes[elemName] = bakeAttribsType(elemDetails);
    factories[elemName] = `elementFactory<HTMLElement, ${attribTypeName(elemName)}>(domNamespace, '${elemName}');`;
  }

  result += "import { EventHandler, create as domCreate } from './';\n\n";
  result += `export const domNamespace = "${spec.namespace}";\n\n`;

  for (const [elemName, v] of Object.entries(attribTypes)) {
    result += `/** Attributes for the ${elemName} element */\n`;
    result += `export type ${attribTypeName(elemName)} = ${v};\n\n`;
  }

  result += '\n';
  result += 'export type ElementAttribsMap = {\n';
  for (const [elemName, _] of Object.entries(attribTypes)) {
    result += `  "${elemName}": ${attribTypeName(elemName)};\n`;
  }
  result += '}\n\n';

  result += 'export type ElementInterfaceMap = {\n';
  for (const [elemName, v] of Object.entries(spec.elements)) {
    result += `  "${elemName}": ${v.interface};\n`;
  }
  result += '}\n\n';

  result += `export type Child = string | Element;\n\n`;

  result += `export const create = <Name extends keyof ElementInterfaceMap>(
    elemName: Name, 
    attribs: ElementAttribsMap[Name], 
    ...childs: Child[]) : ElementInterfaceMap[Name] => domCreate(domNamespace, elemName, attribs, ...childs);\n\n`;

  for (const [elemName, _] of Object.entries(factories)) {
    result += `/** ${spec.elements[elemName].description}\n`;
    result += `* @see ${spec.elements[elemName].ref}\n`;
    result += `*/\n`;
    result += `export const ${dereserveName(elemName)} = (attribs: ${attribTypeName(
      elemName
    )}, ...childs: Child[]) => create('${elemName}', attribs, ...childs);\n\n`;
  }
  return result;
};

const main = async () => {
  const prettierConfig = await prettier.resolveConfig(htmlCodeFile);
  if(!prettierConfig) {
    throw new Error("failed to find prettier config")
  }
  const html = await loadSpec(htmlSpecFile);
  const unformatted = produceMainFile(html);
  const formatted = prettier.format(unformatted, {...prettierConfig, filepath: htmlCodeFile});

  await fs.promises.writeFile(htmlCodeFile, formatted, 'utf-8');
};

main();

export {};
