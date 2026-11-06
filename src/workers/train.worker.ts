export interface TrainWorkerMessage {
  type: 'PING';
}

self.onmessage = (event: MessageEvent<TrainWorkerMessage>) => {
  if (event.data.type === 'PING') {
    self.postMessage({ type: 'PONG' });
  }
};

