const { parentPort, workerData } = require('node:worker_threads');
require('./archive.cjs')
  .extractLocal(workerData.file, workerData.dir, (progress) => parentPort.postMessage({ progress }))
  .then(
    () => parentPort.postMessage({ done: true }),
    (error) => parentPort.postMessage({ error: error.message }),
  );
