import { pathToFileURL } from 'node:url';

export function invokedDirectly(moduleUrl: string, script: string | undefined = process.argv[1]): boolean {
  return script !== undefined && moduleUrl === pathToFileURL(script).href;
}
