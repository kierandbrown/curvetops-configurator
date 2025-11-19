// Minimal ambient declarations for Three.js exporters so TypeScript can compile
// without pulling in the full examples typings.
declare module 'three/examples/jsm/exporters/GLTFExporter' {
  export class GLTFExporter {
    parse(
      input: any,
      onCompleted: (result: ArrayBuffer | object) => void,
      options?: Record<string, unknown>
    ): void;
  }
}

declare module 'three/examples/jsm/exporters/STLExporter' {
  export class STLExporter {
    parse(scene: any, options?: Record<string, unknown>): string | ArrayBuffer;
  }
}

declare module 'three/examples/jsm/exporters/OBJExporter' {
  export class OBJExporter {
    parse(scene: any): string;
  }
}
