import './isometric/vale.css';
import { Client } from './isometric/client';
import { LoadingScreen } from './isometric/loadingScreen';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const interfaceRoot = document.querySelector<HTMLElement>('#ui')!;
const loading = new LoadingScreen(document.querySelector('#loading-screen')!, [canvas, interfaceRoot]);
loading.show('Loading Bellwether Vale');
async function boot() {
  const client = new Client(canvas, interfaceRoot, loading);
  await client.init();
  Object.defineProperty(window, 'tervain', { value: client, configurable: true });
  loading.hide();
}
void boot().catch((error: unknown) => loading.fail(error));
