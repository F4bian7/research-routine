// Native builds have no file support yet; the web build uses files.web.ts.
export async function saveFile(_name: string, _type: string, _data: string | Uint8Array): Promise<void> {}

export async function pickTextFile(_accept: string): Promise<string | null> {
  return null;
}

export const filesSupported = false;
