/// <reference types="vite/client" />

declare module "*?worker" {
  const workerFactory: {
    new (): Worker;
  };
  export default workerFactory;
}

declare module "*?worker&inline" {
  const workerFactory: {
    new (): Worker;
  };
  export default workerFactory;
}

declare module "*?worker&url" {
  const workerUrl: string;
  export default workerUrl;
}

declare module "*?raw" {
  const content: string;
  export default content;
}
