import * as fs from 'fs';
import * as yaml from 'js-yaml';
import prettier from 'prettier';

interface TypeDefObjectBase {
  type: string;
}
interface StringTypeDef extends TypeDefObjectBase {
  type: 'string';
}

interface BooleanTypeDef extends TypeDefObjectBase {
  type: 'boolean';
}

interface IntegerTypeDef extends TypeDefObjectBase {
  type: 'integer';
  signed: boolean;
}

interface RealTypeDef extends TypeDefObjectBase {
  type: 'real';
}

interface ListTypeDef extends TypeDefObjectBase {
  type: 'list';
  separator: string;
  ordered: boolean;
  unique: boolean;
  'member-values': ValSpec;
}

interface ConditionalTypeDef extends TypeDefObjectBase {
  when: string;
  values: ValSpec;
}

type TypeDefObject = TypeDefObjectBase | StringTypeDef | BooleanTypeDef | IntegerTypeDef | RealTypeDef | ListTypeDef;

type ValDef = string | TypeDefObject | ConditionalTypeDef;
type ValSpec = ValDef | ValSpec[];

const isTypeDefObject = (what: ValSpec): what is TypeDefObjectBase => {
  return typeof what === 'object' && !Array.isArray(what) && (what as TypeDefObjectBase).type !== undefined;
};

const isConditional = (what: ValSpec): what is ConditionalTypeDef => {
  return typeof what === 'object' && !Array.isArray(what) && (what as ConditionalTypeDef).when !== undefined;
};

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

interface ElemIFace {
  attributes: Record<string, AttributeDetails>;
  events: Record<string, EventDetails>;
}

