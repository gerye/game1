// 后台心跳 Worker — 不受 Chrome 后台节流
// 当主线程 tab 不在前台时，提供稳定的 ~60fps 心跳驱动模拟推进
let intervalId = null;
self.onmessage = (e) => {
  if (e.data === 'start') {
    if (intervalId !== null) return;
    intervalId = setInterval(() => self.postMessage('tick'), 16);
  } else if (e.data === 'stop') {
    clearInterval(intervalId);
    intervalId = null;
  }
};
