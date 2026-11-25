import './isometric/vale.css';
import { Client } from './isometric/client';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const interfaceRoot = document.querySelector<HTMLElement>('#ui')!;
const client = new Client(canvas, interfaceRoot);
client.init().then(() => {
  Object.defineProperty(window, 'tervain', { value: client, configurable: true });
}).catch((err: unknown) => {
  console.error(err);
  interfaceRoot.textContent = 'Tervain could not load the valley. Reload to try again.';
});