interface ElemDetails extends EntityDetails, ElemIFace {
  description: string;
  ref: string;
  interface: string;
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

const bakeValueSpec = (spec: ValSpec): string => {
  let useWildcard = false;
  const types = new Set<string>();
  const enums = new Set<string>();
  const todo = [spec];

  while (todo.length > 0) {
    const current = todo.pop()!;
    if (typeof current === 'string') {
      if (current.startsWith('/') && current.endsWith('/')) {
        // For now, the presence of a regex leads to adding a string wildcard
        useWildcard = true;
      } else {
        enums.add(`"${current}"`);
      }
    } else if (Array.isArray(current)) {
      todo.push(...current);
    } else if (isConditional(current)) {
      todo.push(current.values);
    } else if (isTypeDefObject(current)) {
      switch (current.type) {
        case 'string':
          useWildcard = true;
          break;
        case 'boolean':
          types.add('boolean');
          break;
        case 'integer':
        case 'real':
          types.add('number');
          break;
        case 'list':
          useWildcard = true;
          break;
        default:
          throw new Error(`Unknown value type: ${current.type}`);
      }
    } else {
      throw new Error(`Undecipheral values: ${current}`);
    }
  }

  const members = [...types.keys(), ...enums.keys()];
  if (useWildcard) {
    if (members.length === 0) {
      // If it's wildcard and nothing else...
      return 'string';
    } else {
      members.push('({} & string)');
    }
  }
  return members.join(' | ');
};

const bakeAttribsType = (elemDetails: ElemIFace, interfaceName: string): string => {
  let result = '';
  result += '{\n';

  const attribNames = Object.keys(elemDetails.attributes).sort();
  const eventNames = Object.keys(elemDetails.events).sort();

  for (const name of attribNames) {
    const details = elemDetails.attributes[name];
    if (name.startsWith('on')) {
      throw new Error(`We currently assume that no attribute starts with "on", ${name} breaks this assumption`);
    }
    result += `  /** ${details.description}\n`;
    result += `  *\n`;
    result += `  * @see ${details.ref}\n`;
    result += `  */\n`;
    result += `  "${name}"?: ` + bakeValueSpec(details.values) + ';\n\n';
  }

  for (const name of eventNames) {
    const details = elemDetails.events[name];
    result += `  /** ${details.description}\n`;
    result += `  *\n`;
    result += `  * @see ${details.ref}\n`;
    result += `  */\n`;
    result += `  "on${name}"?: EventHandler<${interfaceName}, ${details.interface}>;\n\n`;
  }
  result += '}';
  return result;
};

const nonTrivialAttribs = (elemName: string, spec: DomDef) => {
  return (
    Object.keys(spec.elements[elemName].events).length > 0 || Object.keys(spec.elements[elemName].attributes).length > 0
  );
};
const attribTypeName = (elemName: string, spec: DomDef) => {
  if (nonTrivialAttribs(elemName, spec)) {
    return `${elemName}Attribs`;
  }

  return `GlobalAttributes<${spec.elements[elemName].interface}>`;
};

const produceMainFile = (spec: DomDef, globals: ElemIFace): string => {
  let result = '';
  const attribTypes: Record<string, string> = {};
  const factories: Record<string, string> = {};

  for (const [elemName, elemDetails] of Object.entries(spec.elements)) {
    attribTypes[elemName] = bakeAttribsType(elemDetails, elemDetails.interface);
    factories[elemName] = `elementFactory<HTMLElement, ${attribTypeName(
      elemName,
      spec
    )}>(domNamespace, '${elemName}');`;
  }

  result += "import { EventHandler, create as domCreate } from './';\n\n";
  result += `export const domNamespace = "${spec.namespace}";\n\n`;

  result += `type GlobalAttributes<IFace extends HTMLElement> = ${bakeAttribsType(globals, 'IFace')};\n\n`;

  for (const [elemName, v] of Object.entries(attribTypes)) {
    if (nonTrivialAttribs(elemName, spec)) {
      result += `/** Attributes for the ${elemName} element */\n`;
      result += `export type ${attribTypeName(elemName, spec)} = GlobalAttributes<${
        spec.elements[elemName].interface
      }> & ${v};\n\n`;
    }
  }

  result += '\n';
  result += 'export type ElementAttribsMap = {\n';
  for (const [elemName, _] of Object.entries(attribTypes)) {
    result += `  "${elemName}": ${attribTypeName(elemName, spec)};\n`;
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
    result += `export const ${dereserveName(
      elemName
    )} = (attribs: ElementAttribsMap['${elemName}'], ...childs: Child[]) => create('${elemName}', attribs, ...childs);\n\n`;
  }
  return result;
};

const dedupe = (cache: Record<string, unknown>, candidate: Record<string, unknown>) => {
  const keysToRemove: string[] = [];
  for (const [k, v] of Object.entries(cache)) {
    if (!(k in candidate) || JSON.stringify(v) !== JSON.stringify(candidate[k])) {
      keysToRemove.push(k);
    }
  }

  for (const k of keysToRemove) {
    delete cache[k];
  }
};
const preprocessSpec = (spec: DomDef): ElemIFace => {
  const cache: ElemIFace = {
    attributes: {},
    events: {},
  };

  let first = true;
  for (const elem of Object.values(spec.elements)) {
    if (first) {
      cache.attributes = { ...elem.attributes };
      cache.events = { ...elem.events };
    } else {
      dedupe(cache.attributes, elem.attributes);
      dedupe(cache.events, elem.events);
    }
  }

  for (const elem of Object.values(spec.elements)) {
    for (const k of Object.keys(cache.attributes)) {
      delete elem.attributes[k];
    }
    for (const k of Object.keys(cache.events)) {
      delete elem.events[k];
    }
  }

  return cache;
};

const main = async () => {
  const prettierConfig = await prettier.resolveConfig(htmlCodeFile);
  if (!prettierConfig) {
    throw new Error('failed to find prettier config');
  }
  const html = await loadSpec(htmlSpecFile);
  const globals = preprocessSpec(html);
  const unformatted = produceMainFile(html, globals);
  const formatted = prettier.format(unformatted, { ...prettierConfig, filepath: htmlCodeFile });

  await fs.promises.writeFile(htmlCodeFile, formatted, 'utf-8');
};

main();

export {};
