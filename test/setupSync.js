import 'fake-indexeddb/auto';

// JSDOM 不提供原生 dialog 方法，仅补齐测试环境接口。
for (const method of ['showModal', 'close']) {
  if (!HTMLDialogElement.prototype[method]) {
    Object.defineProperty(HTMLDialogElement.prototype, method, {
      configurable: true, writable: true, value() {},
    });
  }
}
