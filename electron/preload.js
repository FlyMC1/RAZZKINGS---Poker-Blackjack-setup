import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('razzkings', {
  version: '0.1.0',
});